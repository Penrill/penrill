import type { Change, Op, WireItem } from '@penrill/sync/protocol'
import { PermanentError, type WireCodec } from '@penrill/sync/session'
import { isAccessError, isAuthError, isPermanent, isQuotaError, isReadOnlyError, type PenrillClient } from './api'

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
  if (typeof indexedDB === 'undefined') return undefined
  const request = (await open()).transaction('assets').objectStore('assets').get(hash)
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function remember(hash: string, dataUrl: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
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

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png'
}

function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return ''
}

function normalizeImageMime(rawType: string, bytes: Uint8Array): string {
  const clean = rawType.trim().toLowerCase()
  const aliased = MIME_ALIASES[clean] ?? clean
  if (aliased && aliased !== 'application/octet-stream') return aliased
  return sniffImageMime(bytes) || aliased || 'application/octet-stream'
}

/** Decodes a `data:` URL directly in JS without calling `fetch()`, avoiding CSP `connect-src` blocks. */
export function decodeDataUrl(src: string): { type: string; bytes: Uint8Array } {
  const comma = src.indexOf(',')
  if (!src.startsWith('data:') || comma < 0) {
    throw new PermanentError('Unsupported image data URL', 'invalid-image')
  }
  const meta = src.slice(5, comma)
  const payload = src.slice(comma + 1)
  const parts = meta.split(';').map(part => part.trim()).filter(Boolean)
  const isBase64 = parts.length > 0 && parts[parts.length - 1].toLowerCase() === 'base64'
  const rawType = parts.length > 0 && !parts[0].includes('=') && parts[0].toLowerCase() !== 'base64' ? parts[0] : ''
  let bytes: Uint8Array
  try {
    if (isBase64) {
      const bin = atob(payload.replace(/\s+/g, ''))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    }
  } catch {
    throw new PermanentError('Malformed image data URL', 'invalid-image')
  }
  return { type: normalizeImageMime(rawType, bytes), bytes }
}

const digests = new Map<string, Promise<Asset>>()

function digest(src: string): Promise<Asset> {
  const existing = digests.get(src)
  if (existing) return existing
  const pending = (async () => {
    const { type, bytes } = decodeDataUrl(src)
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
    return { hash: Array.from(sum, byte => byte.toString(16).padStart(2, '0')).join(''), type, bytes }
  })().catch(error => {
    digests.delete(src)
    throw error
  })
  return bounded(digests, src, pending)
}

function toDataUrl(type: string, bytes: Uint8Array): Promise<string> {
  if (typeof FileReader === 'undefined') {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return Promise.resolve(`data:${type};base64,${btoa(bin)}`)
  }
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
      if (isReadOnlyError(error)) throw new PermanentError(`The board is read-only: ${String(error)}`, 'read-only')
      if (isQuotaError(error)) throw new PermanentError(`Storage quota exceeded: ${String(error)}`, error.reason ?? 'quota-exceeded')
      if (isAuthError(error) || isAccessError(error)) throw error
      if (isPermanent(error)) {
        const reason = error.reason ?? (error.status === 413 ? 'asset-too-large' : error.status === 415 ? 'unsupported-media' : 'invalid')
        throw new PermanentError(`The image could not be stored: ${String(error)}`, reason)
      }
      throw error
    }
    uploaded.add(asset.hash)
    void remember(asset.hash, src).catch(() => undefined)
    return asset.hash
  }

  function download(hash: string): Promise<string> {
    const existing = loading.get(hash)
    if (existing) return existing
    const pending = (async () => {
      const local = await cached(hash).catch(() => undefined)
      if (local) return local
      const asset = await client.asset(board, hash)
      const dataUrl = await toDataUrl(asset.type, asset.bytes)
      void remember(hash, dataUrl).catch(() => undefined)
      uploaded.add(hash)
      return dataUrl
    })().catch(error => {
      loading.delete(hash)
      throw error
    })
    return bounded(loading, hash, pending)
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
