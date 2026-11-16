import { Triggers } from './core/triggers'
import { Stage } from './core/stage'
import { useAchievements } from './core/store'
import { UnlockToast } from './medals/UnlockToast'

/**
 * Easter eggs and achievements, all in this folder:
 *
 * - core/    the medal store, the stage that plays a show, what sets the eggs off
 * - medals/  the shelf on the home screen, the "unlocked" toast, the switch in the settings
 * - eggs/    one folder per egg (its medal, its show, its styles), listed in eggs/index.ts
 *
 * Adding an egg: a folder under eggs/ exporting an `Egg` (core/types.ts), plus a line in eggs/index.ts.
 *
 * To throw it all away: delete src/board/easter/ and the lines marked "easter egg" (BoardWorkspace.tsx,
 * FormulaEditor.tsx, BackgroundPicker.tsx, HomeScreen.tsx). Typecheck points at any line left behind.
 */

export { onAnswer, onNoAnswer } from './core/triggers'
export { Medals } from './medals/Medals'
export { AchievementsSettings } from './medals/AchievementsSettings'

/** Mounted once over the board: the stage, the triggers (while collecting is on) and the toast. */
export function Easter() {
  const { on } = useAchievements()
  return (
    <>
      {on && <Triggers />}
      <Stage />
      <UnlockToast />
    </>
  )
}
