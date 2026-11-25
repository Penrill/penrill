// Board image asset codec: CSP-safe data URL decoding, cache eviction, error classification and live session sync.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Change, ClientMessage, ServerMessage, Snapshot, WireItem } from '@penrill/sync/protocol'
import { LiveSession, PermanentError, type ConnectionEvents, type DocumentPort, type Outbox, type OutboxEntry } from '@penrill/sync/session'
import type { ViewDelta } from '@penrill/sync/replica'
import { ApiError, PenrillClient } from '../src/renderer/src/sync/api.ts'
import { assetCodec, decodeDataUrl } from '../src/renderer/src/sync/assets.ts'

// Minimal valid 1x1 PNG bytes
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
])
const PNG_B64 = Buffer.from(PNG_BYTES).toString('base64')
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const JPEG_B64 = Buffer.from(JPEG_BYTES).toString('base64')

test('decodeDataUrl decodes base64 and URL-encoded data URLs without touching fetch, normalizing MIME aliases and magic bytes', () => {
  const png = decodeDataUrl(PNG_DATA_URL)
  assert.equal(png.type, 'image/png')
  assert.deepEqual(png.bytes, PNG_BYTES)

  const jpgAlias = decodeDataUrl(`data:image/jpg;base64,${JPEG_B64}`)
  assert.equal(jpgAlias.type, 'image/jpeg')
  assert.deepEqual(jpgAlias.bytes, JPEG_BYTES)

  const sniffed = decodeDataUrl(`data:application/octet-stream;base64,${PNG_B64}`)
  assert.equal(sniffed.type, 'image/png')

  const svg = decodeDataUrl('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E')
  assert.equal(svg.type, 'image/svg+xml')
  assert.ok(new TextDecoder().decode(svg.bytes).startsWith('<svg'))
})

