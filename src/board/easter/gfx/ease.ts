/** Timing helpers for the shows: every show is a function of the time `t` in seconds. */

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** How far `t` is through the window [a, b], 0..1. */
export const span = (t: number, a: number, b: number): number => clamp((t - a) / (b - a))

export const inCubic = (t: number): number => t * t * t
export const outCubic = (t: number): number => 1 - (1 - t) ** 3
export const outQuint = (t: number): number => 1 - (1 - t) ** 5
export const inOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const inOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2

/** Overshoots a little, then settles. */
export const outBack = (t: number, s = 1.70158): number => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2

/** A springy settle. */
export const outElastic = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1

/** Bounces like a dropped ball. */
export function outBounce(t: number): number {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

/** 0 → 1 → 0 over [0, 1]. */
export const hump = (t: number): number => Math.sin(Math.PI * clamp(t))

/** Fades in over [a, a + fade] and out over [b - fade, b]. */
export const shown = (t: number, a: number, b: number, fade = 0.3): number => Math.min(span(t, a, a + fade), 1 - span(t, b - fade, b))
