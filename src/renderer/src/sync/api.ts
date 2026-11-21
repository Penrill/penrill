import { isSequenced, isSnapshot, type Change, type SequencedChange, type Snapshot, type WireItem } from '@penrill/sync/protocol'
import type { HttpRequest, HttpResponse } from '../../../shared/http'
import type { Account } from './accounts'

export class ApiError extends Error {
  readonly status: number
  readonly reason?: string

  constructor(status: number, reason?: string) {
    super(`HTTP ${status}${reason ? ` (${reason})` : ''}`)
    this.status = status
    this.reason = reason
  }
}

export const isAuthError = (error: unknown) => error instanceof ApiError && error.status === 401
export const isAccessError = (error: unknown) => error instanceof ApiError && (error.status === 403 || error.status === 404)
export const isPermanent = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429

export interface RemoteBoard {
  id: string
  title: string
  seq: number
  updated: string
}

export interface Community {
  folders: { id: string; name: string; owner: string }[]
  members: { folder: string; name: string }[]
  boards: (RemoteBoard & { folder: string })[]
  templates: { id: string; name: string; author: string; folder: string }[]
}

export interface BoardContent {
  title: string
  background: string
  items: WireItem[]
}

/** What `GET /api/server` tells before signing in. Older servers do not have it. */
export interface ServerInfo {
  service: string
  name: string
  registration: 'open' | 'invite'
  /** Device linking is supported. */
  link: boolean
  pin: string | null
}

export interface LinkStart {
  deviceCode: string
  userCode: string
  verifyUrl: string
  verifyUrlComplete: string
  expiresIn: number
}

export type LinkPoll = { status: 'approved'; account: Account } | { status: 'pending' | 'denied' | 'expired' }

export type Http = (origin: string, request: HttpRequest) => Promise<HttpResponse>

const decoder = new TextDecoder()
const isRemoteBoard = (row: unknown): row is RemoteBoard => {
  const value = row as RemoteBoard
  return !!value && typeof value.id === 'string' && typeof value.title === 'string' && Number.isSafeInteger(value.seq) && typeof value.updated === 'string'
}

export class PenrillClient {
  readonly origin: string
  private readonly http: Http
  private readonly token: () => string | null

  constructor(origin: string, http: Http, token: () => string | null) {
    this.origin = origin
    this.http = http
    this.token = token
  }

  signIn(name: string, password: string, register: boolean): Promise<Account> {
    return this.json({ method: 'POST', path: register ? '/api/register' : '/api/login', ...jsonBody({ name, password }) }, false)
  }

  async serverInfo(): Promise<ServerInfo> {
    const info = await this.json<ServerInfo>({ method: 'GET', path: '/api/server' }, false)
    if (info?.service !== 'penrill') throw new Error('Not a Penrill server')
    return info
  }

  startLink(device: string, app: string): Promise<LinkStart> {
    return this.json({ method: 'POST', path: '/api/link/start', ...jsonBody({ device, app }) }, false)
  }

