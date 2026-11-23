import type { Change } from '@penrill/sync/protocol'
import type { Outbox, OutboxEntry } from '@penrill/sync/session'
import { bgPattern, isBackgroundKind } from '../../../board/engine/surface'

interface Row {
  scope: string
  id: string
  change: Change
  confirmedAt?: number
}

export interface BoardOutbox extends Outbox {
  prune(confirmedBefore?: number): Promise<void>
}

let database: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('penrill-outbox', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('changes', { autoIncrement: true }).createIndex('scope', 'scope')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      database = undefined
      reject(request.error)
    }
  })
}

async function write(work: (store: IDBObjectStore) => void): Promise<void> {
  const transaction = (await open()).transaction('changes', 'readwrite', { durability: 'strict' })
  work(transaction.objectStore('changes'))
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error)
  })
}

function eachRow(store: IDBObjectStore, scope: string, visit: (row: Row, cursor: IDBCursorWithValue) => void): void {
  const request = store.index('scope').openCursor(IDBKeyRange.only(scope))
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    visit(cursor.value as Row, cursor)
    cursor.continue()
  }
}

/** Drops every change kept for a board whose server copy is gone. */
export function clearOutbox(scope: string): Promise<void> {
  return write(store => eachRow(store, scope, (_row, cursor) => {
    cursor.delete()
  }))
}

export function outboxFor(scope: string): BoardOutbox {
  return {
    async list(): Promise<OutboxEntry[]> {
      const request = (await open()).transaction('changes').objectStore('changes').index('scope').getAll(scope)
      const rows = await new Promise<Row[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return rows.map(({ change, confirmedAt }) => ({
        // Pending edits from earlier versions may include the device's chalk surface.
        change: {
          ...change,
          ops: change.ops.map(op => op.op === 'meta' && isBackgroundKind(op.background)
            ? { ...op, background: bgPattern(op.background) } : op)
        },
        confirmed: confirmedAt !== undefined
      }))
    },
    add: change => write(store => store.add({ scope, id: change.id, change } satisfies Row)),
    confirm: id => write(store => eachRow(store, scope, (row, cursor) => {
      if (row.id === id && row.confirmedAt === undefined) cursor.update({ ...row, confirmedAt: Date.now() })
    })),
    remove: id => write(store => eachRow(store, scope, (row, cursor) => {
      if (row.id === id) cursor.delete()
    })),
    prune: (confirmedBefore = Infinity) => write(store => eachRow(store, scope, (row, cursor) => {
      if (row.confirmedAt !== undefined && row.confirmedAt <= confirmedBefore) cursor.delete()
    }))
  }
}
