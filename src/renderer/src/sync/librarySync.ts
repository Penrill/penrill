import type { Item } from '@penrill/core/types'
import { applyChange, stateOf } from '@penrill/sync/board'
import type { Change, WireItem } from '@penrill/sync/protocol'
import { PermanentError, type Logger } from '@penrill/sync/session'
import { create } from 'zustand'
import { DEFAULT_CAMERA } from '../../../board/editor'
import { renderThumbnail } from '../../../board/engine/export'
import { decodeBoard, encodeBoard } from '../../../board/engine/serialize'
import { prefsStore } from '../../../board/store'
import { bgPattern, isBackgroundKind, withPattern } from '../../../board/engine/surface'
import type { BoardEntry } from '../../../shared/library'
import { useApp } from '../appState'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { account } from './accounts'
import { ApiError, isAccessError, isAuthError, isPermanent, isQuotaError, isReadOnlyError, REMOVED, type BoardContent, type Community, type RemoteBoard } from './api'
import { assetCodec } from './assets'
import { clientFor } from './clients'
import { allLinks, copyOutcome, deletionDone, forgetServerCopy, linkedBoards, linkFor, pendingDeletions, removeFromServer, removeLink, saveLink, scopeOf, type CopyState, type Link } from './links'
import { clearOutbox, outboxFor } from './outbox'
import { refreshTemplates } from './templates'
import { fromWire, toWire } from './wire'

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'denied' | 'read-only' | 'quota' | 'room-full'

export interface SyncHint {
  upgradeUrl?: string
  message?: string
}

export const useSyncStatus = create<{ states: Record<string, SyncStatus>; hints: Record<string, SyncHint | undefined> }>(() => ({ states: {}, hints: {} }))

/** What the server shares with this account: folders, their boards, and templates. */
export const useCommunity = create<{ origin: string; catalog: Community | null }>(() => ({ origin: '', catalog: null }))

export const useRemoteBoards = create<{ origin: string; rows: RemoteBoard[]; error: boolean }>(() => ({ origin: '', rows: [], error: false }))

export function setStatus(localId: string, status: SyncStatus, hint?: SyncHint): void {
  const prev = useSyncStatus.getState()
  const nextHint = status === 'quota' ? hint : undefined
  if (prev.states[localId] === status && prev.hints[localId]?.upgradeUrl === nextHint?.upgradeUrl && prev.hints[localId]?.message === nextHint?.message) return
  useSyncStatus.setState(({ states, hints }) => ({
    states: { ...states, [localId]: status },
    hints: { ...hints, [localId]: nextHint }
  }))
}

export const statusFor = (error: unknown): SyncStatus =>
  isQuotaError(error) || (error instanceof PermanentError && (error.reason === 'quota-exceeded' || error.reason === 'plan-required')) ? 'quota'
    : isReadOnlyError(error) || (error instanceof PermanentError && error.reason === 'read-only') ? 'read-only'
    : isAuthError(error) || isAccessError(error) ? 'denied'
    : 'offline'

export function hintFor(origin: string, error: unknown): SyncHint | undefined {
  if (error instanceof PermanentError && (error.reason === 'quota-exceeded' || error.reason === 'plan-required')) {
    return { upgradeUrl: new URL('/billing', origin).href, message: error.message }
  }
  if (!isQuotaError(error)) return undefined
  const upgrade = error.upgradeUrl
  const upgradeUrl = upgrade ? (upgrade.startsWith('http://') || upgrade.startsWith('https://') ? upgrade : new URL(upgrade, origin).href) : new URL('/billing', origin).href
  return { upgradeUrl, message: error.title }
}

const itemsOf = (wires: Iterable<WireItem>): Item[] =>
  [...wires].map(fromWire).filter((item): item is Item => !!item).sort((a, b) => a.z - b.z)

const isDataImage = (item: WireItem): boolean =>
  item.type === 'image' && typeof item.src === 'string' && item.src.startsWith('data:')

