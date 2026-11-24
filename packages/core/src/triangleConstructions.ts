import type { Point, Vec2 } from './types'
import type { ShapePart } from './shapes'

type Pt = readonly [number, number, ...number[]]

const P = (x: number, y: number): Point => [x, y, 0.5]

/** Non-degenerate check matching triangleCircles: returns scale or null. */
function triangleScale(a: Pt, b: Pt, c: Pt): number | null {
  const scale = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]))
  if (!Number.isFinite(scale) || scale === 0) return null
  const bx = (b[0] - a[0]) / scale
  const by = (b[1] - a[1]) / scale
  const cx = (c[0] - a[0]) / scale
  const cy = (c[1] - a[1]) / scale
  const cross = bx * cy - by * cx
  if (!Number.isFinite(cross) || Math.abs(cross) < 1e-12) return null
  return scale
}

/** Interior angle in degrees at vertex `v` between rays `v -> p` and `v -> q`. */
export function cornerAngleDeg(v: Pt, p: Pt, q: Pt): number {
  const ux = p[0] - v[0], uy = p[1] - v[1]
  const vx = q[0] - v[0], vy = q[1] - v[1]
  const lu = Math.hypot(ux, uy)
  const lv = Math.hypot(vx, vy)
  if (lu === 0 || lv === 0) return 0
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Interior angles in degrees at vertices (a, b, c), or null for a collapsed triangle. */
export function triangleAngles(a: Pt, b: Pt, c: Pt): [number, number, number] | null {
  if (!triangleScale(a, b, c)) return null
  return [cornerAngleDeg(a, b, c), cornerAngleDeg(b, a, c), cornerAngleDeg(c, a, b)]
}

function uniqueTriangleIndices(indices: readonly number[]): number[] {
  const out: number[] = []
  for (const i of indices) {
    if ((i === 0 || i === 1 || i === 2) && !out.includes(i)) out.push(i)
  }
  return out
}

/**
 * Altitudes from selected triangle vertices (`indices` in 0..2) to their opposite sides,
 * with a dotted side extension when obtuse and a crisp 90 deg foot square at the perpendicular foot.
 */
export function triangleAltitudes(
  a: Pt,
  b: Pt,
  c: Pt,
  indices: readonly number[] = [0, 1, 2],
  strokeSize = 2
): ShapePart[] {
  if (!triangleScale(a, b, c)) return []
  const verts: [Pt, Pt, Pt] = [a, b, c]
  const parts: ShapePart[] = []
  for (const i of uniqueTriangleIndices(indices)) {
    const v = verts[i]
    const p = verts[(i + 1) % 3]
    const q = verts[(i + 2) % 3]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len2 = dx * dx + dy * dy
    if (len2 === 0) continue
    const baseLen = Math.sqrt(len2)
    const t = ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / len2
    const hx = p[0] + t * dx
    const hy = p[1] + t * dy
    parts.push({ points: [P(v[0], v[1]), P(hx, hy)], dash: 'dashed' })
    if (t < -1e-4) parts.push({ points: [P(p[0], p[1]), P(hx, hy)], dash: 'dotted' })
    else if (t > 1 + 1e-4) parts.push({ points: [P(q[0], q[1]), P(hx, hy)], dash: 'dotted' })

    // Small perpendicular L-mark at foot H.
    const hLen = Math.hypot(v[0] - hx, v[1] - hy)
    if (hLen > 6) {
      const avx = (v[0] - hx) / hLen
      const avy = (v[1] - hy) / hLen
      // Point along base toward the interior side of the segment.
      const dirSign = t > 0.5 ? -1 : 1
      const bvx = (dx / baseLen) * dirSign
      const bvy = (dy / baseLen) * dirSign
      const m = Math.min(12, Math.max(Math.min(hLen * 0.25, strokeSize * 2.8), Math.min(hLen, baseLen) * 0.12))
      if (m >= 2.5) {
        const f1: Vec2 = [hx + avx * m, hy + avy * m]
        const fc: Vec2 = [hx + (avx + bvx) * m, hy + (avy + bvy) * m]
        const f2: Vec2 = [hx + bvx * m, hy + bvy * m]
        parts.push({ points: [P(f1[0], f1[1]), P(fc[0], fc[1]), P(f2[0], f2[1])] })
      }
    }
  }
  return parts
}

/** Medians from selected triangle vertices (`indices` in 0..2) to the midpoints of opposite sides. */
export function triangleMedians(a: Pt, b: Pt, c: Pt, indices: readonly number[] = [0, 1, 2]): ShapePart[] {
  if (!triangleScale(a, b, c)) return []
  const verts: [Pt, Pt, Pt] = [a, b, c]
  const parts: ShapePart[] = []
  for (const i of uniqueTriangleIndices(indices)) {
    const v = verts[i]
    const p = verts[(i + 1) % 3]
    const q = verts[(i + 2) % 3]
    parts.push({ points: [P(v[0], v[1]), P((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)], dash: 'dashed' })
  }
  return parts
}

/** Internal angle bisectors from selected triangle vertices (`indices` in 0..2) to opposite sides. */
export function triangleBisectors(a: Pt, b: Pt, c: Pt, indices: readonly number[] = [0, 1, 2]): ShapePart[] {
  if (!triangleScale(a, b, c)) return []
  const verts: [Pt, Pt, Pt] = [a, b, c]
  const parts: ShapePart[] = []
  for (const i of uniqueTriangleIndices(indices)) {
    const v = verts[i]
    const p = verts[(i + 1) % 3]
    const q = verts[(i + 2) % 3]
    const vp = Math.hypot(p[0] - v[0], p[1] - v[1])
    const vq = Math.hypot(q[0] - v[0], q[1] - v[1])
    const sum = vp + vq
    if (sum === 0) continue
    // Angle bisector theorem: D divides PQ in ratio VP : VQ.
    const dx = (vq * p[0] + vp * q[0]) / sum
    const dy = (vq * p[1] + vp * q[1]) / sum
    parts.push({ points: [P(v[0], v[1]), P(dx, dy)], dash: 'dashed' })
  }
  return parts
}
