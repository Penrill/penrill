import type { Row } from '@penrill/math/formula'

/**
 * What the app tells the eggs. The app calls the few functions exported from easter/index.tsx
 * (marked "easter egg" where they are called); triggers listen here.
 */
interface Events {
  /** A formula's answer was shown. */
  answer: number
  /** The formula being edited has no numeric answer (null when the editor closes or is empty). */
  formula: Row | null
}

type Listener<K extends keyof Events> = (value: Events[K]) => void

const listeners: { [K in keyof Events]: Set<Listener<K>> } = { answer: new Set(), formula: new Set() }

export function emit<K extends keyof Events>(event: K, value: Events[K]): void {
  listeners[event].forEach((f) => f(value))
}

export function listen<K extends keyof Events>(event: K, f: Listener<K>): () => void {
  listeners[event].add(f)
  return () => void listeners[event].delete(f)
}
