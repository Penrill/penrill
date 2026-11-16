import type { Row } from '@inkboard/math/formula'
import { useEditor } from '../../editorContext'
import { EGGS } from '../eggs'
import { play } from './stage'
import { canPlay } from './store'
import type { Egg } from './types'
import { useTypedWords } from './words'

/** What sets the eggs off: formula answers, typed words and each egg's own watcher. */

/** A formula's answer was shown. */
export function onAnswer(value: number): void {
  const egg = EGGS.find((e) => e.answer?.(value))
  if (egg) play(egg)
}

/** Remember which noAnswer egg already fired for the formula currently open, so typing more keys doesn't re-fire it. */
let lastNoAnswerId = ''

/** A formula has no numeric answer (or is empty / cleared). */
export function onNoAnswer(rows: Row | null): void {
  if (!rows || rows.length === 0) {
    lastNoAnswerId = ''
    return
  }
  const egg = EGGS.find((e) => e.noAnswer?.(rows))
  if (!egg) {
    lastNoAnswerId = ''
    return
  }
  if (lastNoAnswerId === egg.id) return
  lastNoAnswerId = egg.id
  play(egg)
}

const BY_WORD = new Map(EGGS.flatMap((e) => (e.words ?? []).map((w) => [w, e] as const)))
const WORDS = [...BY_WORD.keys()]

function onWord(word: string): boolean {
  const egg = BY_WORD.get(word)
  if (!egg || !canPlay(egg.id)) return false
  play(egg)
  return true
}

function Watch({ egg, watch }: { egg: Egg; watch: (play: () => void) => void }) {
  watch(() => play(egg))
  return null
}

/** Mounted while collecting is on. */
export function Triggers() {
  useTypedWords(useEditor(), WORDS, onWord)
  return (
    <>
      {EGGS.map((egg) => (egg.useWatch ? <Watch key={egg.id} egg={egg} watch={egg.useWatch} /> : null))}
    </>
  )
}
