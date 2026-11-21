import { applyChange, applyToItem, copyState, stateOf, touched, type BoardState, type Touched } from './board'
import type { Change, Snapshot, WireItem } from './protocol'

export interface ViewDelta {
  items: Map<string, WireItem | null>
  title?: string
  background?: string
}

export type Received = { delta: ViewDelta; own: boolean } | 'stale' | 'gap'

export class Replica {
  private confirmed: BoardState
  private queue: Change[]
  private at: number

  constructor(snapshot: Snapshot, pending: readonly Change[] = []) {
    this.confirmed = stateOf(snapshot)
    this.at = snapshot.seq
    this.queue = [...pending]
  }

  get seq(): number {
    return this.at
  }

  get pending(): readonly Change[] {
    return this.queue
  }

  view(): BoardState {
    const state = copyState(this.confirmed)
    for (const change of this.queue) applyChange(state, change)
    return state
  }

  local(change: Change): void {
    this.queue.push(change)
  }

  receive(seq: number, change: Change): Received {
    if (seq <= this.at) return 'stale'
    if (seq !== this.at + 1) return 'gap'
    const own = this.drop(change.id) !== null
    applyChange(this.confirmed, change)
    this.at = seq
    return { delta: this.deltaFor(touched(change)), own }
  }

  settle(id: string): ViewDelta | null {
    const dropped = this.drop(id)
    return dropped ? this.deltaFor(touched(dropped)) : null
  }

  reset(snapshot: Snapshot, shown: Iterable<string>): ViewDelta {
    const ids = new Set(shown)
    for (const id of this.confirmed.items.keys()) ids.add(id)
    this.confirmed = stateOf(snapshot)
    this.at = snapshot.seq
    for (const id of this.confirmed.items.keys()) ids.add(id)
    for (const change of this.queue) for (const id of touched(change).ids) ids.add(id)
    return this.deltaFor({ ids, meta: true })
  }

  deltaFor({ ids, meta }: Touched): ViewDelta {
    const items = new Map<string, WireItem | null>()
    for (const id of ids) {
      let item = this.confirmed.items.get(id)
      for (const change of this.queue) item = applyToItem(item, id, change)
      items.set(id, item ?? null)
    }
    if (!meta) return { items }
    const state: BoardState = { ...this.confirmed, items: new Map() }
    for (const change of this.queue) applyChange(state, change)
    return { items, title: state.title, background: state.background }
  }

  private drop(id: string): Change | null {
    const index = this.queue.findIndex(change => change.id === id)
    return index < 0 ? null : this.queue.splice(index, 1)[0]
  }
}
