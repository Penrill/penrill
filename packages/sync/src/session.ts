import { applyChange, applyToItem, touched, type BoardState } from './board'
import { PROTOCOL, parseServerMessage, type Change, type ClientMessage, type JsonObject, type Peer, type SequencedChange, type ServerMessage, type Snapshot, type WireItem } from './protocol'
import { Replica, type ViewDelta } from './replica'

export interface Connection {
  send(message: ClientMessage): boolean
  close(): void
}

export interface ConnectionEvents {
  open(): void
  message(text: string): void
  close(code: number): void
}

export interface Transport {
  connect(events: ConnectionEvents): Connection
}

export interface OutboxEntry {
  change: Change
  confirmed: boolean
}

export interface Outbox {
  list(): Promise<OutboxEntry[]>
  add(change: Change): Promise<void>
  confirm(id: string): Promise<void>
  remove(id: string): Promise<void>
}

export class PermanentError extends Error {}

export interface WireCodec {
  encode(change: Change): Promise<Change>
  decode(change: Change): Promise<Change>
  decodeItems(items: WireItem[]): Promise<WireItem[]>
}

export interface DocumentPort {
  ids(): Iterable<string>
  item(id: string): WireItem | undefined
  meta(): { title: string; background: string }
  flush(): void
  apply(delta: ViewDelta): void
}

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
  now(): number
  random(): number
}

export interface Logger {
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
}

export type SessionStatus = 'connecting' | 'live' | 'offline' | 'signed-out' | 'no-access' | 'stopped'

export interface SessionState {
  status: SessionStatus
  pending: number
  seq: number | null
}

export interface SessionPorts {
  transport: Transport
  outbox: Outbox
  codec: WireCodec
  document: DocumentPort
  timers: Timers
  log: Logger
  token(): string | null
  onState?(state: SessionState): void
  onPeers?(peers: Peer[]): void
  onSignal?(peer: Peer, data: JsonObject): void
}

export const WINDOW = 32
export const HEARTBEAT_MS = 15_000
export const SILENCE_MS = 30_000
export const CONNECT_TIMEOUT_MS = 15_000
const BACKOFF_MIN_MS = 500
const BACKOFF_MAX_MS = 10_000

export function replay(document: Pick<DocumentPort, 'item' | 'meta'>, changes: readonly Change[]): ViewDelta {
  const ids = new Set<string>()
  let meta = false
  for (const change of changes) {
    const touch = touched(change)
    for (const id of touch.ids) ids.add(id)
    meta ||= touch.meta
  }
  const items = new Map<string, WireItem | null>()
  for (const id of ids) {
    let item = document.item(id)
    for (const change of changes) item = applyToItem(item, id, change)
    items.set(id, item ?? null)
  }
  if (!meta) return { items }
  const state: BoardState = { ...document.meta(), items: new Map() }
  for (const change of changes) applyChange(state, change)
  return { items, title: state.title, background: state.background }
}

export class LiveSession {
  private readonly core: Core

  constructor(ports: SessionPorts) {
    this.core = new Core(ports)
  }

  get status(): SessionStatus {
    return this.core.phase.status
  }

  get pending(): readonly Change[] {
    return this.core.pending
  }

  get seq(): number | null {
    return this.core.replica?.seq ?? null
  }

  start(): Promise<void> {
    return this.core.start()
  }

  local(change: Change): void {
    this.core.local(change)
  }

  signal(data: JsonObject): void {
    if (this.core.phase instanceof Live) this.core.connection?.send({ type: 'signal', data })
  }

  wake(): void {
    this.core.phase.wake()
  }

  stop(): void {
    this.core.stop()
  }
}

abstract class Phase {
  abstract readonly status: SessionStatus
  protected readonly core: Core

  constructor(core: Core) {
    this.core = core
  }

  enter(): void {}

  exit(): void {}

  message(_message: ServerMessage): void | Promise<void> {}

  closed(code: number): void {
    this.core.closedWith(code)
  }

  wake(): void {}
}

class Connecting extends Phase {
  readonly status = 'connecting'
  private timeout: unknown = null

  enter(): void {
    this.timeout = this.core.ports.timers.set(() => {
      this.core.ports.log.info('Connecting took too long, trying again')
      this.core.drop()
    }, CONNECT_TIMEOUT_MS)
  }

  exit(): void {
    this.core.ports.timers.clear(this.timeout)
  }

  async message(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'snapshot':
        await this.core.takeSnapshot(message.board)
        break
      case 'changes':
        for (const change of message.changes) await this.core.takeChange(change)
        break
      case 'ready':
        if (this.core.replica?.seq !== message.seq) {
          this.core.ports.log.warn('The catch-up did not end where the server is; starting over', { seq: message.seq })
          this.core.replica = null
          this.core.drop()
          return
        }
        this.core.setPeers(message.peers)
        this.core.transition(new Live(this.core))
        break
    }
  }
}

