/** The server's JSON API for these pages (WebEndpoints.cs in penrill-server). */

export type Role = 'owner' | 'admin' | 'member'

export interface Session {
  server: string
  unclaimed: boolean
  user: { name: string; role: Role } | null
}

export interface Home {
  origin: string
  link: string
  qr: string
  shortPin: string | null
  devices: number
  counts: { users: number; boards: number; devices: number; templates: number } | null
}

export interface Device {
  id: string
  name: string
  user: string
  created: string
  lastUsed: string | null
}

export interface LinkRequest {
  code: string
  device: string
  app: string
  address: string
  created: string
}

export interface Person {
  name: string
  role: Role
  disabled: boolean
  created: string | null
}

export interface Invite {
  id: string
  role: Role
  usesLeft: number
  expires: string | null
  createdBy: string
}

export interface NewLink {
  url: string
  qr: string
}

export interface SharedTemplate {
  id: string
  name: string
  author: string
  folder: string | null
  updated: string
}

export interface OrphanBoard {
  id: string
  title: string
  updated: string
}

export interface ServerInfo {
  name: string
  email: string | null
  origin: string
  lan: boolean
  shortPin: string | null
  version: string
  users: number
  devices: number
  boards: number
  orphans: number
}

/** A refusal from the server: `code` is its error code ("taken", "expired", …) or the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`${status} ${code}`)
  }
}

/** Called when the session ran out on the server, so the app can show the sign-in page. */
let onSignedOut: () => void = () => {}
export const whenSignedOut = (handler: () => void): void => {
  onSignedOut = handler
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch('/web' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      // Required on every change: other sites cannot send it (see WebEndpoints.Header).
      'X-Penrill-Web': '1',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (response.status === 401 && !path.startsWith('/login')) onSignedOut()
  if (!response.ok) {
    let code = String(response.status)
    try {
      code = ((await response.json()) as { error?: string }).error ?? code
    } catch {
      // No JSON body: the status says it.
    }
    throw new ApiError(response.status, code)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

const get = <T>(path: string): Promise<T> => request<T>('GET', path)
const enc = encodeURIComponent

export const api = {
  session: () => get<Session>('/session'),
  login: (name: string, password: string) => request<void>('POST', '/login', { name, password }),
  logout: () => request<void>('POST', '/logout'),
  setupToken: () => get<{ token: string | null }>('/setup'),
  setup: (body: { token: string; name: string; password: string; serverName: string; email: string }) => request<void>('POST', '/setup', body),
  checkInvite: (token: string) => get<void>(`/invite/${enc(token)}`),
  acceptInvite: (token: string, name: string, password: string) => request<void>('POST', `/invite/${enc(token)}`, { name, password }),
  checkReset: (token: string) => get<{ user: string }>(`/reset/${enc(token)}`),
  reset: (token: string, password: string) => request<void>('POST', `/reset/${enc(token)}`, { password }),

  home: () => get<Home>('/home'),
  devices: () => get<Device[]>('/devices'),
  disconnect: (id: string) => request<void>('DELETE', `/devices/${enc(id)}`),
  changePassword: (current: string, next: string) => request<void>('POST', '/password', { current, next }),
  linkRequest: (code: string) => get<LinkRequest>(`/link/${enc(code)}`),
  decide: (code: string, allow: boolean) => request<void>('POST', `/link/${enc(code)}`, { allow }),

  admin: {
    people: () => get<{ users: Person[]; invites: Invite[] }>('/admin/people'),
    invite: (role: 'Member' | 'Admin', uses: number, days: number) => request<NewLink>('POST', '/admin/invites', { role, uses, days }),
    deleteInvite: (id: string) => request<void>('DELETE', `/admin/invites/${enc(id)}`),
    setRole: (name: string, role: 'Member' | 'Admin') => request<void>('PUT', `/admin/people/${enc(name)}/role`, { role }),
    setDisabled: (name: string, disabled: boolean) => request<void>('PUT', `/admin/people/${enc(name)}/disabled`, { disabled }),
    resetLink: (name: string) => request<NewLink>('POST', `/admin/people/${enc(name)}/reset`),
    devices: () => get<Device[]>('/admin/devices'),
    disconnect: (id: string) => request<void>('DELETE', `/admin/devices/${enc(id)}`),
    templates: () => get<SharedTemplate[]>('/admin/templates'),
    removeTemplate: (id: string) => request<void>('DELETE', `/admin/templates/${enc(id)}`),
    orphans: () => get<OrphanBoard[]>('/admin/boards'),
    giveBoard: (id: string, user: string) => request<void>('PUT', `/admin/boards/${enc(id)}/owner`, { user }),
    server: () => get<ServerInfo>('/admin/server'),
    rename: (name: string) => request<void>('PUT', '/admin/server/name', { name }),
    setEmail: (email: string) => request<void>('PUT', '/admin/server/email', { email }),
    backupUrl: '/web/admin/backup'
  }
}
