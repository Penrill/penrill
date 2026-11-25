import type { Change } from '@penrill/sync/protocol'
import { LiveSession, type Logger, type SessionState, type Timers } from '@penrill/sync/session'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { useApp } from '../appState'
import { storagePreference } from '../storagePreference'
import { account, accountsChanged, useAccounts } from './accounts'
import { isAccessError, isAuthError, isQuotaError } from './api'
import { assetCodec } from './assets'
import { clientFor } from './clients'
import { EditorDocument, type TitlePort } from './editorDocument'
import { hintFor, LibrarySync, publishBoard, serverCopyState, setStatus, settleServerCopy, statusFor, type SyncStatus } from './librarySync'
import { activeLink, linkBoard, linkFor, linksChanged, saveLink, scopeOf, syncsNewBoards, useLinks, type Link } from './links'
import { outboxFor } from './outbox'
import { Presence } from './presence'
import { webSocketTransport } from './transport'

const LIBRARY_INTERVAL_MS = 30_000
const PUBLISH_RETRY_MAX_MS = 30_000

const timers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  random: () => Math.random()
}

const log: Logger = {
  info: (message, details) => console.info('[sync]', message, details ?? ''),
  warn: (message, details) => console.warn('[sync]', message, details ?? '')
}

interface LiveBoard {
  key: string
  localId: string
  link: Link
  session: LiveSession
  document: EditorDocument
  presence: Presence
  detachCanvas: (() => void) | null
}

function sessionStatus(state: SessionState): SyncStatus | null {
  switch (state.status) {
    case 'live': return state.pending ? 'pending' : 'synced'
    case 'connecting': return 'pending'
    case 'offline': return 'offline'
    case 'room-full': return 'room-full'
    case 'stopped': return null
    default: return 'denied'
  }
}