class Live extends Phase {
  readonly status = 'live'
  private heartbeat: unknown = null

  enter(): void {
    this.core.attempts = 0
    this.core.backOnline()
    this.beat()
    this.core.pump()
  }

  exit(): void {
    this.core.ports.timers.clear(this.heartbeat)
  }

  async message(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case 'change':
        await this.core.takeChange(message)
        break
      case 'ack':
        this.core.settle(message.id, true)
        break
      case 'reject':
        this.core.ports.log.warn('The server refused a change for good', { change: message.id, reason: message.reason })
        this.core.settle(message.id, false)
        break
      case 'signal':
        this.core.ports.onSignal?.({ client: message.client, user: message.user }, message.data)
        break
      case 'join':
        this.core.peers.set(message.client, { client: message.client, user: message.user })
        this.core.publishPeers()
        break
      case 'leave':
        this.core.peers.delete(message.client)
        this.core.publishPeers()
        break
    }
  }

  private beat(): void {
    this.heartbeat = this.core.ports.timers.set(() => {
      if (this.core.ports.timers.now() - this.core.lastHeard > SILENCE_MS) {
        this.core.ports.log.info('The connection went silent, reconnecting')
        this.core.drop()
        return
      }
      this.core.connection?.send({ type: 'ping' })
      this.beat()
    }, HEARTBEAT_MS)
  }
}

class Waiting extends Phase {
  readonly status = 'offline'
  private timer: unknown = null

  enter(): void {
    const { timers } = this.core.ports
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.core.attempts++) * (0.7 + 0.6 * timers.random())
    this.timer = timers.set(() => this.core.connect(), delay)
  }

  exit(): void {
    this.core.ports.timers.clear(this.timer)
  }

  wake(): void {
    this.core.connect()
  }
}

class Denied extends Phase {
  readonly status: 'signed-out' | 'no-access'

  constructor(core: Core, status: 'signed-out' | 'no-access') {
    super(core)
    this.status = status
  }

  wake(): void {
    if (this.status === 'signed-out') this.core.connect()
  }
}

class Stopped extends Phase {
  readonly status = 'stopped'

  closed(): void {}
}

class Core {
  phase: Phase = new Stopped(this)
  replica: Replica | null = null
  connection: Connection | null = null
  attempts = 0
  lastHeard = 0
  readonly peers = new Map<string, Peer>()
  private early: Change[] = []
  private epoch = 0
  private inbox: Promise<void> = Promise.resolve()
  private persisted: Promise<void> = Promise.resolve()
  private readonly inFlight = new Set<string>()
  private pumping = false
  private offlineSince: number | null = null
  readonly ports: SessionPorts

  constructor(ports: SessionPorts) {
    this.ports = ports
  }

  get pending(): readonly Change[] {
    return this.replica?.pending ?? this.early
  }

  async start(): Promise<void> {
    const current = new Set(this.early.map(change => change.id))
    const saved = (await this.ports.outbox.list()).filter(entry => !current.has(entry.change.id))
    this.early.unshift(...saved.flatMap(entry => entry.confirmed ? [] : [entry.change]))
    if (saved.length) this.ports.document.apply(replay(this.ports.document, saved.map(entry => entry.change)))
    this.connect()
  }

  local(change: Change): void {
    if (this.replica) this.replica.local(change)
    else this.early.push(change)
    this.persisted = this.persisted
      .then(() => this.ports.outbox.add(change))
      .catch(error => this.ports.log.warn('Could not keep a change for a later retry', { error: String(error) }))
    this.report()
    this.pump()
  }

  stop(): void {
    this.epoch++
    this.connection?.close()
    this.connection = null
    this.transition(new Stopped(this))
  }

  connect(): void {
    const token = this.ports.token()
    if (!token) {
      this.transition(new Denied(this, 'signed-out'))
      return
    }
    const epoch = ++this.epoch
    this.inFlight.clear()
    this.connection?.close()
    this.transition(new Connecting(this))
    this.connection = this.ports.transport.connect({
      open: () => {
        if (epoch !== this.epoch) return
        this.lastHeard = this.ports.timers.now()
        this.connection?.send({ type: 'hello', protocol: PROTOCOL, token, after: this.replica?.seq ?? null })
      },
      message: text => {
        if (epoch !== this.epoch) return
        this.lastHeard = this.ports.timers.now()
        const message = parseServerMessage(text)
        if (!message) {
          this.ports.log.warn('Ignored a malformed message from the server')
          return
        }
        this.enqueue(epoch, () => this.phase.message(message))
      },
      close: code => {
        if (epoch === this.epoch) this.enqueue(epoch, () => this.phase.closed(code))
      }
    })
  }

