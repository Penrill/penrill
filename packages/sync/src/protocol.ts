export const PROTOCOL = 1

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

export interface WireItem {
  id: string
  [field: string]: Json
}

export type Op =
  | { op: 'put'; item: WireItem }
  | { op: 'patch'; id: string; set?: JsonObject; unset?: string[] }
  | { op: 'delete'; id: string }
  | { op: 'meta'; title?: string; background?: string }

export interface Change {
  id: string
  ops: Op[]
}

export interface Snapshot {
  id: string
  seq: number
  title: string
  background: string
  items: WireItem[]
}

export interface SequencedChange {
  seq: number
  author: string
  change: Change
}

export interface Peer {
  client: string
  user: string
}

export type ServerMessage =
  | { type: 'welcome'; client: string; user: string }
  | { type: 'snapshot'; board: Snapshot }
  | { type: 'changes'; changes: SequencedChange[] }
  | { type: 'ready'; seq: number; peers: Peer[] }
  | ({ type: 'change' } & SequencedChange)
  | { type: 'ack'; id: string; seq: number }
  | { type: 'reject'; id: string; reason: string }
  | { type: 'signal'; client: string; user: string; data: JsonObject }
  | { type: 'join' | 'leave'; client: string; user: string }
  | { type: 'pong' }

export type ClientMessage =
  | { type: 'hello'; protocol: typeof PROTOCOL; token: string; after: number | null }
  | { type: 'submit'; change: Change }
  | { type: 'signal'; data: JsonObject }
  | { type: 'ping' }

type Shape = Record<string, unknown>

const isObject = (value: unknown): value is Shape => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isSeq = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isPeer = (value: unknown): value is Peer => isObject(value) && isText(value.client) && typeof value.user === 'string'
const isItem = (value: unknown): value is WireItem => isObject(value) && isText(value.id)

function isOp(value: unknown): value is Op {
  if (!isObject(value)) return false
  switch (value.op) {
    case 'put': return isItem(value.item)
    case 'patch': return isText(value.id) && (value.set === undefined || isObject(value.set)) &&
      (value.unset === undefined || (Array.isArray(value.unset) && value.unset.every(isText)))
    case 'delete': return isText(value.id)
    case 'meta': return (value.title === undefined || isText(value.title)) && (value.background === undefined || isText(value.background))
    default: return false
  }
}

export const isChange = (value: unknown): value is Change =>
  isObject(value) && isText(value.id) && Array.isArray(value.ops) && value.ops.every(isOp)

export const isSnapshot = (value: unknown): value is Snapshot =>
  isObject(value) && isText(value.id) && isSeq(value.seq) && typeof value.title === 'string' &&
  typeof value.background === 'string' && Array.isArray(value.items) && value.items.every(isItem)

export const isSequenced = (value: unknown): value is SequencedChange =>
  isObject(value) && isSeq(value.seq) && typeof value.author === 'string' && isChange(value.change)

export function parseServerMessage(text: string): ServerMessage | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(value)) return null
  const valid = (() => {
    switch (value.type) {
      case 'welcome': return isText(value.client) && typeof value.user === 'string'
      case 'snapshot': return isSnapshot(value.board)
      case 'changes': return Array.isArray(value.changes) && value.changes.every(isSequenced)
      case 'ready': return isSeq(value.seq) && Array.isArray(value.peers) && value.peers.every(isPeer)
      case 'change': return isSequenced(value)
      case 'ack': return isText(value.id) && isSeq(value.seq)
      case 'reject': return isText(value.id) && typeof value.reason === 'string'
      case 'signal': return isPeer(value) && isObject(value.data)
      case 'join': case 'leave': return isPeer(value)
      case 'pong': return true
      default: return false
    }
  })()
  return valid ? value as unknown as ServerMessage : null
}