export async function publishBoard(localId: string, link: Link, content: BoardContent): Promise<Link> {
  const client = clientFor(link.origin)
  const safeTitle = content.title.trim() || 'Untitled'
  const imageItems = content.items.filter(isDataImage)
  const baseItems = imageItems.length ? content.items.filter(item => !isDataImage(item)) : content.items
  // Create the board first so PUT /api/boards/{id}/assets/{hash} finds an existing board and passes access checks.
  const result = await client.createBoard(link.remote, { ...content, title: safeTitle, items: baseItems })
  let published: Link = { ...link, published: true, seq: result.created ? result.seq : null }
  saveLink(localId, published)
  if (result.created && imageItems.length) {
    const change: Change = { id: crypto.randomUUID(), ops: imageItems.map(item => ({ op: 'put' as const, item })) }
    const outbox = outboxFor(scopeOf(published))
    await outbox.add(change)
    try {
      const encoded = await assetCodec(client, published.remote).encode(change)
      const seq = await client.submit(published.remote, encoded)
      await outbox.confirm(change.id)
      published = { ...published, seq }
      saveLink(localId, published)
    } catch (error) {
      if (error instanceof PermanentError || isQuotaError(error) || isReadOnlyError(error)) {
        await outbox.remove(change.id)
        throw error
      }
      if (isAuthError(error) || isAccessError(error)) throw error
      // Transient upload/submit failure: the board exists on the server and image ops stay queued in outbox for retry.
    }
  }
  return published
}

export async function remoteBoard(origin: string, remote: string) {
  const client = clientFor(origin)
  const snapshot = await client.snapshot(remote)
  const items = itemsOf(await assetCodec(client, remote).decodeItems(snapshot.items))
  return { snapshot, items, background: withPattern(prefsStore.getState().background, isBackgroundKind(snapshot.background) ? bgPattern(snapshot.background) : 'dots') }
}

/** Reloads the server's folders, their members and shared boards and templates. */
export async function refreshCommunity(origin: string): Promise<void> {
  const catalog = await clientFor(origin).community()
  useCommunity.setState({ origin, catalog })
  await refreshTemplates(origin, catalog.templates)
}

/**
 * Where a board missing from the server's list stands: just made (the list is older), deleted by its
 * owner (`removed` when the owner took it off everyone's devices), or no longer shared with this
 * account. Network trouble throws.
 */
export async function serverCopyState(link: Link): Promise<CopyState> {
  try {
    await clientFor(link.origin).snapshot(link.remote)
    return 'here'
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return error.reason === REMOVED ? 'removed' : 'gone'
    if (isAuthError(error)) return 'signed-out'
    if (isAccessError(error)) return 'denied'
    throw error
  }
}

/** A board someone else owns that just left this device, for the notice that says so. */
export interface DroppedBoard {
  key: string
  title: string
  owner: string
  why: 'denied' | 'removed'
}

export const useDroppedBoards = create<{ dropped: DroppedBoard[] }>(() => ({ dropped: [] }))

/**
 * Acts on what a check of the server copy found. A board someone else owns leaves this device when its
 * owner stopped sharing it (`denied`) or deleted it for everyone (`removed`); a board deleted with
 * copies kept, and this account's own boards, stay here without sync. Returns the status to show.
 */
export async function settleServerCopy(localId: string, link: Link, state: CopyState): Promise<SyncStatus | null> {
  switch (copyOutcome(link, state)) {
    case 'keep': return null
    case 'drop':
      await dropSharedBoard(localId, link, state === 'removed' ? 'removed' : 'denied')
      return null
    case 'forget':
      forgetServerCopy(localId)
      return 'synced'
    case 'denied': return 'denied'
  }
}

/** Takes a board someone else owns off this device for good: no trash, no sync, no outbox. */
async function dropSharedBoard(localId: string, link: Link, why: 'denied' | 'removed'): Promise<void> {
  if (!linkFor(localId)) return
  const entry = (await platform.library.list()).boards.find(board => board.id === localId)
  removeLink(localId)
  await clearOutbox(scopeOf(link)).catch(() => undefined)
  if (entry) {
    if (useApp.getState().board?.id === localId) await boardLibrary.goHome()
    if (!entry.deletedAt) await boardLibrary.deleteBoard(localId)
    await platform.library.purge(localId)
    await boardLibrary.refreshLibrary()
    useDroppedBoards.setState(({ dropped }) => ({
      dropped: [...dropped, { key: `${localId}:${Date.now()}`, title: entry.title, owner: link.owner ?? '', why }]
    }))
  }
}

