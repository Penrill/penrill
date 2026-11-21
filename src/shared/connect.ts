import { serverOrigin } from './http'

/**
 * A server to connect to, from whatever the person has: a connect link from a server's page
 * (`penrill://connect?server=…&pin=…` or `https://penrill.com/connect#server=…&pin=…`), a full
 * address, or just a host such as `raspberrypi.local:5081`. Connect links carry no secret.
 */
export interface ConnectTarget {
  origin: string
  /** `sha256/<base64>` of the server's public key, when it uses its own certificate. */
  pin?: string
}

const PIN = /^sha256\/[A-Za-z0-9+/]{43}=$/
export const CONNECT_PAGE = 'https://penrill.com/connect'

export const isPin = (value: unknown): value is string => typeof value === 'string' && PIN.test(value)

function fromParams(params: URLSearchParams): ConnectTarget | null {
  const server = params.get('server')
  if (!server) return null
  const pin = params.get('pin')
  return { origin: serverOrigin(server), ...(isPin(pin) ? { pin } : {}) }
}

/** Throws when the text is neither a connect link nor a usable server address. */
export function parseConnectTarget(text: string): ConnectTarget {
  const value = text.trim()
  if (value.startsWith('penrill://')) {
    const url = new URL(value)
    const target = url.hostname === 'connect' || url.pathname.replace(/^\/+/, '') === 'connect' ? fromParams(url.searchParams) : null
    if (!target) throw new Error('Not a connect link')
    return target
  }
  if (value.startsWith(CONNECT_PAGE)) {
    const url = new URL(value)
    const target = fromParams(new URLSearchParams(url.hash.slice(1)))
    if (!target) throw new Error('Not a connect link')
    return target
  }
  // A bare host means HTTPS: Penrill Server listens with TLS on the network.
  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : 'https://' + value
  const url = new URL(address)
  return { origin: serverOrigin(url.origin) }
}

/** The first bytes of a pin in hex groups, as the server shows them: `0CA7-1F5D-DDE9`. */
export function shortPin(pin: string): string {
  const bytes = Uint8Array.from(atob(pin.slice('sha256/'.length)), (c) => c.charCodeAt(0))
  const hex = Array.from(bytes.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}
