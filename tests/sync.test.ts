// Board sync engine (packages/sync): replica convergence and the live session under dropped connections.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyChange, diffItem, sameJson, stateOf } from '@penrill/sync/board'
import type { Change, ClientMessage, Op, ServerMessage, Snapshot, WireItem } from '@penrill/sync/protocol'
import { Replica, type ViewDelta } from '@penrill/sync/replica'
import { LiveSession, WINDOW, SILENCE_MS, HEARTBEAT_MS, type ConnectionEvents, type DocumentPort, type Outbox, type OutboxEntry, type SessionState } from '@penrill/sync/session'

let next = 0
const change = (...ops: Op[]): Change => ({ id: 'c' + ++next, ops })
const put = (id: string, fields: Record<string, number | string> = {}): Op => ({ op: 'put', item: { id, z: 1, ...fields } })
const snapshot = (seq: number, items: WireItem[] = [], title = 'Board'): Snapshot => ({ id: 'b', seq, title, background: 'dots', items })

class Server {
  seq = 0
  readonly log: Change[] = []
  readonly state = stateOf(snapshot(0))
  accept(c: Change): number {
    if (this.log.some(known => known.id === c.id)) return this.log.findIndex(known => known.id === c.id) + 1
    this.log.push(c)
    applyChange(this.state, c)
    return ++this.seq
  }
}

test('replicas converge field by field whatever the interleaving', () => {
  const server = new Server()
  const a = new Replica(snapshot(0))
  const b = new Replica(snapshot(0))
  const seed = change(put('x', { color: 'red', size: 1 }))
  a.local(seed)
  server.accept(seed)
  a.receive(1, seed)
  b.receive(1, seed)

  const recolor = change({ op: 'patch', id: 'x', set: { color: 'blue' } })
  const resize = change({ op: 'patch', id: 'x', set: { size: 4 } })
  a.local(recolor)
  b.local(resize)
  assert.equal(a.view().items.get('x')?.color, 'blue')
  assert.equal(b.view().items.get('x')?.size, 4)

  for (const c of [resize, recolor]) {
    const seq = server.accept(c)
    a.receive(seq, c)
    b.receive(seq, c)
  }
  const expected = { id: 'x', z: 1, color: 'blue', size: 4 }
  assert.deepEqual(a.view().items.get('x'), expected)
  assert.deepEqual(b.view().items.get('x'), expected)
  assert.equal(a.pending.length + b.pending.length, 0)
})

test('a deletion wins over an edit that arrives after it', () => {
  const r = new Replica(snapshot(3, [{ id: 'x', z: 1, color: 'red' }]))
  r.local(change({ op: 'patch', id: 'x', set: { color: 'green' } }))
  const result = r.receive(4, change({ op: 'delete', id: 'x' }))
  assert.notEqual(typeof result, 'string')
  assert.equal((result as { delta: ViewDelta }).delta.items.get('x'), null)
  assert.equal(r.view().items.has('x'), false)
})

test('a replica reports gaps and ignores changes it already has', () => {
  const r = new Replica(snapshot(5))
  assert.equal(r.receive(5, change(put('a'))), 'stale')
  assert.equal(r.receive(7, change(put('a'))), 'gap')
})

test('item diffs patch changed fields and ignore key order', () => {
  assert.ok(sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }))
  assert.deepEqual(diffItem({ id: 'x', type: 'text', x: 1, rot: 2 }, { id: 'x', type: 'text', x: 5 }),
    { op: 'patch', id: 'x', set: { x: 5 }, unset: ['rot'] })
  assert.equal(diffItem({ id: 'x', a: [1, 2] }, { a: [1, 2], id: 'x' }), null)
  assert.equal(diffItem({ id: 'x', type: 'text' }, { id: 'x', type: 'image' })?.op, 'put')
})

class Document implements DocumentPort {
  readonly items = new Map<string, WireItem>()
  title = 'Board'
  background = 'dots'
  session?: LiveSession
  private edits: Change[] = []
  ids() { return this.items.keys() }
  item(id: string) { return this.items.get(id) }
  meta() { return { title: this.title, background: this.background } }
  flush() {
    for (const c of this.edits.splice(0)) this.session!.local(c)
  }
  apply(delta: ViewDelta) {
    for (const [id, item] of delta.items) item ? this.items.set(id, item) : this.items.delete(id)
    this.title = delta.title ?? this.title
    this.background = delta.background ?? this.background
  }
  edit(c: Change) {
    const state = { title: this.title, background: this.background, items: this.items }
    applyChange(state, c)
    this.title = state.title
    this.edits.push(c)
  }
}