  drop(): void {
    this.epoch++
    this.connection?.close()
    this.connection = null
    this.wentOffline()
    this.transition(new Waiting(this))
  }

  closedWith(code: number): void {
    this.connection = null
    this.wentOffline()
    if (code === 4401) this.transition(new Denied(this, 'signed-out'))
    else if (code === 4403 || code === 4404) this.transition(new Denied(this, 'no-access'))
    else this.transition(new Waiting(this))
  }

  transition(next: Phase): void {
    this.phase.exit()
    this.phase = next
    next.enter()
    this.report()
  }

  async takeSnapshot(board: Snapshot): Promise<void> {
    const snapshot = { ...board, items: await this.ports.codec.decodeItems(board.items) }
    this.ports.document.flush()
    this.replica ??= new Replica(snapshot, this.early.splice(0))
    this.ports.document.apply(this.replica.reset(snapshot, this.ports.document.ids()))
  }

  async takeChange({ seq, change }: SequencedChange): Promise<void> {
    const replica = this.replica
    if (!replica) throw new Error('The server sent changes before a snapshot.')
    if (seq <= replica.seq) return
    const mine = replica.pending.find(candidate => candidate.id === change.id)
    const local = mine ?? await this.ports.codec.decode(change)
    this.ports.document.flush()
    const result = replica.receive(seq, local)
    if (result === 'stale') return
    if (result === 'gap') {
      this.ports.log.warn('Missed changes from the server, catching up', { expected: replica.seq + 1, received: seq })
      this.drop()
      return
    }
    this.ports.document.apply(result.delta)
    if (result.own) this.finished(change.id, true)
  }

  settle(id: string, accepted: boolean): void {
    this.ports.document.flush()
    const delta = this.replica?.settle(id)
    if (delta) this.ports.document.apply(delta)
    this.finished(id, accepted)
  }

  pump(): void {
    if (this.pumping || !(this.phase instanceof Live) || !this.replica) return
    this.pumping = true
    const epoch = this.epoch
    void this.send(epoch)
      .catch(error => {
        this.ports.log.warn('Could not send changes, will retry', { error: String(error) })
        if (epoch === this.epoch) this.drop()
      })
      .finally(() => {
        this.pumping = false
      })
  }

  setPeers(peers: Peer[]): void {
    this.peers.clear()
    for (const peer of peers) this.peers.set(peer.client, peer)
    this.publishPeers()
  }

  publishPeers(): void {
    this.ports.onPeers?.([...this.peers.values()])
  }

  backOnline(): void {
    if (this.offlineSince === null) return
    const seconds = Math.round((this.ports.timers.now() - this.offlineSince) / 1000)
    this.ports.log.info('Back online', { offlineSeconds: seconds, pending: this.pending.length })
    this.offlineSince = null
  }

  private wentOffline(): void {
    if (this.peers.size) this.setPeers([])
    if (this.offlineSince !== null || !(this.phase instanceof Live)) return
    this.offlineSince = this.ports.timers.now()
    this.ports.log.info('Connection lost; edits are kept and will be sent on reconnect', { pending: this.pending.length })
  }

  private async send(epoch: number): Promise<void> {
    while (epoch === this.epoch && this.phase instanceof Live && this.replica && this.inFlight.size < WINDOW) {
      const next = this.replica.pending.find(change => !this.inFlight.has(change.id))
      if (!next) return
      this.inFlight.add(next.id)
      await this.persisted
      let wire: Change
      try {
        wire = await this.ports.codec.encode(next)
      } catch (error) {
        if (!(error instanceof PermanentError)) throw error
        this.ports.log.warn('Dropped a change the server can never accept', { change: next.id, reason: error.message })
        this.settle(next.id, false)
        continue
      }
      if (epoch !== this.epoch) return
      if (!this.connection?.send({ type: 'submit', change: wire })) {
        this.inFlight.delete(next.id)
        return
      }
    }
  }

  private finished(id: string, accepted: boolean): void {
    this.inFlight.delete(id)
    this.persisted = this.persisted
      .then(() => accepted ? this.ports.outbox.confirm(id) : this.ports.outbox.remove(id))
      .catch(error => this.ports.log.warn('Could not update the outbox', { error: String(error) }))
    this.report()
    this.pump()
  }

  private enqueue(epoch: number, task: () => void | Promise<void>): void {
    this.inbox = this.inbox
      .then(async () => {
        if (epoch === this.epoch) await task()
      })
      .catch(error => {
        this.ports.log.warn('Could not apply a server message, reconnecting', { error: String(error) })
        if (epoch === this.epoch) this.drop()
      })
  }

  private report(): void {
    this.ports.onState?.({ status: this.phase.status, pending: this.pending.length, seq: this.replica?.seq ?? null })
  }
}