export async function openRemote(origin: string, row: RemoteBoard): Promise<void> {
  const user = account(origin)?.name
  if (!user) throw new ApiError(401)
  const localId = await navigator.locks.request(`penrill-open-${origin}-${row.id}`, async () => {
    const entries = new Map((await platform.library.list()).boards.map(entry => [entry.id, entry]))
    for (const [id, link] of linkedBoards()) {
      if (link.origin === origin && link.user === user && link.remote === row.id && !entries.get(id)?.deletedAt) return id
    }
    const { snapshot, items, background } = await remoteBoard(origin, row.id)
    const entry = await platform.library.create(snapshot.title, await encodeBoard({ items, background, camera: DEFAULT_CAMERA }))
    saveLink(entry.id, { origin, user, remote: row.id, seq: snapshot.seq, published: true, ...sharing(row) })
    return entry.id
  })
  if (!await boardLibrary.openBoard(localId)) throw new Error('Could not open the board')
}

/** Who owns a listed board and whether this account may copy it, as the link keeps it. */
function sharing(row: RemoteBoard): Pick<Link, 'owner' | 'copying'> {
  return {
    owner: row.owner || undefined,
    // Servers before 0.5 cannot keep a board from being copied, so their boards can be.
    copying: row.copying ?? true
  }
}

export class LibrarySync {
  private running: Promise<void> | null = null
  private again = false
  private lastProblem = ''
  private readonly isLive: (localId: string) => boolean
  private readonly listedOrigin: () => string
  private readonly log: Logger

