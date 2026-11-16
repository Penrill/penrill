import type { CSSProperties, FC } from 'react'
import type { Row } from '@inkboard/math/formula'

/** A line of UI text in both languages. */
export interface Text {
  en: string
  uk: string
}

/** Inline style that may also set CSS custom properties (`--d`, `--size`, ...). */
export type Vars = CSSProperties & Record<`--${string}`, string | number>

export interface ShowProps {
  uk: boolean
}

/**
 * One easter egg: its medal, its show and what sets it off. Each egg lives in its own folder under
 * eggs/ and is listed in eggs/index.ts; the stage (core/stage.tsx) plays it and the medal shelf
 * (medals/) shows it once earned.
 */
export interface Egg {
  id: string
  icon: string
  name: Text
  /** How it was earned; shown once unlocked (before that the medal is a secret). */
  how: Text
  /** How long the show runs, ms. */
  life: number
  /** When the "achievement unlocked" toast shows up, ms after the start (default: just before the end). */
  toastAt?: number
  /** A class put on <html> while the show runs, for effects on the whole app. */
  appClass?: string
  /** The show lets the pointer through (the board stays usable underneath). */
  passThrough?: boolean
  /** Secret medal: not counted in the total on the home screen until found (bonus above the total). */
  secret?: boolean
  /** Can be switched to play every time in the secret repeat settings (default: true). */
  repeatable?: boolean
  /** What is drawn; mounted fresh for every play, inside a full-screen layer. */
  Show: FC<ShowProps>

  // What sets it off (any of these):
  /** A formula's answer was shown with this value. */
  answer?: (value: number) => boolean
  /** A formula is being edited and has no numeric answer (matrices, division by zero, ...). */
  noAnswer?: (rows: Row) => boolean
  /** Words typed on a board, outside any text field (Latin letters, any keyboard layout). */
  words?: string[]
  /** Anything else: a hook mounted while collecting is on; call `play` when it's time. */
  useWatch?: (play: () => void) => void
}

/** Whether `value` is `target` give or take `eps` (answers are floating point). */
export const near = (value: number, target: number, eps = 1e-9): boolean => Math.abs(value - target) < eps
