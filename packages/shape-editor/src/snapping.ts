import { triangleAngles } from '@penrill/core/triangleConstructions'
import type { Vec2 } from '@penrill/core/types'

/** Subtle geometric guide shown on the overlay while a handle snaps magnetically. */
export interface SnapGuide {
  kind: 'line' | 'rightAngle'
  points: Vec2[]
}

export interface HandleDragOptions {
  shift: boolean
  ctrl: boolean
  alt: boolean
  /** Magnetic snap tolerance in world units (typically ~10 / zoom). */
  snapTol: number
  /** Paper grid cell size in world units for Ctrl snapping. */
  gridStep: readonly [number, number]
}

export interface SnapPointResult {
  point: Vec2
  guides: SnapGuide[]
  label: string | null
  snapped: boolean
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1])

function rightAngleGuide(v: Vec2, p: Vec2, q: Vec2, size: number): SnapGuide | null {
  const lp = dist(v, p)
  const lq = dist(v, q)
  if (lp < 1e-6 || lq < 1e-6) return null
  const ux = (p[0] - v[0]) / lp, uy = (p[1] - v[1]) / lp
  const vx = (q[0] - v[0]) / lq, vy = (q[1] - v[1]) / lq
  const m = Math.min(size, Math.min(lp, lq) * 0.35)
  if (m < 2) return null
  return {
    kind: 'rightAngle',
    points: [
      [v[0] + ux * m, v[1] + uy * m],
      [v[0] + (ux + vx) * m, v[1] + (uy + vy) * m],
      [v[0] + vx * m, v[1] + vy * m]
    ]
  }
}

function guardMinDistance(pt: Vec2, anchors: readonly Vec2[], minDist: number): Vec2 {
  let x = pt[0], y = pt[1]
  for (const a of anchors) {
    const dx = x - a[0], dy = y - a[1]
    const d = Math.hypot(dx, dy)
    if (d < minDist) {
      if (d < 1e-6) {
        x = a[0] + minDist
        y = a[1]
      } else {
        x = a[0] + (dx / d) * minDist
        y = a[1] + (dy / d) * minDist
      }
    }
  }
  return [x, y]
}

function snapToGrid(pt: Vec2, step: readonly [number, number]): Vec2 {
  const [gx, gy] = step
  return [Math.round(pt[0] / gx) * gx, Math.round(pt[1] / gy) * gy]
}

