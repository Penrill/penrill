/** How round a freehand line is: the test behind the "perfect circle" egg. */

export interface RoundFit {
  cx: number
  cy: number
  r: number
  /** Spread of the distances from the centre, as a share of the radius (0 = a perfect circle). */
  error: number
  /** How far round the centre the line goes, in turns. */
  turns: number
  /** Gap between the ends, as a share of the radius. */
  gap: number
}

export function fitRound(points: ReadonlyArray<readonly [number, number, ...number[]]>): RoundFit | null {
  if (points.length < 16) return null
  let cx = 0
  let cy = 0
  for (const [x, y] of points) {
    cx += x
    cy += y
  }
  cx /= points.length
  cy /= points.length
  const ds = points.map(([x, y]) => Math.hypot(x - cx, y - cy))
  const r = ds.reduce((a, d) => a + d, 0) / ds.length
  if (r <= 0) return null
  const spread = Math.sqrt(ds.reduce((a, d) => a + (d - r) ** 2, 0) / ds.length)
  let turned = 0
  let prev = Math.atan2(points[0][1] - cy, points[0][0] - cx)
  for (const [x, y] of points.slice(1)) {
    const a = Math.atan2(y - cy, x - cx)
    let d = a - prev
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    turned += d
    prev = a
  }
  const [x0, y0] = points[0]
  const [x1, y1] = points[points.length - 1]
  return { cx, cy, r, error: spread / r, turns: Math.abs(turned) / (Math.PI * 2), gap: Math.hypot(x1 - x0, y1 - y0) / r }
}

/** A circle drawn by hand that is round to within `tolerance` of its radius and closes on itself. */
export function isRound(fit: RoundFit | null, tolerance = 0.03): fit is RoundFit {
  return !!fit && fit.error <= tolerance && fit.turns >= 0.92 && fit.turns <= 1.3 && fit.gap <= 0.3
}
