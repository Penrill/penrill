import type { Row } from '@penrill/math/formula'
import { Armed } from './core/armed'
import { emit } from './core/bus'
import { Stage } from './core/stage'
import { useAchievements } from './core/store'
import { UnlockToast } from './medals/UnlockToast'

/**
 * Easter eggs and achievements, all in this folder:
 *
 * - core/      the egg contract (egg.ts), the medal store, the stage that plays shows, the event bus
 * - triggers/  strategies that set eggs off: formula answers, typed words, drawing, zoom, the clock
 * - gfx/       the toolkit shows paint with: easing, seeded randomness, particles, light, sky
 * - eggs/      one folder per egg: index.ts (medal + triggers) and show.ts (the canvas show)
 * - medals/    the shelf on the home screen, the "unlocked" toast, the switch in the settings
 *
 * Adding an egg: a folder under eggs/ and a line in eggs/index.ts. Nothing else changes.
 *
 * To throw it all away: delete src/board/easter/ and the lines marked "easter egg" (BoardWorkspace.tsx,
 * FormulaEditor.tsx, BackgroundPicker.tsx, HomeScreen.tsx). Typecheck points at any line left behind.
 */

export { Medals } from './medals/Medals'
export { AchievementsSettings } from './medals/AchievementsSettings'

/** The formula editor shows an answer. */
export const onAnswer = (value: number): void => emit('answer', value)

/** The formula being edited has no numeric answer (null when it closes or is cleared). */
export const onNoAnswer = (rows: Row | null): void => emit('formula', rows)

/** Mounted once over the board: the triggers (while collecting is on), the stage and the toast. */
export function Easter() {
  const { on } = useAchievements()
  return (
    <>
      {on && <Armed />}
      <Stage />
      <UnlockToast />
    </>
  )
}
