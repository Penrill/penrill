import type { Change, Op, WireItem } from '@penrill/sync/protocol'
import { PermanentError, type WireCodec } from '@penrill/sync/session'
import { isPermanent, type PenrillClient } from './api'

const HASH = /^[0-9a-f]{64}$/
const MEMORY_LIMIT = 64

interface Asset {
  hash: string
  type: string
  bytes: Uint8Array
}

let database: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('penrill-assets', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('assets')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      database = undefined
      reject(request.error)
    }
  })
}

async function cached(hash: string): Promise<string | undefined> {
  const request = (await open()).transaction('assets').objectStore('assets').get(hash)
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function remember(hash: string, dataUrl: string): Promise<void> {
  const transaction = (await open()).transaction('assets', 'readwrite')
  transaction.objectStore('assets').put(dataUrl, hash)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

function bounded<K, V>(map: Map<K, V>, key: K, value: V): V {
  map.set(key, value)
  if (map.size > MEMORY_LIMIT) map.delete(map.keys().next().value as K)
  return value
}

const digests = new Map<string, Promise<Asset>>()

function digest(src: string): Promise<Asset> {
  return digests.get(src) ?? bounded(digests, src, (async () => {
    const blob = await (await fetch(src)).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return { hash: Array.from(sum, byte => byte.toString(16).padStart(2, '0')).join(''), type: blob.type, bytes }
  })())
}

function toDataUrl(type: string, bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type }))
  })
}

const isImage = (item: WireItem) => item.type === 'image'

export function assetCodec(client: PenrillClient, board: string): WireCodec {
  const uploaded = new Set<string>()
  const loading = new Map<string, Promise<string>>()

  async function upload(src: string): Promise<string> {
    const asset = await digest(src)
    if (uploaded.has(asset.hash)) return asset.hash
    try {
      await client.uploadAsset(board, asset.hash, asset.type, asset.bytes)
    } catch (error) {
      if (isPermanent(error)) throw new PermanentError(`The image could not be stored: ${String(error)}`)
      throw error
    }
    uploaded.add(asset.hash)
    void remember(asset.hash, src).catch(() => undefined)
    return asset.hash
  }

  function download(hash: string): Promise<string> {
    return loading.get(hash) ?? bounded(loading, hash, (async () => {
      const local = await cached(hash).catch(() => undefined)
      if (local) return local
      const asset = await client.asset(board, hash)
      const dataUrl = await toDataUrl(asset.type, asset.bytes)
      void remember(hash, dataUrl).catch(() => undefined)
      uploaded.add(hash)
      return dataUrl
    })())
  }

  async function itemToWire(item: WireItem): Promise<WireItem> {
    if (!isImage(item) || typeof item.src !== 'string' || !item.src.startsWith('data:')) return item
    const { src, ...rest } = item
    return { ...rest, asset: await upload(src) }
  }

  async function itemFromWire(item: WireItem): Promise<WireItem> {
    if (!isImage(item) || typeof item.asset !== 'string' || !HASH.test(item.asset)) return item
    const { asset, ...rest } = item
    return { ...rest, src: await download(asset) }
  }

  async function mapOps(change: Change, convert: (item: WireItem) => Promise<WireItem>, from: 'src' | 'asset', to: 'src' | 'asset'): Promise<Change> {
    const ops = await Promise.all(change.ops.map(async (op): Promise<Op> => {
      if (op.op === 'put') return { op: 'put', item: await convert(op.item) }
      if (op.op !== 'patch' || typeof op.set?.[from] !== 'string') return op
      const { [from]: value, ...set } = op.set
      const converted = await convert({ id: op.id, type: 'image', [from]: value })
      return { ...op, set: { ...set, [to]: converted[to] ?? value } }
    }))
    return { ...change, ops }
  }

  return {
    encode: change => mapOps(change, itemToWire, 'src', 'asset'),
    decode: change => mapOps(change, itemFromWire, 'asset', 'src'),
    decodeItems: items => Promise.all(items.map(itemFromWire))
  }
}
