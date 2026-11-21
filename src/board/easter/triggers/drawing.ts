import type { Item, StrokeItem } from '@penrill/core/types'
import type { Editor } from '../../editor'
import type { Trigger } from '../core/egg'

/**
 * Triggers from what is drawn on the board. One watcher per editor compares the items before and
 * after every change (by id) and tells the triggers what was added and how much went away. Opening a
 * board (the history starts empty) is not a change anyone made: triggers only take it as a new
 * starting point.
 */

interface Change {
  added: Item[]
  removed: number
  items: readonly Item[]
  /** A board was opened (or a new one started): the items changed, but nobody drew anything. */
  opened: boolean
}

interface Watch {
  fns: Set<(c: Change) => void>
  stop: () => void
}

const watchers = new WeakMap<Editor, Watch>()

function watchScene(editor: Editor, f: (c: Change) => void): () => void {
  let w = watchers.get(editor)
  if (!w) {
    const fns = new Set<(c: Change) => void>()
    let ids = new Set(editor.scene.getItems().map((i) => i.id))
    const stop = editor.scene.subscribe(() => {
      const items = editor.scene.getItems()
      const next = new Set<string>()
      const added: Item[] = []
      for (const it of items) {
        next.add(it.id)
        if (!ids.has(it.id)) added.push(it)
      }
      const removed = ids.size - (next.size - added.length)
      ids = next
      const opened = !editor.scene.canUndo && !editor.scene.canRedo
      if (added.length || removed) fns.forEach((fn) => fn({ added, removed, items, opened }))
    })
    w = { fns, stop }
    watchers.set(editor, w)
  }
  const watch = w
  watch.fns.add(f)
  return () => {
    watch.fns.delete(f)
    if (watch.fns.size) return
    watch.stop()
    watchers.delete(editor)
  }
}

const strokes = (items: readonly Item[]): StrokeItem[] => items.filter((i): i is StrokeItem => i.type === 'stroke')

/** A stroke was just drawn and `test` finds something in it (what it returns goes to the show). */
export const drew = <T>(test: (s: StrokeItem) => T | null): Trigger => ({
  arm: ({ editor }, fire) =>
    watchScene(editor, ({ added, opened }) => {
      if (opened || added.length !== 1) return
      const [s] = strokes(added)
      const found = s ? test(s) : null
      if (found) fire(found)
    })
})

/** Something counted over the whole board (`measure`) has just reached `threshold`. */
export const boardReaches = (measure: (items: readonly Item[]) => number, threshold: number): Trigger => ({
  arm: ({ editor }, fire) => {
    let before = measure(editor.scene.getItems())
    return watchScene(editor, ({ items, opened }) => {
      const now = measure(items)
      if (!opened && before < threshold && now >= threshold) fire(now)
      before = now
    })
  }
})

/** At least `n` things were removed in one go (select all and delete, a clear). */
export const wiped = (n: number): Trigger => ({
  arm: ({ editor }, fire) => watchScene(editor, ({ added, removed, opened }) => void (!opened && removed >= n && !added.length && fire(removed)))
})

/** Number of strokes on the board. */
export const strokeCount = (items: readonly Item[]): number => strokes(items).length

/** Number of different ink colours on the board. */
export const inkColours = (items: readonly Item[]): number => new Set(strokes(items).map((s) => s.color.toLowerCase())).size