test('assetCodec encodes and decodes images even when globalThis.fetch rejects data: URLs (CSP connect-src regression)', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError("Refused to connect to 'data:image/png;...' because it violates CSP connect-src")
  }) as typeof fetch

  try {
    const stored = new Map<string, { type: string; bytes: Uint8Array }>()
    const client = new PenrillClient(
      'https://cloud.example.com',
      async (_origin, req) => {
        const match = req.path.match(/^\/api\/boards\/[^/]+\/assets\/([0-9a-f]{64})$/)
        assert.ok(match, `unexpected path ${req.path}`)
        const hash = match[1]
        if (req.method === 'PUT') {
          assert.ok(req.body instanceof Uint8Array)
          stored.set(hash, { type: req.contentType ?? '', bytes: req.body })
          return { status: 204, contentType: '', body: new Uint8Array() }
        }
        const entry = stored.get(hash)
        if (!entry) return { status: 404, contentType: '', body: new Uint8Array() }
        return { status: 200, contentType: entry.type, body: entry.bytes }
      },
      () => 'test-token'
    )

    const codec = assetCodec(client, '00112233445566778899aabbccddeeff')
    const localChange: Change = {
      id: 'img-1',
      ops: [{ op: 'put', item: { id: 'p1', type: 'image', z: 1, x: 0, y: 0, w: 100, h: 100, src: PNG_DATA_URL } }]
    }
    const wire = await codec.encode(localChange)
    const put = wire.ops[0]
    assert.equal(put.op, 'put')
    assert.equal('src' in put.item, false)
    assert.match(String(put.item.asset), /^[0-9a-f]{64}$/)
    assert.equal(stored.size, 1)

    // Decoding on a second codec (simulating another peer) fetches the stored bytes and reconstructs the data URL.
    const peerCodec = assetCodec(client, '00112233445566778899aabbccddeeff')
    const decoded = await peerCodec.decode(wire)
    const decodedPut = decoded.ops[0]
    assert.equal(decodedPut.op, 'put')
    assert.equal(decodedPut.item.src, PNG_DATA_URL)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('assetCodec evicts failed downloads from cache so retries succeed', async () => {
  let attempts = 0
  const hash = 'a'.repeat(64)
  const client = new PenrillClient(
    'https://cloud.example.com',
    async () => {
      attempts++
      if (attempts === 1) throw new Error('network hiccup')
      return { status: 200, contentType: 'image/png', body: PNG_BYTES }
    },
    () => 'test-token'
  )

  const codec = assetCodec(client, '00112233445566778899aabbccddeeff')
  const wireItem: WireItem = { id: 'p1', type: 'image', z: 1, asset: hash }
  await assert.rejects(() => codec.decodeItems([wireItem]), /network hiccup/)
  const [recovered] = await codec.decodeItems([wireItem])
  assert.equal(recovered.src, PNG_DATA_URL)
  assert.equal(attempts, 2)
})

test('assetCodec classifies upload errors: 401 stays transient, 402/403-readonly notify LiveSession onReject', async () => {
  const makeCodec = (status: number, reason?: string) => {
    const body = reason ? new TextEncoder().encode(JSON.stringify({ reason })) : new Uint8Array()
    const client = new PenrillClient(
      'https://cloud.example.com',
      async () => ({ status, contentType: 'application/problem+json', body }),
      () => 'test-token'
    )
    return assetCodec(client, '00112233445566778899aabbccddeeff')
  }

  const change: Change = {
    id: 'img-err',
    ops: [{ op: 'put', item: { id: 'p1', type: 'image', z: 1, src: PNG_DATA_URL } }]
  }

  // 401 must NOT be PermanentError (do not delete user's photo on expired session)
  await assert.rejects(
    () => makeCodec(401).encode(change),
    (err: unknown) => err instanceof ApiError && err.status === 401 && !(err instanceof PermanentError)
  )

  // 404 must NOT be PermanentError
  await assert.rejects(
    () => makeCodec(404).encode(change),
    (err: unknown) => err instanceof ApiError && err.status === 404 && !(err instanceof PermanentError)
  )

  // 402 surfaces PermanentError with quota-exceeded reason to LiveSession.onReject
  const rejected: string[] = []
  const items = new Map<string, WireItem>()
  const doc: DocumentPort = {
    ids: () => items.keys(),
    item: id => items.get(id),
    meta: () => ({ title: 'Board', background: 'dots' }),
    flush: () => {},
    apply: (delta: ViewDelta) => {
      for (const [id, item] of delta.items) item ? items.set(id, item) : items.delete(id)
    }
  }
  const entries: OutboxEntry[] = []
  const outbox: Outbox = {
    list: async () => entries.map(e => ({ ...e })),
    add: async c => { entries.push({ change: c, confirmed: false }) },
    confirm: async id => { for (const e of entries) if (e.change.id === id) e.confirmed = true },
    remove: async id => { const i = entries.findIndex(e => e.change.id === id); if (i >= 0) entries.splice(i, 1) }
  }
  let events!: ConnectionEvents
  const session = new LiveSession({
    transport: {
      connect: ev => {
        events = ev
        return { send: (_m: ClientMessage) => true, close: () => {} }
      }
    },
    outbox,
    codec: makeCodec(402, 'quota-exceeded'),
    document: doc,
    timers: { set: () => 1, clear: () => {}, now: () => 0, random: () => 0.5 },
    log: { info: () => {}, warn: () => {} },
    token: () => 'tok',
    onReject: reason => rejected.push(reason)
  })
  await session.start()
  events.open()
  const snap: Snapshot = { id: 'b', seq: 0, title: 'Board', background: 'dots', items: [] }
  events.message(JSON.stringify({ type: 'snapshot', board: snap } satisfies ServerMessage))
  events.message(JSON.stringify({ type: 'ready', seq: 0, peers: [] } satisfies ServerMessage))
  for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r))

  session.local(change)
  for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r))
  assert.deepEqual(rejected, ['quota-exceeded'])
  session.stop()
})
