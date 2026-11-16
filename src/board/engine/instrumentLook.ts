import { ACCENT, ACCENT_TINT } from './accent'
import { CHALK_WHITE } from './surface'

/** `#rrggbb` with an alpha, as rgba(). */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * One look for all drawing instruments (ruler, set squares, protractor, compass), on paper and on
 * the chalkboard. Bodies are mostly see-through, so the lines under them stay visible (that is what
 * gets measured); the scales carry the contrast, and the single units are faint next to the round ones.
 */
export interface InstrumentLook {
  /** Fill of a see-through body; `lit` while the pointer is on it. */
  body: (lit: boolean) => string
  /** Outline and edges. */
  edge: string
  /** Round scale marks (10°, 5°, cm, half cm). */
  tick: string
  /** Single units (1°, mm). */
  minorTick: string
  /** Scale numbers. */
  number: string
  /** Secondary text: the protractor's inner scale, a set square's angles. */
  inner: string
  /** Compass legs and hinge. */
  metal: string
  /** Light glow behind a lit part. */
  glow: string
}

const PAPER: InstrumentLook = {
  body: (lit) => rgba(ACCENT_TINT, lit ? 0.6 : 0.35),
  edge: ACCENT,
  tick: 'rgba(40, 46, 70, 0.85)',
  minorTick: 'rgba(40, 46, 70, 0.4)',
  number: '#23283c',
  inner: rgba(ACCENT, 0.6),
  metal: '#5c6270',
  glow: rgba(ACCENT, 0.22)
}

const CHALK: InstrumentLook = {
  body: (lit) => rgba('#ffffff', lit ? 0.14 : 0.07),
  edge: '#8ec5ff',
  tick: rgba(CHALK_WHITE, 0.85),
  minorTick: rgba(CHALK_WHITE, 0.4),
  number: CHALK_WHITE,
  inner: 'rgba(142, 197, 255, 0.75)',
  metal: '#b8bec9',
  glow: rgba(ACCENT, 0.35)
}

export function instrumentLook(chalk: boolean): InstrumentLook {
  return chalk ? CHALK : PAPER
}

/**
 * Opacity of an instrument's buttons (close, settings, turn, radius) while the pointer is elsewhere:
 * present but quiet. They are drawn in full as soon as the pointer is on the instrument.
 */
export const IDLE_HANDLES = 0.4
