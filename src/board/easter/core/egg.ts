import type { Editor } from '../../editor'

/**
 * The shape of an easter egg. Every egg is the same three things, so adding one never touches the
 * core:
 *
 * - a medal (id, icon, name, how it is earned),
 * - triggers: strategies that watch the app and fire (triggers/: an answer, a typed word, a drawn
 *   circle, the zoom limit, the clock...), any number of them,
 * - a show: a function of time painted on a full-screen canvas (gfx/ has the toolkit).
 */

/** A line of UI text in both languages. */
export interface Text {
  en: string
  uk: string
}

/** What a show paints with. Sizes are CSS pixels; the canvas is already scaled for the screen. */
export interface Gfx {
  ctx: CanvasRenderingContext2D
  readonly w: number
  readonly h: number
  uk: boolean
  say(text: Text): string
  /** Whatever the trigger passed along (a drawn circle, ...). */
  data: unknown
  /** A point on the board in screen pixels, and the board's zoom. */
  toScreen(x: number, y: number): [number, number]
  zoom: number
}

/** Paints one frame: `t` seconds since the show started, `dt` since the last frame. */
export type Frame = (t: number, dt: number) => void

/** How the whole app looks at a moment of the show (shaken, floating, swallowed...). */
export interface AppLook {
  transform?: string
  filter?: string
  origin?: string
}

export interface Show {
  /** Seconds. */
  duration: number
  /** The pointer goes through to the board (the show plays on top of normal work). */
  passThrough?: boolean
  /** When "achievement unlocked" pops up, seconds (default: just before the end). */
  toastAt?: number
  /** Moves the app itself while the show plays. */
  app?: (t: number) => AppLook | null
  /** Sets the show up and returns its frame painter. */
  start(g: Gfx): Frame
}

export interface Env {
  editor: Editor
}

/** Fires the egg; returns whether the show actually played (it plays once unless set to repeat). */
export type Fire = (data?: unknown) => boolean

/** A strategy that watches something and fires. Returns its own clean-up. */
export interface Trigger {
  arm(env: Env, fire: Fire): () => void
}

export interface Egg {
  id: string
  icon: string
  name: Text
  /** How it is earned; shown once unlocked (before that the medal is a secret). */
  how: Text
  /** Off the record: not counted in the total on the home screen. */
  secret?: boolean
  /** Can be set to play every time in the hidden replay list (default: true). */
  repeatable?: boolean
  triggers: Trigger[]
  show: Show
}

export const near = (value: number, target: number, eps = 1e-9): boolean => Math.abs(value - target) < eps
