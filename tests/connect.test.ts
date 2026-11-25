// Connect links, server addresses and invite API client. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseConnectTarget, shortPin } from '../src/shared/connect.ts'
import { ApiError, isQuotaError, isReadOnlyError, PenrillClient, type Http } from '../src/renderer/src/sync/api.ts'

const PIN = 'sha256/DKcfXd3pcBnwWg0mV8ZCdAH/Kcc1XypDV7CU4Yd1ofI='

test('reads the app link a server page offers', () => {
  const link = `penrill://connect?server=${encodeURIComponent('https://192.168.0.91:5081')}&pin=${encodeURIComponent(PIN)}`
  assert.deepEqual(parseConnectTarget(link), { origin: 'https://192.168.0.91:5081', pin: PIN })
})

test('reads the web link from a QR code, with the server in the fragment', () => {
  const link = `https://penrill.com/connect#server=${encodeURIComponent('https://pi.local:5081')}&pin=${encodeURIComponent(PIN)}`
  assert.deepEqual(parseConnectTarget(link), { origin: 'https://pi.local:5081', pin: PIN })
})

test('ignores a malformed pin instead of trusting it', () => {
  assert.deepEqual(parseConnectTarget('penrill://connect?server=https%3A%2F%2Fpi.local%3A5081&pin=sha256%2Fnope'), { origin: 'https://pi.local:5081' })
})

test('a bare host means HTTPS; addresses become origins', () => {
  assert.deepEqual(parseConnectTarget(' raspberrypi.local:5081 '), { origin: 'https://raspberrypi.local:5081' })
  assert.deepEqual(parseConnectTarget('https://board.example.com/some/page'), { origin: 'https://board.example.com' })
  assert.deepEqual(parseConnectTarget('http://127.0.0.1:5081'), { origin: 'http://127.0.0.1:5081' })
})

test('refuses plain HTTP on the network and links without a server', () => {
  assert.throws(() => parseConnectTarget('http://192.168.0.91:5081'))
  assert.throws(() => parseConnectTarget('penrill://connect?pin=x'))
  assert.throws(() => parseConnectTarget('penrill://open?server=https%3A%2F%2Fa.b'))
})

test('short pin matches the server', () => {
  assert.equal(shortPin(PIN), '0CA7-1F5D-DDE9')
})

test('invite client checks and redeems invite tokens anonymously', async () => {
  const calls: { origin: string; method: string; path: string; token?: string; body?: string }[] = []
  const encoder = new TextEncoder()
  const http: Http = async (origin, req) => {
    calls.push({ origin, method: req.method, path: req.path, token: req.token, body: typeof req.body === 'string' ? req.body : undefined })
    if (req.method === 'GET' && req.path === '/api/invites/good') return { status: 204, contentType: '', body: new Uint8Array() }
    if (req.method === 'GET' && req.path === '/api/invites/gone') return { status: 404, contentType: '', body: new Uint8Array() }
    if (req.method === 'POST' && req.path === '/api/invites/good') {
      return { status: 200, contentType: 'application/json', body: encoder.encode(JSON.stringify({ name: 'ann', token: 'tok' })) }
    }
    return { status: 409, contentType: 'application/problem+json', body: encoder.encode('{}') }
  }
  const client = new PenrillClient('https://cloud.example', http, () => 'ignored-session')

  assert.equal(await client.checkInvite('good'), true)
  assert.equal(await client.checkInvite('gone'), false)
  assert.deepEqual(await client.acceptInvite('good', 'ann', 'correct horse battery'), { name: 'ann', token: 'tok' })
  await assert.rejects(() => client.acceptInvite('taken', 'ann', 'correct horse battery'), (err: unknown) => err instanceof ApiError && err.status === 409)
  assert.ok(calls.every((call) => call.token === undefined))
})

test('serverInfo parses cloud edition and capabilities while tolerating older servers', async () => {
  const encoder = new TextEncoder()
  const cloudHttp: Http = async () => ({
    status: 200,
    contentType: 'application/json',
    body: encoder.encode(JSON.stringify({
      service: 'penrill',
      name: 'Penrill Cloud',
      registration: 'invite',
      link: true,
      pin: null,
      edition: 'cloud',
      auth: ['password', 'google'],
      capabilities: {
        cloudApi: '/api/v1',
        workspaces: true,
        permissions: ['owner', 'editor', 'commenter', 'viewer'],
        versionHistory: true,
        billing: false,
        relay: true
      }
    }))
  })
  const info = await new PenrillClient('https://cloud.penrill.com', cloudHttp, () => null).serverInfo()
  assert.equal(info.edition, 'cloud')
  assert.deepEqual(info.auth, ['password', 'google'])
  assert.equal(info.capabilities?.workspaces, true)
  assert.equal(info.capabilities?.billing, false)
})

test('ApiError captures quota upgradeUrl (402) and read-only reason (403)', async () => {
  const encoder = new TextEncoder()
  const http: Http = async (_origin, req) => {
    if (req.method === 'PUT') {
      return {
        status: 402,
        contentType: 'application/problem+json',
        body: encoder.encode(JSON.stringify({
          status: 402,
          title: 'Workspace board limit reached.',
          reason: 'quota-exceeded',
          upgradeUrl: '/billing'
        }))
      }
    }
    return {
      status: 403,
      contentType: 'application/problem+json',
      body: encoder.encode(JSON.stringify({ status: 403, title: 'read-only', reason: 'read-only' }))
    }
  }
  const client = new PenrillClient('https://cloud.penrill.com', http, () => 'tok')

  await assert.rejects(
    () => client.createBoard('00112233445566778899aabbccddeeff', { title: 'Test', background: 'dots', items: [] }),
    (err: unknown) => isQuotaError(err) && err instanceof ApiError && err.reason === 'quota-exceeded' && err.upgradeUrl === '/billing'
  )
  await assert.rejects(
    () => client.submit('00112233445566778899aabbccddeeff', { id: 'c1', ops: [] }),
    (err: unknown) => isReadOnlyError(err)
  )
})