function titlesFor(localId: string): TitlePort {
  let last = useApp.getState().board?.title ?? ''
  return {
    get() {
      const board = useApp.getState().board
      if (board?.id === localId) last = board.title
      return last
    },
    set(title) {
      last = title
      const board = useApp.getState().board
      if (board?.id === localId) useApp.setState({ board: { ...board, title } })
      void platform.library.rename(localId, title).then(() => boardLibrary.refreshLibrary()).catch(error => log.warn('Could not rename the board on this device', { error: String(error) }))
    },
    subscribe(listener) {
      return useApp.subscribe((state, previous) => {
        if (state.board?.id === localId && previous.board?.id === localId && state.board.title !== previous.board.title) listener()
      })
    }
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

class SyncCoordinator {
  private live: LiveBoard | null = null
  private canvas: HTMLCanvasElement | null = null
  private readonly library = new LibrarySync(localId => this.live?.localId === localId, () => storagePreference().origin, log)

  start(): () => void {
    const follow = () => this.follow()
    const stops = [
      useApp.subscribe((state, previous) => {
        if (state.board?.id !== previous.board?.id || state.view !== previous.view) follow()
      }),
      useLinks.subscribe(follow),
      useAccounts.subscribe(() => {
        follow()
        void this.library.run()
      }),
      boardLibrary.onLeaving(() => this.end()),
      boardLibrary.onCreated(localId => this.linkNew(localId)),
      boardLibrary.onRenamed((localId, title) => void this.renamedClosed(localId, title)),
      boardLibrary.onSaved((localId, startedAt) => {
        const live = this.live
        if (live?.localId === localId) void outboxFor(scopeOf(live.link)).prune(startedAt).catch(error => log.warn('Could not trim the outbox', { error: String(error) }))
      })
    ]
    const online = () => {
      this.live?.session.wake()
      void this.library.run()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('penrill-account:')) accountsChanged()
      if (event.key === null || event.key.startsWith('penrill-link:')) linksChanged()
    }
    window.addEventListener('online', online)
    window.addEventListener('storage', storage)
    const interval = setInterval(() => void this.library.run(), LIBRARY_INTERVAL_MS)
    follow()
    void this.library.run()
    return () => {
      for (const stop of stops) stop()
      window.removeEventListener('online', online)
      window.removeEventListener('storage', storage)
      clearInterval(interval)
      this.end()
    }
  }

  refresh(): Promise<void> {
    return this.library.run()
  }

  attachCanvas(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas
    if (this.live) this.live.detachCanvas = this.live.presence.attach(canvas)
    return () => {
      if (this.canvas !== canvas) return
      this.canvas = null
      this.live?.detachCanvas?.()
      if (this.live) this.live.detachCanvas = null
    }
  }

  private follow(): void {
    const { board, view } = useApp.getState()
    const localId = board && view === 'board' ? board.id : null
    const link = localId ? activeLink(localId) : null
    const key = localId && link ? `${localId}|${scopeOf(link)}` : null
    if (key === (this.live?.key ?? null)) return
    this.end()
    if (localId && link && key) this.begin(localId, link, key)
  }

  private begin(localId: string, link: Link, key: string): void {
    const client = clientFor(link.origin)
    const emit = (change: Change) => session.local(change)
    const document = new EditorDocument(boardLibrary.editor, titlesFor(localId), emit)
    const presence = new Presence(boardLibrary.editor, data => session.signal(data))
    const session: LiveSession = new LiveSession({
      transport: webSocketTransport(client.liveUrl(link.remote)),
      outbox: outboxFor(scopeOf(link)),
      codec: assetCodec(client, link.remote),
      document,
      timers,
      log,
      token: () => account(link.origin)?.token ?? null,
      onState: state => {
        const status = sessionStatus(state)
        if (status) setStatus(localId, status)
        // Deleted on the server or no longer shared while open here: settle what stays on this device.
        if (state.status === 'no-access') {
          void serverCopyState(link)
            .then(found => settleServerCopy(localId, linkFor(localId) ?? link, found))
            .then(status => status && setStatus(localId, status), () => undefined)
        }
      },
      onPeers: peers => presence.setPeers(peers),
      onSignal: (peer, data) => presence.receive(peer, data),
      onReject: reason => {
        if (reason === 'read-only') setStatus(localId, 'read-only')
        else if (reason === 'quota-exceeded' || reason === 'plan-required') setStatus(localId, 'quota', { upgradeUrl: new URL('/billing', link.origin).href })
      }
    })
    const live: LiveBoard = { key, localId, link, session, document, presence, detachCanvas: this.canvas ? presence.attach(this.canvas) : null }
    this.live = live
    document.attach()
    void this.open(live).catch(error => log.warn('Could not start live sync', { error: String(error) }))
  }

  private async open(live: LiveBoard): Promise<void> {
    let link = live.link
    for (let attempt = 0; !link.published && this.live === live; attempt++) {
      try {
        const { title, background } = live.document.meta()
        const items = [...live.document.ids()].flatMap(id => live.document.item(id) ?? [])
        link = await publishBoard(live.localId, link, { title, background, items })
      } catch (error) {
        setStatus(live.localId, statusFor(error), hintFor(link.origin, error))
        if (isAuthError(error) || isAccessError(error) || isQuotaError(error)) return
        await delay(Math.min(PUBLISH_RETRY_MAX_MS, 1000 * 2 ** attempt))
      }
    }
    if (this.live === live) await live.session.start()
  }

  private end(): void {
    const live = this.live
    if (!live) return
    this.live = null
    live.document.detach()
    live.session.stop()
    live.presence.dispose()
    live.detachCanvas?.()
    const link = activeLink(live.localId)
    if (link && live.session.seq !== null) saveLink(live.localId, { ...link, seq: live.session.seq }, true)
    void this.library.run()
  }

  private linkNew(localId: string): void {
    const { origin } = storagePreference()
    if (origin && syncsNewBoards(origin)) linkBoard(localId, origin)
  }

  private async renamedClosed(localId: string, title: string): Promise<void> {
    const link = activeLink(localId)
    if (!link || this.live?.localId === localId) return
    await outboxFor(scopeOf(link)).add({ id: crypto.randomUUID(), ops: [{ op: 'meta', title }] })
    await this.library.run()
  }
}

export const syncCoordinator = new SyncCoordinator()
