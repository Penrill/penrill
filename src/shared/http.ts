export interface HttpRequest {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE'
  path: string
  query?: Record<string, string>
  body?: Uint8Array | string
  contentType?: string
  token?: string
}

export interface HttpResponse {
  status: number
  contentType: string
  body: Uint8Array
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']
const API_PATH = /^\/api\/[A-Za-z0-9/_-]*$/
const METHODS = new Set(['GET', 'PUT', 'POST', 'DELETE'])
const TIMEOUT_MS = 20_000

export function serverOrigin(address: string): string {
  const url = new URL(address)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.includes(url.hostname))) throw new Error('HTTPS required')
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Expected an origin')
  return url.origin
}

/** `fetchImpl`: the desktop app passes Electron's `net.fetch`, which goes through Chromium and its certificate pins. */
export async function sendHttp(origin: string, request: HttpRequest, fetchImpl: typeof fetch = fetch): Promise<HttpResponse> {
  if (!API_PATH.test(request.path) || !METHODS.has(request.method)) throw new Error('Unexpected API request')
  const url = new URL(request.path, serverOrigin(origin))
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value)
  const headers = new Headers()
  if (request.token) headers.set('Authorization', 'Bearer ' + request.token)
  if (request.contentType) headers.set('Content-Type', request.contentType)
  const body = typeof request.body === 'string' ? request.body : request.body ? new Blob([request.body as BlobPart]) : undefined
  const response = await fetchImpl(url, {
    method: request.method, headers, body,
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  return { status: response.status, contentType: response.headers.get('content-type') ?? '', body: new Uint8Array(await response.arrayBuffer()) }
}
