import type { Change, Json, JsonObject, Op, Snapshot, WireItem } from './protocol'

export interface BoardState {
  title: string
  background: string
  items: Map<string, WireItem>
}

export interface Touched {
  ids: Set<string>
  meta: boolean
}

export const stateOf = (snapshot: Snapshot): BoardState => ({
  title: snapshot.title,
  background: snapshot.background,
  items: new Map(snapshot.items.map(item => [item.id, item]))
})

export const copyState = (state: BoardState): BoardState => ({ ...state, items: new Map(state.items) })

const opItem = (op: Op): string | null => op.op === 'put' ? op.item.id : op.op === 'meta' ? null : op.id

function patched(item: WireItem, set: JsonObject = {}, unset: string[] = []): WireItem {
  const next: WireItem = { ...item, ...set, id: item.id }
  for (const field of unset) delete next[field]
  return next
}

export function applyChange(state: BoardState, change: Change): void {
  for (const op of change.ops) {
    switch (op.op) {
      case 'put':
        state.items.set(op.item.id, op.item)
        break
      case 'patch': {
        const item = state.items.get(op.id)
        if (item) state.items.set(op.id, patched(item, op.set, op.unset))
        break
      }
      case 'delete':
        state.items.delete(op.id)
        break
      case 'meta':
        state.title = op.title ?? state.title
        state.background = op.background ?? state.background
        break
    }
  }
}

export function applyToItem(item: WireItem | undefined, id: string, change: Change): WireItem | undefined {
  let current = item
  for (const op of change.ops) {
    if (opItem(op) !== id) continue
    if (op.op === 'put') current = op.item
    else if (op.op === 'delete') current = undefined
    else if (op.op === 'patch' && current) current = patched(current, op.set, op.unset)
  }
  return current
}

export function touched(change: Change): Touched {
  const ids = new Set<string>()
  let meta = false
  for (const op of change.ops) {
    const id = opItem(op)
    if (id === null) meta = true
    else ids.add(id)
  }
  return { ids, meta }
}

export function sameJson(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameJson(value, b[i]))
  }
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => key in b && sameJson(a[key], b[key]))
}

export function diffItem(before: WireItem, after: WireItem): Op | null {
  if (before.type !== after.type) return { op: 'put', item: after }
  const set: JsonObject = {}
  const unset: string[] = []
  for (const key of Object.keys(after)) if (key !== 'id' && !sameJson(before[key], after[key])) set[key] = after[key]
  for (const key of Object.keys(before)) if (!(key in after)) unset.push(key)
  if (!Object.keys(set).length && !unset.length) return null
  return { op: 'patch', id: after.id, ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) }
}