function snapRay15(origin: Vec2, pt: Vec2): Vec2 {
  const dx = pt[0] - origin[0], dy = pt[1] - origin[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return pt
  const step = Math.PI / 12
  const a = Math.round(Math.atan2(dy, dx) / step) * step
  return [origin[0] + Math.cos(a) * len, origin[1] + Math.sin(a) * len]
}

function cornerAngleDeg(v: Vec2, p: Vec2, q: Vec2): number | null {
  const ux = p[0] - v[0], uy = p[1] - v[1]
  const vx = q[0] - v[0], vy = q[1] - v[1]
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
  if (lu < 1e-6 || lv < 1e-6) return null
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}

interface Candidate {
  point: Vec2
  /** Lower tier wins unconditionally when within snapTol (0D special points > 90 deg loci > isosceles > axis). */
  tier: number
  dist: number
  guides: SnapGuide[]
  label?: string
}

/**
 * Magnetic snapping for dragging one vertex of a triangle:
 * - Ctrl: paper grid
 * - Alt: completely free
 * - Shift: 15 deg ray from the nearer fixed vertex
 * - Default: gentle magnet to equilateral (60 deg), 90 deg right angles (Thales circle and perpendiculars),
 *   isosceles symmetry and horizontal/vertical alignment.
 */
export function snapTriangleVertex(
  dragIndex: number,
  verts: readonly Vec2[],
  rawPt: Vec2,
  opts: HandleDragOptions
): SnapPointResult {
  const p = verts[(dragIndex + 1) % 3]
  const q = verts[(dragIndex + 2) % 3]
  const tol = Math.max(1e-3, opts.snapTol)
  const minDist = tol * 0.8

  if (opts.ctrl) {
    const pt = guardMinDistance(snapToGrid(rawPt, opts.gridStep), [p, q], minDist)
    return withTriangleLabel(dragIndex, verts, pt, [], true)
  }
  if (opts.alt) {
    const pt = guardMinDistance(rawPt, [p, q], minDist)
    return withTriangleLabel(dragIndex, verts, pt, [], false)
  }
  if (opts.shift) {
    const anchor = dist(rawPt, p) <= dist(rawPt, q) ? p : q
    const pt = guardMinDistance(snapRay15(anchor, rawPt), [p, q], minDist)
    return withTriangleLabel(dragIndex, verts, pt, [{ kind: 'line', points: [anchor, pt] }], true)
  }

  const baseLen = dist(p, q)
  if (baseLen < 1e-6) {
    const pt = guardMinDistance(rawPt, [p, q], minDist)
    return { point: pt, guides: [], label: null, snapped: false }
  }

  const ux = (q[0] - p[0]) / baseLen, uy = (q[1] - p[1]) / baseLen
  const nx = -uy, ny = ux
  const mid: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const markSize = tol * 1.25
  const candidates: Candidate[] = []

  // Tier 0: Exact special points: equilateral (60-60-60) and isosceles right (90-45-45).
  const eqH = (baseLen * Math.sqrt(3)) / 2
  const radius = baseLen / 2
  for (const sign of [1, -1]) {
    const eq: Vec2 = [mid[0] + nx * eqH * sign, mid[1] + ny * eqH * sign]
    const d = dist(rawPt, eq)
    if (d <= tol * 1.15) {
      candidates.push({
        point: eq,
        tier: 0,
        dist: d,
        guides: [{ kind: 'line', points: [mid, eq] }],
        label: '60°'
      })
    }
    const isoRight: Vec2 = [mid[0] + nx * radius * sign, mid[1] + ny * radius * sign]
    const dr = dist(rawPt, isoRight)
    if (dr <= tol && dist(isoRight, p) >= minDist && dist(isoRight, q) >= minDist) {
      const g = rightAngleGuide(isoRight, p, q, markSize)
      candidates.push({
        point: isoRight,
        tier: 0,
        dist: dr,
        guides: g ? [{ kind: 'line', points: [mid, isoRight] }, g] : [{ kind: 'line', points: [mid, isoRight] }],
        label: '90°'
      })
    }
  }

  // Tier 1: 90 deg at dragged vertex V (Thales circle with diameter PQ).
  const dMid = dist(rawPt, mid)
  if (dMid > 1e-6) {
    const err = Math.abs(dMid - radius)
    if (err <= tol) {
      const proj: Vec2 = [mid[0] + ((rawPt[0] - mid[0]) * radius) / dMid, mid[1] + ((rawPt[1] - mid[1]) * radius) / dMid]
      if (dist(proj, p) >= minDist && dist(proj, q) >= minDist) {
        const g = rightAngleGuide(proj, p, q, markSize)
        candidates.push({
          point: proj,
          tier: 1,
          dist: err,
          guides: g ? [g] : [],
          label: '90°'
        })
      }
    }
  }

  // Tier 1: 90 deg at P or Q (perpendicular line to PQ).
  for (const [corner, other] of [[p, q], [q, p]] as const) {
    const dx = rawPt[0] - corner[0], dy = rawPt[1] - corner[1]
    const perpErr = Math.abs(dx * ux + dy * uy)
    const along = dx * nx + dy * ny
    if (perpErr <= tol && Math.abs(along) >= minDist) {
      const proj: Vec2 = [corner[0] + nx * along, corner[1] + ny * along]
      const g = rightAngleGuide(corner, proj, other, markSize)
      candidates.push({
        point: proj,
        tier: 1,
        dist: perpErr,
        guides: g ? [{ kind: 'line', points: [corner, proj] }, g] : [{ kind: 'line', points: [corner, proj] }],
        label: '90°'
      })
    }
  }

  // Tier 2: Isosceles perpendicular bisector of PQ (|VP| = |VQ|).
  {
    const dx = rawPt[0] - mid[0], dy = rawPt[1] - mid[1]
    const err = Math.abs(dx * ux + dy * uy)
    const along = dx * nx + dy * ny
    if (err <= tol && Math.abs(along) >= minDist) {
      const proj: Vec2 = [mid[0] + nx * along, mid[1] + ny * along]
      candidates.push({
        point: proj,
        tier: 2,
        dist: err,
        guides: [{ kind: 'line', points: [mid, proj] }]
      })
    }
  }

  // Tier 2: Isosceles |VP| = |PQ| or |VQ| = |PQ|.
  for (const corner of [p, q] as const) {
    const d = dist(rawPt, corner)
    const err = Math.abs(d - baseLen)
    if (d > 1e-6 && err <= tol) {
      const proj: Vec2 = [corner[0] + ((rawPt[0] - corner[0]) * baseLen) / d, corner[1] + ((rawPt[1] - corner[1]) * baseLen) / d]
      if (dist(proj, p) >= minDist && dist(proj, q) >= minDist) {
        candidates.push({ point: proj, tier: 2, dist: err, guides: [] })
      }
    }
  }

  // Tier 3: Horizontal / vertical alignment with P or Q (allowing x and y to combine).
  {
    let sx = rawPt[0], sy = rawPt[1]
    let ex = Infinity, ey = Infinity
    let gxRef: Vec2 | null = null, gyRef: Vec2 | null = null
    for (const ref of [p, q] as const) {
      const dx = Math.abs(rawPt[0] - ref[0])
      if (dx <= tol && dx < ex) {
        ex = dx
        sx = ref[0]
        gxRef = ref
      }
      const dy = Math.abs(rawPt[1] - ref[1])
      if (dy <= tol && dy < ey) {
        ey = dy
        sy = ref[1]
        gyRef = ref
      }
    }
    if (gxRef || gyRef) {
      const proj: Vec2 = [sx, sy]
      if (dist(proj, p) >= minDist && dist(proj, q) >= minDist) {
        const guides: SnapGuide[] = []
        if (gxRef) guides.push({ kind: 'line', points: [gxRef, proj] })
        if (gyRef) guides.push({ kind: 'line', points: [gyRef, proj] })
        candidates.push({ point: proj, tier: 3, dist: Math.min(ex, ey), guides })
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.tier - b.tier || a.dist - b.dist)
    const best = candidates[0]
    const pt = guardMinDistance(best.point, [p, q], minDist)
    const out = withTriangleLabel(dragIndex, verts, pt, best.guides, true)
    return best.label ? { ...out, label: best.label } : out
  }

  const pt = guardMinDistance(rawPt, [p, q], minDist)
  return withTriangleLabel(dragIndex, verts, pt, [], false)
}

function withTriangleLabel(
  dragIndex: number,
  verts: readonly Vec2[],
  pt: Vec2,
  guides: SnapGuide[],
  snapped: boolean
): SnapPointResult {
  const next: [Vec2, Vec2, Vec2] = [verts[0], verts[1], verts[2]]
  next[dragIndex] = pt
  const angles = triangleAngles(next[0], next[1], next[2])
  const label = angles ? `${Math.round(angles[dragIndex])}°` : null
  return { point: pt, guides, label, snapped }
}

/** Magnetic snapping for dragging one vertex of an arbitrary polygon. */
export function snapPolygonVertex(
  dragIndex: number,
  verts: readonly Vec2[],
  rawPt: Vec2,
  opts: HandleDragOptions
): SnapPointResult {
  const n = verts.length
  const prev = verts[(dragIndex - 1 + n) % n]
  const next = verts[(dragIndex + 1) % n]
  const tol = Math.max(1e-3, opts.snapTol)
  const minDist = tol * 0.8

  if (opts.ctrl) {
    const pt = guardMinDistance(snapToGrid(rawPt, opts.gridStep), [prev, next], minDist)
    const deg = cornerAngleDeg(pt, prev, next)
    return { point: pt, guides: [], label: deg !== null ? `${Math.round(deg)}°` : null, snapped: true }
  }
  if (opts.alt) {
    const pt = guardMinDistance(rawPt, [prev, next], minDist)
    const deg = cornerAngleDeg(pt, prev, next)
    return { point: pt, guides: [], label: deg !== null ? `${Math.round(deg)}°` : null, snapped: false }
  }
  if (opts.shift) {
    const pt = guardMinDistance(snapRay15(prev, rawPt), [prev, next], minDist)
    const deg = cornerAngleDeg(pt, prev, next)
    return {
      point: pt,
      guides: [{ kind: 'line', points: [prev, pt] }],
      label: deg !== null ? `${Math.round(deg)}°` : null,
      snapped: true
    }
  }

  const candidates: Candidate[] = []
  const span = dist(prev, next)
  if (span > 1e-6) {
    // 90 deg at dragged vertex (Thales circle over prev..next).
    const mid: Vec2 = [(prev[0] + next[0]) / 2, (prev[1] + next[1]) / 2]
    const r = span / 2
    const dMid = dist(rawPt, mid)
    if (dMid > 1e-6 && Math.abs(dMid - r) <= tol) {
      const proj: Vec2 = [mid[0] + ((rawPt[0] - mid[0]) * r) / dMid, mid[1] + ((rawPt[1] - mid[1]) * r) / dMid]
      if (dist(proj, prev) >= minDist && dist(proj, next) >= minDist) {
        const g = rightAngleGuide(proj, prev, next, tol * 1.2)
        candidates.push({ point: proj, tier: 1, dist: Math.abs(dMid - r), guides: g ? [g] : [], label: '90°' })
      }
    }
  }

  // Horizontal / vertical alignment with adjacent vertices.
  let sx = rawPt[0], sy = rawPt[1]
  let ex = Infinity, ey = Infinity
  let gxRef: Vec2 | null = null, gyRef: Vec2 | null = null
  for (const ref of [prev, next] as const) {
    const dx = Math.abs(rawPt[0] - ref[0])
    if (dx <= tol && dx < ex) {
      ex = dx
      sx = ref[0]
      gxRef = ref
    }
    const dy = Math.abs(rawPt[1] - ref[1])
    if (dy <= tol && dy < ey) {
      ey = dy
      sy = ref[1]
      gyRef = ref
    }
  }
  if (gxRef || gyRef) {
    const proj: Vec2 = [sx, sy]
    if (dist(proj, prev) >= minDist && dist(proj, next) >= minDist) {
      const guides: SnapGuide[] = []
      if (gxRef) guides.push({ kind: 'line', points: [gxRef, proj] })
      if (gyRef) guides.push({ kind: 'line', points: [gyRef, proj] })
      candidates.push({ point: proj, tier: 2, dist: Math.min(ex, ey), guides })
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.tier - b.tier || a.dist - b.dist)
    const best = candidates[0]
    const pt = guardMinDistance(best.point, [prev, next], minDist)
    const deg = cornerAngleDeg(pt, prev, next)
    return {
      point: pt,
      guides: best.guides,
      label: best.label ?? (deg !== null ? `${Math.round(deg)}°` : null),
      snapped: true
    }
  }

  const pt = guardMinDistance(rawPt, [prev, next], minDist)
  const deg = cornerAngleDeg(pt, prev, next)
  return { point: pt, guides: [], label: deg !== null ? `${Math.round(deg)}°` : null, snapped: false }
}

/** Snap a scalar parameter to the closest target within `tol`. */
export function snapScalar(value: number, targets: readonly number[], tol: number): { value: number; snapped: boolean } {
  let best = value
  let bestErr = tol
  let snapped = false
  for (const target of targets) {
    const err = Math.abs(value - target)
    if (err <= bestErr) {
      bestErr = err
      best = target
      snapped = true
    }
  }
  return { value: best, snapped }
}