  /** Long poll: the server answers as soon as the person decides, or after a few seconds with "pending". */
  async pollLink(deviceCode: string): Promise<LinkPoll> {
    try {
      const response = await this.call({ method: 'POST', path: '/api/link/poll', ...jsonBody({ deviceCode }) }, false)
      if (response.status === 202) return { status: 'pending' }
      const linked = JSON.parse(decoder.decode(response.body)) as Account
      if (typeof linked?.name !== 'string' || typeof linked.token !== 'string') throw new Error('Unsupported server')
      return { status: 'approved', account: { name: linked.name, token: linked.token } }
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) return { status: 'denied' }
      if (error instanceof ApiError && error.status === 410) return { status: 'expired' }
      throw error
    }
  }

  /** Which device waits under this code; null when none does (any more). */
  async describeLink(code: string): Promise<{ code: string; device: string; app: string; address: string } | null> {
    try {
      return await this.json({ method: 'GET', path: `/api/link/${encodeURIComponent(code.replace(/[^A-Za-z]/g, ''))}` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }

  async decideLink(code: string, allow: boolean): Promise<boolean> {
    try {
      await this.call({ method: 'POST', path: `/api/link/${encodeURIComponent(code.replace(/[^A-Za-z]/g, ''))}`, ...jsonBody({ allow }) })
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return false
      throw error
    }
  }

  async signOut(): Promise<void> {
    await this.call({ method: 'POST', path: '/api/logout' })
  }

  async boards(): Promise<RemoteBoard[]> {
    const rows = await this.json<unknown>({ method: 'GET', path: '/api/boards' })
    if (!Array.isArray(rows) || !rows.every(isRemoteBoard)) throw new Error('Unsupported server')
    return rows
  }

  createBoard(id: string, content: BoardContent): Promise<{ seq: number; created: boolean }> {
    return this.json({ method: 'PUT', path: `/api/boards/${id}`, ...jsonBody(content) })
  }

  async snapshot(id: string): Promise<Snapshot> {
    const board = await this.json<unknown>({ method: 'GET', path: `/api/boards/${id}` })
    if (!isSnapshot(board)) throw new Error('Unsupported server')
    return board
  }

  async changesAfter(id: string, after: number): Promise<{ seq: number; changes: SequencedChange[] } | null> {
    try {
      const result = await this.json<{ seq: number; changes: unknown[] }>({ method: 'GET', path: `/api/boards/${id}/changes`, query: { after: String(after) } })
      if (!Number.isSafeInteger(result.seq) || !Array.isArray(result.changes) || !result.changes.every(isSequenced)) throw new Error('Unsupported server')
      return { seq: result.seq, changes: result.changes as SequencedChange[] }
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) return null
      throw error
    }
  }

  async submit(id: string, change: Change): Promise<number> {
    return (await this.json<{ seq: number }>({ method: 'POST', path: `/api/boards/${id}/changes`, ...jsonBody(change) })).seq
  }

  async uploadAsset(id: string, hash: string, type: string, bytes: Uint8Array): Promise<void> {
    await this.call({ method: 'PUT', path: `/api/boards/${id}/assets/${hash}`, body: bytes, contentType: type })
  }

  async asset(id: string, hash: string): Promise<{ type: string; bytes: Uint8Array }> {
    const response = await this.call({ method: 'GET', path: `/api/boards/${id}/assets/${hash}` })
    return { type: response.contentType.split(';')[0] || 'application/octet-stream', bytes: response.body }
  }

  community(): Promise<Community> {
    return this.json({ method: 'GET', path: '/api/community' })
  }

  async createFolder(name: string): Promise<void> {
    await this.call({ method: 'POST', path: '/api/folders', ...jsonBody({ name }) })
  }

  async addMember(folder: string, name: string): Promise<void> {
    await this.call({ method: 'POST', path: '/api/members', ...jsonBody({ folder, name }) })
  }

  async shareBoard(folder: string, board: string): Promise<void> {
    await this.call({ method: 'POST', path: '/api/share-board', ...jsonBody({ folder, board }) })
  }

  async publishTemplate(folder: string, name: string, bytes: Uint8Array): Promise<void> {
    await this.call({ method: 'POST', path: '/api/templates', query: { name, folder }, body: bytes, contentType: 'application/json' })
  }

  async template(id: string): Promise<Uint8Array> {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid template')
    return (await this.call({ method: 'GET', path: `/api/templates/${id}` })).body
  }

  liveUrl(id: string): string {
    const url = new URL(`/api/boards/${id}/live`, this.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.href
  }

  private async call(request: Omit<HttpRequest, 'token'>, authenticated = true): Promise<HttpResponse> {
    const token = authenticated ? this.token() : null
    if (authenticated && !token) throw new ApiError(401)
    const response = await this.http(this.origin, { ...request, ...(token ? { token } : {}) })
    if (response.status < 400) return response
    let reason: string | undefined
    try {
      reason = JSON.parse(decoder.decode(response.body)).reason
    } catch {
      reason = undefined
    }
    throw new ApiError(response.status, reason)
  }

  private async json<T>(request: Omit<HttpRequest, 'token'>, authenticated = true): Promise<T> {
    return JSON.parse(decoder.decode((await this.call(request, authenticated)).body)) as T
  }
}

const jsonBody = (value: unknown) => ({ body: JSON.stringify(value), contentType: 'application/json' })