class Timers {
  time = 0
  private queue: { at: number; fn: () => void; id: number }[] = []
  private ids = 0
  set = (fn: () => void, ms: number) => {
    const id = ++this.ids
    this.queue.push({ at: this.time + ms, fn, id })
    return id
  }
  clear = (handle: unknown) => {
    this.queue = this.queue.filter(entry => entry.id !== handle)
  }
  now = () => this.time
  random = () => 0.5
  advance(ms: number) {
    const until = this.time + ms
    for (;;) {
      const due = this.queue.filter(entry => entry.at <= until).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.queue = this.queue.filter(entry => entry !== due)
      this.time = due.at
      due.fn()
    }
    this.time = until
  }
}

class Socket {
  readonly sent: ClientMessage[] = []
  closed = false
  readonly events: ConnectionEvents
  constructor(events: ConnectionEvents) { this.events = events }
  send(message: ClientMessage) {
    if (this.closed) return false
    this.sent.push(message)
    return true
  }
  close() { this.closed = true }
  receive(message: ServerMessage) { this.events.message(JSON.stringify(message)) }
  submitted() { return this.sent.flatMap(m => m.type === 'submit' ? [m.change] : []) }
}

class MemoryOutbox implements Outbox {
  entries: OutboxEntry[] = []
  get changes() { return this.entries.filter(entry => !entry.confirmed).map(entry => entry.change) }
  async list() { return this.entries.map(entry => ({ ...entry })) }
  async add(change: Change) { this.entries.push({ change, confirmed: false }) }
  async confirm(id: string) { for (const entry of this.entries) if (entry.change.id === id) entry.confirmed = true }
  async remove(id: string) { this.entries = this.entries.filter(entry => entry.change.id !== id) }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve))
}

function harness(token: string | null = 'token') {
  const document = new Document()
  const timers = new Timers()
  const outbox = new MemoryOutbox()
  const sockets: Socket[] = []
  const states: SessionState[] = []
  const warnings: string[] = []
  const identity = { encode: async (c: Change) => c, decode: async (c: Change) => c, decodeItems: async (items: WireItem[]) => items }
  const session = new LiveSession({
    transport: { connect: events => { const socket = new Socket(events); sockets.push(socket); return socket } },
    outbox, codec: identity, document, timers, token: () => token,
    log: { info: () => {}, warn: message => { warnings.push(message) } },
    onState: state => { states.push(state) }
  })
  document.session = session
  const socket = () => sockets[sockets.length - 1]
  async function join(board: Snapshot | null, seq: number) {
    socket().events.open()
    if (board) socket().receive({ type: 'snapshot', board })
    socket().receive({ type: 'ready', seq, peers: [] })
    await settle()
  }
  return { document, timers, outbox, sockets, states, warnings, session, socket, join }
}

test('a live session sends edits, keeps them until the server accepts them, and drops them after', async () => {
  const { document, outbox, session, socket, join } = harness()
  await session.start()
  await join(snapshot(0), 0)
  assert.deepEqual(socket().sent[0], { type: 'hello', protocol: 1, token: 'token', after: null })
  const c = change(put('a'))
  document.edit(c)
  document.flush()
  await settle()
  assert.deepEqual(socket().submitted(), [c])
  assert.equal(outbox.changes.length, 1)
  socket().receive({ type: 'change', seq: 1, author: 'ann', change: c })
  await settle()
  assert.equal(outbox.changes.length, 0)
  assert.equal(session.pending.length, 0)
  assert.equal(session.status, 'live')
})

test('after a dropped connection the session resumes from its last seq and resends unconfirmed edits', async () => {
  const { document, timers, session, sockets, socket, join } = harness()
  await session.start()
  await join(snapshot(0), 0)
  const first = change(put('a'))
  document.edit(first)
  document.flush()
  await settle()
  socket().receive({ type: 'change', seq: 1, author: 'ann', change: first })
  const lost = change(put('b'))
  document.edit(lost)
  document.flush()
  await settle()
  socket().events.close(1006)
  await settle()
  assert.equal(session.status, 'offline')

  const offline = change(put('c'))
  document.edit(offline)
  document.flush()
  timers.advance(1000)
  assert.equal(sockets.length, 2)
  socket().events.open()
  assert.deepEqual(socket().sent[0], { type: 'hello', protocol: 1, token: 'token', after: 1 })
  const theirs = change(put('d'))
  socket().receive({ type: 'changes', changes: [{ seq: 2, author: 'bob', change: theirs }] })
  socket().receive({ type: 'ready', seq: 2, peers: [] })
  await settle()
  assert.deepEqual(socket().submitted().map(c => c.id), [lost.id, offline.id])
  assert.deepEqual([...document.items.keys()].sort(), ['a', 'b', 'c', 'd'])
})

