import { create } from 'zustand'
import { CONNECT_PAGE, parseConnectTarget, type ConnectTarget } from '../../../shared/connect'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { cloudOrigin, setStoragePreference } from '../storagePreference'
import { account, rememberAccount } from './accounts'
import { ApiError, isAuthError } from './api'
import { clientFor } from './clients'
import { syncCoordinator } from './coordinator'
import { openRemote } from './librarySync'

export type ConnectFailure = 'invalid' | 'unreachable' | 'outdated' | 'denied' | 'expired' | 'mismatch'

/**
 * Connecting this device to Penrill Cloud or a Penrill Server, one step at a time (State pattern):
 *
 *   checking ──(own certificate, no pin given)──▶ confirm ──trust──┐
 *      │                                                           ▼
 *      └──────────────────────────────────────────────────────▶ waiting ──allowed──▶ connected
 *                                                                  │
 *   any step ──problem──▶ failed                         denied / expired ──▶ failed
 *
 * In `waiting` the browser is open at the server's approval page and both screens show `userCode`.
 */
export type ConnectState =
  | { step: 'idle' }
  | { step: 'checking'; origin: string }
  | { step: 'confirm'; origin: string; pin: string }
  | { step: 'waiting'; origin: string; server: string; userCode: string; verifyUrl: string }
  | { step: 'connected'; origin: string; server: string; user: string }
  | { step: 'failed'; reason: ConnectFailure; origin?: string }

export const useConnect = create<ConnectState>(() => ({ step: 'idle' }))

const RETRY_MS = 3000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Each call to `connect` gets a number; a newer one or a cancel makes older ones stop quietly. */
let run = 0
let confirmed: ((trust: boolean) => void) | null = null

const current = (id: number) => id === run
const set = (id: number, state: ConnectState) => {
  if (current(id)) useConnect.setState(state, true)
}

function deviceName(): string {
  if (platform.connect) return platform.connect.deviceName
  const browser = /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : 'Browser'
  return `${browser} on ${navigator.platform || 'the web'}`
}

/**
 * Connect links in the web app's address: the connect page links to `https://app.penrill.com/#server=…`. Hands each one
 * over in the form `parseConnectTarget` reads and clears it from the address bar, so a reload does not
 * start over. Following such a link while the app is already open only changes the fragment.
 * When this browser is already signed in to that server, switches to it (and opens `&board=…` if given)
 * without forcing a new device-link approval every time.
 */
export function onConnectHash(handle: (link: string) => void): void {
  const take = () => {
    const hash = location.hash.slice(1)
    const params = new URLSearchParams(hash)
    if (!params.get('server')) return
    const boardId = params.get('board')?.trim() || null
    history.replaceState(history.state, '', location.pathname + location.search)
    const link = `${CONNECT_PAGE}#${hash}`
    let target: ConnectTarget
    try {
      target = parseConnectTarget(link)
    } catch {
      handle(link)
      return
    }
    const existing = account(target.origin)
    if (!existing) {
      handle(link)
      return
    }
    void (async () => {
      try {
        const rows = await clientFor(target.origin).boards()
        setStoragePreference(target.origin === cloudOrigin ? 'cloud' : 'server', target.origin)
        await syncCoordinator.refresh()
        if (boardId) {
          const row = rows.find((r) => r.id === boardId)
          if (row) {
            await openRemote(target.origin, row)
            return
          }
        }
        await boardLibrary.goHome('boards')
      } catch (error) {
        if (isAuthError(error)) {
          rememberAccount(target.origin, null)
          handle(link)
        } else {
          await boardLibrary.goHome('boards')
        }
      }
    })()
  }
  window.addEventListener('hashchange', take)
  take()
}

function openBrowser(url: string): void {
  if (platform.connect) void platform.connect.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

/**
 * A server with its own certificate: trust the pin the connect link brought, or show the person the
 * fingerprint to compare with the server's page before trusting it. False when they decline.
 */
async function trustCertificate(id: number, target: ConnectTarget): Promise<boolean | 'unreachable' | 'mismatch'> {
  const connect = platform.connect
  if (!connect || !target.origin.startsWith('https:')) return true
  let probe
  try {
    probe = await connect.probe(target.origin)
  } catch {
    return 'unreachable'
  }
  if (target.pin) {
    if (probe.pin !== target.pin) return 'mismatch'
  } else if (!probe.trusted) {
    set(id, { step: 'confirm', origin: target.origin, pin: probe.pin })
    const trust = await new Promise<boolean>((resolve) => (confirmed = resolve))
    if (!trust || !current(id)) return false
  } else return true
  await connect.trust(target.origin, probe.pin)
  return true
}

export const connectFlow = {
  /** Starts over with a connect link, an address, or `cloud` for Penrill Cloud. */
  async connect(input: string | 'cloud'): Promise<void> {
    const id = ++run
    confirmed?.(false)
    let target: ConnectTarget
    try {
      target = input === 'cloud' ? { origin: cloudOrigin } : parseConnectTarget(input)
    } catch {
      set(id, { step: 'failed', reason: 'invalid' })
      return
    }
    const { origin } = target
    set(id, { step: 'checking', origin })
    const trusted = await trustCertificate(id, target)
    if (!current(id)) return
    if (trusted !== true) {
      if (trusted === false) set(id, { step: 'idle' })
      else set(id, { step: 'failed', reason: trusted, origin })
      return
    }
    const client = clientFor(origin)
    let server: string
    let isCloud = input === 'cloud' || origin === cloudOrigin
    let start
    try {
      const info = await client.serverInfo()
      if (!info.link) throw new ApiError(404)
      if (info.edition === 'cloud' && origin === cloudOrigin) isCloud = true
      server = isCloud ? 'Penrill Cloud' : info.name
      start = await client.startLink(deviceName(), `Penrill ${await platform.update.version()}`)
    } catch (error) {
      set(id, { step: 'failed', reason: error instanceof ApiError && error.status === 404 ? 'outdated' : 'unreachable', origin })
      return
    }
    if (!current(id)) return
    set(id, { step: 'waiting', origin, server, userCode: start.userCode, verifyUrl: start.verifyUrlComplete })
    // The app opens the system browser. A web page may not open a tab without a click (pop-up blockers),
    // so in the browser the waiting step offers a button instead.
    if (platform.connect) openBrowser(start.verifyUrlComplete)
    const deadline = Date.now() + start.expiresIn * 1000
    while (current(id) && Date.now() < deadline) {
      let poll
      try {
        poll = await client.pollLink(start.deviceCode)
      } catch {
        await sleep(RETRY_MS)
        continue
      }
      if (!current(id)) return
      if (poll.status === 'pending') continue
      if (poll.status !== 'approved') {
        set(id, { step: 'failed', reason: poll.status, origin })
        return
      }
      rememberAccount(origin, poll.account)
      setStoragePreference(isCloud ? 'cloud' : 'server', origin)
      set(id, { step: 'connected', origin, server, user: poll.account.name })
      return
    }
    set(id, { step: 'failed', reason: 'expired', origin })
  },

  /** The answer to the fingerprint question in the `confirm` step. */
  confirm(trust: boolean): void {
    confirmed?.(trust)
    confirmed = null
  },

  /** Opens the approval page again, for when the browser tab got lost. */
  reopen(): void {
    const state = useConnect.getState()
    if (state.step === 'waiting') openBrowser(state.verifyUrl)
  },

  cancel(): void {
    run++
    confirmed?.(false)
    confirmed = null
    useConnect.setState({ step: 'idle' }, true)
  }
}
