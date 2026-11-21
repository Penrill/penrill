import { Bonjour } from 'bonjour-service'
import { app, safeStorage, session, shell } from 'electron'
import { createHash, X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { connect as tlsConnect } from 'node:tls'
import { isPin } from '../shared/connect'
import { serverOrigin } from '../shared/http'
import type { FoundServer, ServerProbe, StoredAccount } from '../shared/platform'
import { writeDurable } from './fsutil'

const PROBE_TIMEOUT_MS = 8000
const DISCOVER_MS = 2500

/** `sha256/<base64>` of a certificate's public key, the same pin Penrill Server prints. */
export function pinOf(certificate: X509Certificate): string {
  const spki = certificate.publicKey.export({ type: 'spki', format: 'der' })
  return 'sha256/' + createHash('sha256').update(spki).digest('base64')
}

/**
 * Servers trusted by their own certificate, and accounts per server. Pins are checked for every
 * request the app makes (renderer fetches, WebSockets and `net.fetch` in this process all use the
 * default session), so a pinned server never falls back to the public certificate authorities and
 * an attacker's publicly valid certificate for that name is refused.
 */
export class Connections {
  private readonly pinsPath: string
  private readonly accountsPath: string
  /** Pins by host name: Chromium's certificate check sees the host, not the port. */
  private pins: Record<string, string[]> = {}
  accounts: Record<string, StoredAccount> = {}

  constructor(userData: string) {
    this.pinsPath = join(userData, 'pins.json')
    this.accountsPath = join(userData, 'accounts.bin')
  }

  async init(): Promise<void> {
    try {
      this.pins = JSON.parse(await readFile(this.pinsPath, 'utf8'))
    } catch {
      this.pins = {}
    }
    try {
      const bytes = await readFile(this.accountsPath)
      const text = safeStorage.isEncryptionAvailable() && bytes[0] !== 0x7b ? safeStorage.decryptString(bytes) : bytes.toString('utf8')
      this.accounts = JSON.parse(text)
    } catch {
      this.accounts = {}
    }
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      const pinned = this.pins[request.hostname]
      if (!pinned) return callback(-3) // Chromium's own verdict.
      try {
        callback(pinned.includes(pinOf(new X509Certificate(request.certificate.data))) ? 0 : -2)
      } catch {
        callback(-2)
      }
    })
  }

  async trust(origin: string, pin: string): Promise<void> {
    if (!isPin(pin)) throw new Error('Invalid pin')
    const host = new URL(serverOrigin(origin)).hostname.replace(/^\[|\]$/g, '')
    this.pins[host] = [...new Set([...(this.pins[host] ?? []), pin])]
    await writeDurable(this.pinsPath, JSON.stringify(this.pins))
  }

  async saveAccount(origin: string, value: StoredAccount | null): Promise<void> {
    const key = serverOrigin(origin)
    if (value) this.accounts[key] = { name: String(value.name), token: String(value.token) }
    else delete this.accounts[key]
    const text = JSON.stringify(this.accounts)
    // Without a keychain (some Linux desktops) the file stays readable only by this user's profile.
    await writeDurable(this.accountsPath, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text)
  }
}

/** Reads the certificate a server presents without trusting it, to show or check its pin. */
export function probe(origin: string): Promise<ServerProbe> {
  const url = new URL(serverOrigin(origin))
  if (url.protocol !== 'https:') return Promise.reject(new Error('Not HTTPS'))
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host,
      port: Number(url.port || 443),
      servername: /^[\d.:]+$/.test(host) ? undefined : host,
      rejectUnauthorized: false,
      timeout: PROBE_TIMEOUT_MS
    })
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerX509Certificate()
      const trusted = socket.authorized
      socket.end()
      if (certificate) resolve({ pin: pinOf(certificate), trusted })
      else reject(new Error('No certificate'))
    })
    socket.once('timeout', () => socket.destroy(new Error('Timed out')))
    socket.once('error', reject)
  })
}

/** Penrill Servers announcing `_penrill._tcp` on the local network (the package installs an Avahi service for it). */
export function discover(): Promise<FoundServer[]> {
  return new Promise((resolve) => {
    const found = new Map<string, FoundServer>()
    let bonjour: Bonjour
    try {
      bonjour = new Bonjour()
    } catch {
      resolve([])
      return
    }
    const browser = bonjour.find({ type: 'penrill' }, (service) => {
      const address = service.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a))
      if (!address) return
      try {
        const origin = serverOrigin(`https://${address}:${service.port}`)
        found.set(origin, { name: service.name, origin })
      } catch {
        // Not a usable address.
      }
    })
    setTimeout(() => {
      browser.stop()
      bonjour.destroy()
      resolve([...found.values()])
    }, DISCOVER_MS)
  })
}

export const deviceName = (): string => {
  const name = hostname().replace(/\.local$/i, '')
  return name || (process.platform === 'darwin' ? 'Mac' : process.platform === 'win32' ? 'Windows PC' : 'Linux computer')
}

export function openExternal(url: string): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only web links')
  return shell.openExternal(parsed.href)
}

export const CONNECT_SCHEME = 'penrill'

/** `penrill://connect?...` links among command line arguments (Windows and Linux deliver them this way). */
export const connectArg = (argv: string[]): string | undefined => argv.find((a) => a.startsWith(`${CONNECT_SCHEME}://`))

/** Registers the app for penrill:// links. In development the Electron binary needs the script path too. */
export function registerScheme(): void {
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(CONNECT_SCHEME, process.execPath, [process.argv[1]!])
  else app.setAsDefaultProtocolClient(CONNECT_SCHEME)
}
