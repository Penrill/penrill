import type { Point } from './types'

export interface Circle {
  x: number
  y: number
  radius: number
}

/** Exact circle geometry; a collapsed or nearly collinear triangle has no circles. */
export function triangleCircles(a: Point, b: Point, c: Point): { incircle: Circle; circumcircle: Circle } | null {
  // Work relative to a, at unit scale, to avoid cancellation far from the board origin.
  const scale = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]))
  if (!Number.isFinite(scale) || scale === 0) return null
  const bx = (b[0] - a[0]) / scale, by = (b[1] - a[1]) / scale
  const cx = (c[0] - a[0]) / scale, cy = (c[1] - a[1]) / scale
  const cross = bx * cy - by * cx
  if (!Number.isFinite(cross) || Math.abs(cross) < 1e-12) return null
  const ab = Math.hypot(bx, by), ac = Math.hypot(cx, cy), bc = Math.hypot(cx - bx, cy - by)
  const perimeter = ab + ac + bc
  const ux = ((bx * bx + by * by) * cy - (cx * cx + cy * cy) * by) / (2 * cross)
  const uy = ((cx * cx + cy * cy) * bx - (bx * bx + by * by) * cx) / (2 * cross)
  return {
    incircle: {
      x: a[0] + scale * (ac * bx + ab * cx) / perimeter,
      y: a[1] + scale * (ac * by + ab * cy) / perimeter,
      radius: scale * Math.abs(cross) / perimeter
    },
    circumcircle: { x: a[0] + scale * ux, y: a[1] + scale * uy, radius: scale * Math.hypot(ux, uy) }
  }
}
