import type { Item } from '@penrill/core/types'
import { applyChange, stateOf } from '@penrill/sync/board'
import type { WireItem } from '@penrill/sync/protocol'
import { PermanentError, type Logger } from '@penrill/sync/session'
import { create } from 'zustand'
import { DEFAULT_CAMERA } from '../../../board/editor'
import { renderThumbnail } from '../../../board/engine/export'
import { decodeBoard, encodeBoard } from '../../../board/engine/serialize'
import { isBackgroundKind } from '../../../board/engine/surface'
import type { BoardEntry } from '../../../shared/library'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { account } from './accounts'
import { ApiError, isAccessError, isAuthError, isPermanent, type BoardContent, type RemoteBoard } from './api'
import { assetCodec } from './assets'
import { clientFor } from './clients'
import { linkedBoards, saveLink, scopeOf, type Link } from './links'
import { outboxFor } from './outbox'
import { fromWire, toWire } from './wire'

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'denied'

export const useSyncStatus = create<{ states: Record<string, SyncStatus> }>(() => ({ states: {} }))

export const useRemoteBoards = create<{ origin: string; rows: RemoteBoard[]; error: boolean }>(() => ({ origin: '', rows: [], error: false }))

export function setStatus(localId: string, status: SyncStatus): void {
  if (useSyncStatus.getState().states[localId] === status) return
  useSyncStatus.setState(({ states }) => ({ states: { ...states, [localId]: status } }))
}

export const statusFor = (error: unknown): SyncStatus => isAuthError(error) || isAccessError(error) ? 'denied' : 'offline'

const itemsOf = (wires: Iterable<WireItem>): Item[] =>
  [...wires].map(fromWire).filter((item): item is Item => !!item).sort((a, b) => a.z - b.z)

export async function publishBoard(localId: string, link: Link, content: BoardContent): Promise<Link> {
  const client = clientFor(link.origin)
  const encoded = await assetCodec(client, link.remote).encode({ id: 'publish', ops: content.items.map(item => ({ op: 'put', item })) })
  const items = encoded.ops.flatMap(op => op.op === 'put' ? [op.item] : [])
  const result = await client.createBoard(link.remote, { ...content, items })
  const published = { ...link, published: true, seq: result.created ? result.seq : null }
  saveLink(localId, published)
  return published
}

export async function remoteBoard(origin: string, remote: string) {
  const client = clientFor(origin)
  const snapshot = await client.snapshot(remote)
  const items = itemsOf(await assetCodec(client, remote).decodeItems(snapshot.items))
  return { snapshot, items, background: isBackgroundKind(snapshot.background) ? snapshot.background : 'dots' as const }
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
    saveLink(entry.id, { origin, user, remote: row.id, seq: snapshot.seq, published: true })
    return entry.id
  })
  if (!await boardLibrary.openBoard(localId)) throw new Error('Could not open the board')
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
    if (origin === this.listedOrigin()) useRemoteBoards.setState({ origin, rows, error: false })
    const seqs = new Map(rows.map(row => [row.id, row.seq]))
    for (const [localId, link] of boards) {
      if (this.isLive(localId)) continue
      try {
        setStatus(localId, await this.syncBoard(localId, link, entries.get(localId)!, seqs))
      } catch (error) {
        this.problem(origin, error)
        setStatus(localId, statusFor(error))
      }
    }
  }

  private async syncBoard(localId: string, link: Link, entry: BoardEntry, seqs: Map<string, number>): Promise<'synced' | 'denied'> {
    const client = clientFor(link.origin)
    const codec = assetCodec(client, link.remote)
    if (!link.published) {
      const data = await decodeBoard(await platform.library.load(localId))
      link = await publishBoard(localId, link, { title: entry.title, background: data.background, items: data.items.map(toWire) })
    }
    const outbox = outboxFor(scopeOf(link))
    for (const { change, confirmed } of await outbox.list()) {
      if (confirmed) continue
      try {
        await client.submit(link.remote, await codec.encode(change))
        await outbox.confirm(change.id)
      } catch (error) {
        if (!(error instanceof PermanentError) && (!isPermanent(error) || isAuthError(error) || isAccessError(error))) throw error
        this.log.warn('Dropped a change the server can never accept', { board: link.remote, change: change.id, reason: String(error) })
        await outbox.remove(change.id)
      }
    }
    const seq = seqs.get(link.remote)
    if (seq === undefined && link.seq !== null && link.published) return 'denied'
    if (seq !== link.seq) await this.pull(localId, link, entry)
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
    const background = isBackgroundKind(state.background) ? state.background : local?.background ?? 'dots'
    const thumb = await renderThumbnail(items, background, boardLibrary.editor.features).catch(() => null)
    const saved = await platform.library.save(localId, await encodeBoard({ items, background, camera: local?.camera ?? DEFAULT_CAMERA }), thumb)
    if (!saved.ok) throw new Error('Could not write the board on this device')
    if (state.title !== entry.title) await platform.library.rename(localId, state.title)
    saveLink(localId, { ...link, seq: snapshot.seq }, true)
    await boardLibrary.refreshLibrary()
  }

  private problem(origin: string, error: unknown): void {
    if (error instanceof ApiError && error.status < 500) return
    const problem = `${origin}: ${String(error)}`
    if (problem === this.lastProblem || !navigator.onLine) return
    this.lastProblem = problem
    this.log.warn('Library sync could not reach the server', { origin, error: String(error) })
  }
}