test('edits saved before a power cut come back before the server answers', async () => {
  const { document, outbox, session } = harness()
  const saved = change(put('a', { color: 'red' }), { op: 'meta', title: 'Physics' })
  outbox.entries.push({ change: saved, confirmed: false })
  await session.start()
  assert.equal(document.items.get('a')?.color, 'red')
  assert.equal(document.title, 'Physics')
  assert.deepEqual(session.pending, [saved])
})

test('the first snapshot replaces the device copy but keeps unconfirmed edits on top', async () => {
  const { document, outbox, session, join, socket } = harness()
  document.items.set('stale', { id: 'stale', z: 1 })
  const saved = change({ op: 'patch', id: 'shared', set: { color: 'green' } })
  outbox.entries.push({ change: saved, confirmed: false })
  await session.start()
  await join(snapshot(9, [{ id: 'shared', z: 1, color: 'red', size: 2 }]), 9)
  assert.deepEqual([...document.items.keys()], ['shared'])
  assert.deepEqual(document.items.get('shared'), { id: 'shared', z: 1, color: 'green', size: 2 })
  assert.deepEqual(socket().submitted(), [saved])
})

test('accepted edits not yet in the device copy come back after a crash, without being sent again', async () => {
  const { document, outbox, session, socket, join } = harness()
  const accepted = change(put('a', { color: 'red' }))
  outbox.entries.push({ change: accepted, confirmed: true })
  await session.start()
  assert.equal(document.items.get('a')?.color, 'red')
  assert.equal(session.pending.length, 0)
  await join(snapshot(4, [{ id: 'a', z: 1, color: 'red' }]), 4)
  assert.deepEqual(socket().submitted(), [])
})

test('a refused change is dropped and the board shows the server state again', async () => {
  const { document, outbox, session, socket, join, warnings } = harness()
  await session.start()
  await join(snapshot(0, [{ id: 'a', z: 1, color: 'red' }]), 0)
  const bad = change({ op: 'patch', id: 'a', set: { color: 'blue' } })
  document.edit(bad)
  document.flush()
  await settle()
  socket().receive({ type: 'reject', id: bad.id, reason: 'invalid' })
  await settle()
  assert.equal(document.items.get('a')?.color, 'red')
  assert.equal(outbox.changes.length, 0)
  assert.equal(warnings.length, 1)
})

test('at most a window of changes is in flight', async () => {
  const { document, session, socket, join } = harness()
  await session.start()
  await join(snapshot(0), 0)
  const all = Array.from({ length: WINDOW + 8 }, (_, i) => change(put('i' + i)))
  for (const c of all) document.edit(c)
  document.flush()
  await settle()
  assert.equal(socket().submitted().length, WINDOW)
  socket().receive({ type: 'change', seq: 1, author: 'ann', change: all[0] })
  await settle()
  assert.equal(socket().submitted().length, WINDOW + 1)
})

test('missing changes and a silent connection both lead to a reconnect', async () => {
  const { timers, session, sockets, socket, join } = harness()
  await session.start()
  await join(snapshot(0), 0)
  socket().receive({ type: 'change', seq: 2, author: 'bob', change: change(put('x')) })
  await settle()
  assert.equal(session.status, 'offline')
  timers.advance(1000)
  await join(null, 0)
  assert.equal(sockets.length, 2)
  assert.equal(session.status, 'live')
  timers.advance(HEARTBEAT_MS)
  assert.deepEqual(socket().sent.at(-1), { type: 'ping' })
  timers.advance(SILENCE_MS)
  assert.equal(session.status, 'offline')
})

test('a revoked session stops reconnecting', async () => {
  const { timers, session, sockets, socket } = harness()
  await session.start()
  socket().events.close(4401)
  await settle()
  assert.equal(session.status, 'signed-out')
  timers.advance(60_000)
  assert.equal(sockets.length, 1)
})
