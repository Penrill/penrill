import type { Circle } from './triangleCircles'
import type { Vec2 } from './types'

/** Share of the perimeter a hand-drawn trapezoid may miss the exact condition by. */
const TOLERANCE = 0.005

const len = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1])

/**
 * Circles of a trapezoid given as [top-left, top-right, bottom-right, bottom-left].
 * The circumcircle exists only for an isosceles trapezoid (all four vertices on one circle), the
 * incircle only when the bases add up to the legs. Either is null when its condition fails.
 */
export function trapezoidCircles(verts: readonly Vec2[]): { incircle: Circle | null; circumcircle: Circle | null } {
  if (verts.length !== 4) return { incircle: null, circumcircle: null }
  const [v0, v1, v2, v3] = verts
  const top = len(v0, v1), right = len(v1, v2), bottom = len(v2, v3), left = len(v3, v0)
  const perimeter = top + right + bottom + left
  if (!Number.isFinite(perimeter) || perimeter < 1e-6) return { incircle: null, circumcircle: null }
  const tol = perimeter * TOLERANCE
  return { incircle: incircleOf(v0, v1, v2, v3, top + bottom - right - left, tol), circumcircle: circumcircleOf(v0, v1, v2, v3, tol) }
}

function circumcircleOf(v0: Vec2, v1: Vec2, v2: Vec2, v3: Vec2, tol: number): Circle | null {
  // Circle through v0, v1, v2, relative to v0 to keep precision far from the origin.
  const bx = v1[0] - v0[0], by = v1[1] - v0[1]
  const cx = v2[0] - v0[0], cy = v2[1] - v0[1]
  const cross = bx * cy - by * cx
  if (Math.abs(cross) < 1e-9) return null
  const ux = ((bx * bx + by * by) * cy - (cx * cx + cy * cy) * by) / (2 * cross)
  const uy = ((cx * cx + cy * cy) * bx - (bx * bx + by * by) * cx) / (2 * cross)
  const circle: Circle = { x: v0[0] + ux, y: v0[1] + uy, radius: Math.hypot(ux, uy) }
  return Math.abs(len([circle.x, circle.y], v3) - circle.radius) <= tol ? circle : null
}

function incircleOf(v0: Vec2, v1: Vec2, v2: Vec2, v3: Vec2, mismatch: number, tol: number): Circle | null {
  if (Math.abs(mismatch) > tol) return null
  const unit = (from: Vec2, to: Vec2): Vec2 => {
    const l = len(from, to) || 1
    return [(to[0] - from[0]) / l, (to[1] - from[1]) / l]
  }
  // The center lies on the bisectors of both bottom corners.
  const a = unit(v3, v0), b = unit(v3, v2)
  const c = unit(v2, v1), d = unit(v2, v3)
  const d3: Vec2 = [a[0] + b[0], a[1] + b[1]]
  const d2: Vec2 = [c[0] + d[0], c[1] + d[1]]
  const denom = d3[0] * d2[1] - d3[1] * d2[0]
  if (Math.abs(denom) < 1e-12) return null
  const qx = v2[0] - v3[0], qy = v2[1] - v3[1]
  const s = (qx * d2[1] - qy * d2[0]) / denom
  const x = v3[0] + s * d3[0], y = v3[1] + s * d3[1]
  // Radius: distance from the center to the bottom base.
  const radius = Math.abs((x - v3[0]) * b[1] - (y - v3[1]) * b[0])
  return radius > 1e-6 ? { x, y, radius } : null
}