  constructor(isLive: (localId: string) => boolean, listedOrigin: () => string, log: Logger) {
    this.isLive = isLive
    this.listedOrigin = listedOrigin
    this.log = log
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.pass()
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async pass(): Promise<void> {
    const entries = new Map((await platform.library.list()).boards.map(entry => [entry.id, entry]))
    this.followTrash(entries)
    await this.deleteServerCopies()
    const byOrigin = new Map<string, [string, Link][]>()
    for (const [localId, link] of linkedBoards()) {
      if (!entries.has(localId) || entries.get(localId)!.deletedAt) continue
      byOrigin.set(link.origin, [...byOrigin.get(link.origin) ?? [], [localId, link]])
    }
    const listed = this.listedOrigin()
    if (listed && account(listed) && !byOrigin.has(listed)) byOrigin.set(listed, [])
    if (listed && !account(listed)) useRemoteBoards.setState({ origin: listed, rows: [], error: false })
    await Promise.all([...byOrigin].map(([origin, boards]) => this.syncOrigin(origin, boards, entries)))
  }

  /**
   * Boards deleted for good on this device (by hand or after their time in the trash) take their
   * server copy with them. Only boards this device saw in its trash count: a library that comes up
   * empty for another reason must not empty the server.
   */
  private followTrash(entries: Map<string, BoardEntry>): void {
    for (const [localId, link] of allLinks()) {
      const entry = entries.get(localId)
      if (!entry) {
        if (link.trashed) removeFromServer(localId)
      } else if (!!entry.deletedAt !== !!link.trashed) {
        saveLink(localId, { ...link, trashed: entry.deletedAt ? true : undefined }, true)
      }
    }
  }

  private async deleteServerCopies(): Promise<void> {
    for (const [localId, link] of pendingDeletions()) {
      if (account(link.origin)?.name !== link.user) continue
      try {
        if (link.published) await clientFor(link.origin).deleteBoard(link.remote, link.copies)
      } catch (error) {
        // Not this account's board (403) or already gone (404): nothing left to delete.
        if (!isAccessError(error)) {
          this.problem(link.origin, error)
          continue
        }
      }
      await clearOutbox(scopeOf(link)).catch(() => undefined)
      deletionDone(localId)
    }
  }

  private async syncOrigin(origin: string, boards: [string, Link][], entries: Map<string, BoardEntry>): Promise<void> {
    let rows: RemoteBoard[]
    try {
      rows = await clientFor(origin).boards()
    } catch (error) {
      this.problem(origin, error)
      for (const [localId] of boards) if (!this.isLive(localId)) setStatus(localId, statusFor(error))
      if (origin === this.listedOrigin()) useRemoteBoards.setState({ origin, rows: [], error: true })
      return
    }
    this.lastProblem = ''
    if (origin === this.listedOrigin()) {
      useRemoteBoards.setState({ origin, rows, error: false })
      await this.community(origin)
    }
    const seqs = new Map(rows.map(row => [row.id, row.seq]))
    const listed = new Map(rows.map(row => [row.id, row]))
    for (const [localId, link] of boards) {
      const row = listed.get(link.remote)
      if (!row) continue
      const { owner, copying } = sharing(row)
      if (owner !== link.owner || copying !== link.copying) saveLink(localId, { ...link, owner, copying, shared: row.shared })
      else if (row.shared !== link.shared) saveLink(localId, { ...link, shared: row.shared }, true)
    }
    for (const [localId, staleLink] of boards) {
      const link = linkFor(localId) ?? staleLink
      if (this.isLive(localId)) continue
      try {
        setStatus(localId, await this.syncBoard(localId, link, entries.get(localId)!, seqs))
      } catch (error) {
        this.problem(origin, error)
        setStatus(localId, statusFor(error), hintFor(origin, error))
      }
    }
  }

  private async syncBoard(localId: string, link: Link, entry: BoardEntry, seqs: Map<string, number>): Promise<SyncStatus> {
    const client = clientFor(link.origin)
    const codec = assetCodec(client, link.remote)
    if (!link.published) {
      const data = await decodeBoard(await platform.library.load(localId))
      link = await publishBoard(localId, link, { title: entry.title, background: bgPattern(data.background), items: data.items.map(toWire) })
    }
    const outbox = outboxFor(scopeOf(link))
    for (const { change, confirmed } of await outbox.list()) {
      if (confirmed) continue
      try {
        await client.submit(link.remote, await codec.encode(change))
        await outbox.confirm(change.id)
      } catch (error) {
        if (isReadOnlyError(error) || (error instanceof PermanentError && error.reason === 'read-only')) {
          this.log.warn('Board is read-only on the server; local edit was not applied remotely', { board: link.remote, change: change.id })
          await outbox.remove(change.id)
          throw error
        }
        if (error instanceof PermanentError && (error.reason === 'quota-exceeded' || error.reason === 'plan-required')) {
          await outbox.remove(change.id)
          throw error
        }
        if (isAccessError(error)) {
          const state = await serverCopyState(link)
          if (state !== 'here') return await settleServerCopy(localId, link, state) ?? 'synced'
        }
        if (!(error instanceof PermanentError) && (!isPermanent(error) || isAuthError(error) || isAccessError(error) || isQuotaError(error))) throw error
        this.log.warn('Dropped a change the server can never accept', { board: link.remote, change: change.id, reason: String(error) })
        await outbox.remove(change.id)
      }
    }
    const seq = seqs.get(link.remote)
    if (seq === undefined && link.seq !== null && link.published) {
      const status = await settleServerCopy(localId, link, await serverCopyState(link))
      if (status) return status
      if (!linkFor(localId)) return 'synced'
    } else if (seq !== link.seq) await this.pull(localId, link, entry)
    if (!this.isLive(localId)) await outbox.prune()
    return 'synced'
  }

  private async pull(localId: string, link: Link, entry: BoardEntry): Promise<void> {
    const client = clientFor(link.origin)
    const snapshot = await client.snapshot(link.remote)
    const state = stateOf({ ...snapshot, items: await assetCodec(client, link.remote).decodeItems(snapshot.items) })
    for (const { change, confirmed } of await outboxFor(scopeOf(link)).list()) if (!confirmed) applyChange(state, change)
    if (this.isLive(localId)) return
    const local = await platform.library.load(localId).then(decodeBoard).catch(() => null)
    const items = itemsOf(state.items.values())
    const background = withPattern(prefsStore.getState().background, isBackgroundKind(state.background) ? bgPattern(state.background) : bgPattern(local?.background ?? 'dots'))
    const thumb = await renderThumbnail(items, background, boardLibrary.editor.features).catch(() => null)
    const saved = await platform.library.save(localId, await encodeBoard({ items, background, camera: local?.camera ?? DEFAULT_CAMERA }), thumb)
    if (!saved.ok) throw new Error('Could not write the board on this device')
    if (state.title !== entry.title) await platform.library.rename(localId, state.title)
    saveLink(localId, { ...link, seq: snapshot.seq }, true)
    await boardLibrary.refreshLibrary()
  }

  private async community(origin: string): Promise<void> {
    try {
      await refreshCommunity(origin)
    } catch (error) {
      this.problem(origin, error)
    }
  }

  private problem(origin: string, error: unknown): void {
    if (error instanceof ApiError && error.status < 500) return
    const problem = `${origin}: ${String(error)}`
    if (problem === this.lastProblem || !navigator.onLine) return
    this.lastProblem = problem
    this.log.warn('Library sync could not reach the server', { origin, error: String(error) })
  }
}
