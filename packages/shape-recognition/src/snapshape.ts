import { turnPoint } from '@penrill/core/geometry'
import { boxOfVertices, shapePolygonVertices } from '@penrill/core/shapes'
import type { Point, ShapeSpec, Vec2 } from '@penrill/core/types'

/**
 * Hold-to-snap shapes: draw, keep the pen still at the end, and the stroke becomes the clean shape
 * it resembles. Two steps:
 * 1. the shape as drawn: its kind and tilt kept (a slightly tilted one snaps level), cleaned up to
 *    its kind (an almost right angle becomes 90 deg, almost equal sides equal);
 * 2. keep holding still and it straightens: level, and idealised where it was irregular (`next`).
 * Shapes: circle and oval; triangles (any, right, isosceles, equilateral); rectangle, square,
 * rhombus, parallelogram, trapezoid and any quadrilateral; pentagons, hexagons and polygons up to
 * 8 corners (10 when regular). They become ordinary board shapes with side handles. An open curve
 * on one circle becomes an arc, kept as a clean vector line. Anything else stays as drawn. Keep
 * holding and drag to resize; Shift or a finger on the screen makes it perfect (square, circle,
 * equilateral triangle, regular polygon).
 */
export type SnapKind =
  | 'circle'
  | 'ellipse'
  | 'arc'
  | 'rectangle'
  | 'square'
  | 'triangle'
  | 'rightTriangle'
  | 'rhombus'
  | 'parallelogram'
  | 'trapezoid'
  | 'quadrilateral'
  | 'pentagon'
  | 'hexagon'
  | 'polygon'

export interface Snapped {
  kind: SnapKind
  points: Point[]
  /** What the shape grows from while dragging: its centre (the start of an arc). */
  pivot: [number, number]
  /** The board shape it is (every kind but the arc). */
  spec?: ShapeSpec
  /** The level, tidier version a longer hold turns it into (absent when it already is one). */
  next?: Snapped
}

const P = 0.5
const DEG = Math.PI / 180
const pt = (x: number, y: number): Point => [x, y, P]
/** Tilts smaller than this snap level. */
const LEVEL = 5 * DEG
/** Most corners for an irregular polygon, and for a regular one. */
const MAX_IRREGULAR = 8
const MAX_REGULAR = 10

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1])
const sub = (a: readonly number[], b: readonly number[]): Vec2 => [a[0] - b[0], a[1] - b[1]]
const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0]
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
/** Angle into (-pi, pi]. */
const wrap = (a: number): number => {
  let x = a % (2 * Math.PI)
  if (x <= -Math.PI) x += 2 * Math.PI
  if (x > Math.PI) x -= 2 * Math.PI
  return x
}
/** Angle into (-period/2, period/2]. */
const wrapTo = (a: number, period: number): number => a - Math.round(a / period) * period

function pathLength(pts: readonly Point[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return n
}

function distToSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
}

function distToPolygon(p: readonly number[], verts: readonly Vec2[]): number {
  let best = Infinity
  for (let i = 0; i < verts.length; i++) best = Math.min(best, distToSegment(p, verts[i], verts[(i + 1) % verts.length]))
  return best
}

/** Evenly spaced points along the stroke, so drawing speed doesn't weigh the fits. */
function resample(pts: readonly Point[], n: number): Vec2[] {
  const total = pathLength(pts)
  if (total === 0 || pts.length < 2) return pts.map(([x, y]): Vec2 => [x, y])
  const step = total / (n - 1)
  const out: Vec2[] = [[pts[0][0], pts[0][1]]]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const seg = len(a, b)
    let t = step - carry
    while (t <= seg && out.length < n - 1) {
      out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg])
      t += step
    }
    carry = seg - (t - step)
  }
  const last = pts[pts.length - 1]
  out.push([last[0], last[1]])
  return out
}

/** Ramer-Douglas-Peucker on indices: the corners of a hand-drawn outline. */
function simplify(pts: readonly Vec2[], lo: number, hi: number, eps: number, out: number[]): void {
  let worst = 0
  let index = -1
  for (let i = lo + 1; i < hi; i++) {
    const d = distToSegment(pts[i], pts[lo], pts[hi])
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (index < 0 || worst <= eps) {
    out.push(hi)
    return
  }
  simplify(pts, lo, index, eps, out)
  simplify(pts, index, hi, eps, out)
}

const turnAt = (a: readonly number[], b: readonly number[], d: readonly number[]): number => {
  const v1x = b[0] - a[0], v1y = b[1] - a[1]
  const v2x = d[0] - b[0], v2y = d[1] - b[1]
  return Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y))
}

/** Corner indices of a closed stroke: simplified, the seam merged, and nearly straight joints dropped. */
function cornerIndices(pts: readonly Vec2[], eps: number): number[] {
  const c = [0]
  simplify(pts, 0, pts.length - 1, eps, c)
  // The stroke starts and ends at about the same spot: that's one corner, not two.
  if (c.length > 2) c.pop()
  let changed = true
  while (changed && c.length > 3) {
    changed = false
    for (let i = 0; i < c.length; i++) {
      const a = pts[c[(i + c.length - 1) % c.length]]
      const b = pts[c[i]]
      const d = pts[c[(i + 1) % c.length]]
      // Less than ~25 deg of turn, a tiny edge, or hardly off the line between its neighbours (the
      // start of the stroke in the middle of a side): not a real corner.
      if (turnAt(a, b, d) < 0.44 || len(a, b) < eps || len(b, d) < eps || distToSegment(b, a, d) < eps) {
        c.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return c
}

/** Least-squares line through points: a point on it and its direction. */
function fitLine(pts: readonly Vec2[]): { p: Vec2; d: Vec2 } | null {
  if (pts.length < 2) return null
  let mx = 0, my = 0
  for (const [x, y] of pts) { mx += x; my += y }
  mx /= pts.length
  my /= pts.length
  let sxx = 0, syy = 0, sxy = 0
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
    sxy += (x - mx) * (y - my)
  }
  const a = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { p: [mx, my], d: [Math.cos(a), Math.sin(a)] }
}

function intersect(l1: { p: Vec2; d: Vec2 }, l2: { p: Vec2; d: Vec2 }): Vec2 | null {
  const den = cross(l1.d, l2.d)
  if (Math.abs(den) < 0.05) return null
  const t = cross(sub(l2.p, l1.p), l2.d) / den
  return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t]
}

/**
 * Sharper corners: each side is fitted with a straight line through its middle part, and a corner is
 * where neighbouring sides meet (a hand-drawn corner is usually a little rounded).
 */
function refineCorners(pts: readonly Vec2[], idx: readonly number[], diag: number): Vec2[] {
  const n = idx.length
  const m = pts.length - 1 // pts[m] is about pts[0] (closed stroke)
  const lines = idx.map((from, i) => {
    const to = idx[(i + 1) % n]
    const run: Vec2[] = []
    if (to > from) for (let k = from; k <= to; k++) run.push(pts[k])
    else {
      for (let k = from; k <= m; k++) run.push(pts[k])
      for (let k = 0; k <= to; k++) run.push(pts[k])
    }
    const cut = Math.floor(run.length * 0.15)
    return fitLine(run.slice(cut, run.length - cut))
  })
  return idx.map((k, i) => {
    const a = lines[(i + n - 1) % n]
    const b = lines[i]
    const x = a && b ? intersect(a, b) : null
    return x && len(x, pts[k]) < diag * 0.15 ? x : [pts[k][0], pts[k][1]]
  })
}

/** Twice the signed area (positive = clockwise on screen, y down). */
function area2(v: readonly Vec2[]): number {
  let s = 0
  for (let i = 0; i < v.length; i++) s += cross(v[i], v[(i + 1) % v.length])
  return s
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a))
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c))
  return d1 * d2 < 0 && d3 * d4 < 0
}

function isSimple(v: readonly Vec2[]): boolean {
  const n = v.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) return false
    }
  }
  return true
}

function isConvex(v: readonly Vec2[]): boolean {
  let sign = 0
  for (let i = 0; i < v.length; i++) {
    const c = cross(sub(v[(i + 1) % v.length], v[i]), sub(v[(i + 2) % v.length], v[(i + 1) % v.length]))
    if (Math.abs(c) < 1e-9) continue
    if (sign === 0) sign = Math.sign(c)
    else if (Math.sign(c) !== sign) return false
  }
  return true
}

/** Interior angle at corner i, in radians. */
function cornerAngle(v: readonly Vec2[], i: number): number {
  const n = v.length
  const a = sub(v[(i + n - 1) % n], v[i])
  const b = sub(v[(i + 1) % n], v[i])
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (Math.hypot(...a) * Math.hypot(...b) || 1))))
}

const centroid = (v: readonly Vec2[]): Vec2 => {
  let x = 0, y = 0
  for (const p of v) { x += p[0]; y += p[1] }
  return [x / v.length, y / v.length]
}

const turnAll = (v: readonly Vec2[], c: Vec2, rot: number): Vec2[] => v.map(([x, y]) => turnPoint(x, y, c[0], c[1], rot))

/** A tilt within LEVEL of a quarter turn snaps to it. */
const levelAngle = (rot: number): number => {
  const q = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2)
  return Math.abs(rot - q) < LEVEL ? wrap(q) : rot
}
const quarter = (rot: number): number => wrap(Math.round(rot / (Math.PI / 2)) * (Math.PI / 2))
/** Tilt of a direction, as the nearest-to-level turn: (-45 deg, 45 deg]. */
const tiltOf = (d: Vec2): number => wrapTo(Math.atan2(d[1], d[0]), Math.PI / 2)
/** Mean direction of several sides, the longer ones counting more, up to turns of `period`. */
function meanTilt(dirs: readonly Vec2[], period: number): number {
  const k = (2 * Math.PI) / period
  let sx = 0, sy = 0
  for (const d of dirs) {
    const a = Math.atan2(d[1], d[0]) * k
    const l = Math.hypot(...d)
    sx += Math.cos(a) * l
    sy += Math.sin(a) * l
  }
  return Math.atan2(sy, sx) / k
}

// ---------------------------------------------------------------------------------------------
// Building snapped shapes

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rot: number, n = 96): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = cx + Math.cos(a) * rx
    const y = cy + Math.sin(a) * ry
    out.push(rot ? pt(...turnPoint(x, y, cx, cy, rot)) : pt(x, y))
  }
  return out
}

/** The outline the board draws for this shape (closed: the first point repeats at the end). */
function outline(spec: ShapeSpec): Point[] {
  if (spec.kind === 'ellipse') {
    const cx = (spec.ax + spec.bx) / 2, cy = (spec.ay + spec.by) / 2
    return ellipsePoints(cx, cy, Math.abs(spec.bx - spec.ax) / 2, Math.abs(spec.by - spec.ay) / 2, spec.rot ?? 0)
  }
  const v = shapePolygonVertices(spec)
  return [...v, v[0]].map(([x, y]) => pt(x, y))
}

function fromSpec(spec: ShapeSpec, kind: SnapKind, next?: Snapped): Snapped {
  const s: Snapped = { kind, points: outline(spec), pivot: [(spec.ax + spec.bx) / 2, (spec.ay + spec.by) / 2], spec }
  if (next) s.next = next
  return s
}

/** A box shape centred on `c`, `w` by `h` before it is turned by `rot`. */
function boxSpec(kind: ShapeSpec['kind'], c: Vec2, w: number, h: number, rot: number, extra?: Partial<ShapeSpec>): ShapeSpec {
  const spec: ShapeSpec = { kind, ax: c[0] - w / 2, ay: c[1] - h / 2, bx: c[0] + w / 2, by: c[1] + h / 2, ...extra }
  const r = wrap(rot)
  if (Math.abs(r) > 1e-9) spec.rot = r
  return spec
}

/** Corners turned back by `rot` about their centroid: their box there, and its centre in the world. */
function unturnedBox(v: readonly Vec2[], rot: number): { local: Vec2[]; x0: number; y0: number; x1: number; y1: number; centre: Vec2 } {
  const g = centroid(v)
  const local = turnAll(v, g, -rot)
  const b = boxOfVertices(local)
  const centre = turnPoint((b.ax + b.bx) / 2, (b.ay + b.by) / 2, g[0], g[1], rot)
  return { local, x0: b.ax, y0: b.ay, x1: b.bx, y1: b.by, centre }
}

function vertexSpec(kind: 'triangle' | 'rightTriangle' | 'polygon', v: readonly Vec2[]): ShapeSpec {
  const verts = v.map(([x, y]): Vec2 => [x, y])
  return { kind, ...boxOfVertices(verts), vertices: verts }
}

/** The board's own kind for a regular n-gon: its box shape and where its first corner points. */
function regularKind(n: number): { kind: ShapeSpec['kind']; start: number; base?: number; as: SnapKind } {
  if (n === 5) return { kind: 'pentagon', start: -Math.PI / 2, as: 'pentagon' }
  if (n === 6) return { kind: 'hexagon', start: 0, as: 'hexagon' }
  return { kind: 'polygon', start: -Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0), base: n, as: 'polygon' }
}

/** The regular n-gon closest to these corners: same centre, mean radius, best matching turn. */
function regularFit(v: readonly Vec2[]): { c: Vec2; r: number; turn: number } {
  const n = v.length
  const c = centroid(v)
  let r = 0
  for (const p of v) r += len(p, c)
  r /= n
  // Each corner's offset from a corner of the level n-gon, averaged on the 2pi/n circle.
  let sx = 0, sy = 0
  for (const p of v) {
    const a = Math.atan2(p[1] - c[1], p[0] - c[0]) * n
    sx += Math.cos(a)
    sy += Math.sin(a)
  }
  return { c, r, turn: Math.atan2(sy, sx) / n }
}

function regularVertices(c: Vec2, r: number, n: number, turn: number): Vec2[] {
  return Array.from({ length: n }, (_, i): Vec2 => {
    const a = turn + (i / n) * Math.PI * 2
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]
  })
}

/** A regular polygon as its board shape, `rot` being its turn from the board's level one. */
function regularShape(n: number, c: Vec2, r: number, rot: number): Snapped {
  if (n === 3) {
    const v = regularVertices(c, r, 3, -Math.PI / 2 + rot)
    return triangleFrom(v, 'triangle')
  }
  const k = regularKind(n)
  return fromSpec(boxSpec(k.kind, c, 2 * r, 2 * r, wrapTo(rot, (2 * Math.PI) / n), k.base ? { base: k.base } : undefined), k.as)
}

/** Do both shapes draw the same outline? */
function samePlace(a: Snapped, b: Snapped): boolean {
  if (!a.spec || !b.spec) return false
  if (a.spec.kind === 'ellipse' || b.spec.kind === 'ellipse') {
    if (a.spec.kind !== b.spec.kind) return false
    const close = (x: number, y: number): boolean => Math.abs(x - y) < 1e-6 * (1 + Math.abs(x))
    return close(a.spec.ax, b.spec.ax) && close(a.spec.ay, b.spec.ay) && close(a.spec.bx, b.spec.bx) && close(a.spec.by, b.spec.by) && !a.spec.rot === !b.spec.rot
  }
  const va = a.points.slice(0, -1), vb = b.points.slice(0, -1)
  if (va.length !== vb.length) return false
  const box = boxOfVertices(vb.map(([x, y]): Vec2 => [x, y]))
  const tol = Math.hypot(box.bx - box.ax, box.by - box.ay) * 0.01
  return va.every((p) => vb.some((q) => len(p, q) < tol))
}

/** The shape with its level version as `next`; when they are the same, just the level one. */
function staged(first: Snapped, level: Snapped | null): Snapped {
  if (!level) return first
  if (samePlace(first, level)) return level
  return { ...first, next: level }
}

// ---------------------------------------------------------------------------------------------
// Ellipses

/** Principal axes of the points: centre, radii along them and the turn of the first one. */
function fitEllipse(pts: readonly Vec2[]): { c: Vec2; rx: number; ry: number; rot: number } {
  const line = fitLine(pts)!
  let rot = Math.atan2(line.d[1], line.d[0])
  const [mx, my] = line.p
  const cos = Math.cos(rot), sin = Math.sin(rot)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const [x, y] of pts) {
    const u = (x - mx) * cos + (y - my) * sin
    const v = -(x - mx) * sin + (y - my) * cos
    u0 = Math.min(u0, u); u1 = Math.max(u1, u)
    v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2
  const c: Vec2 = [mx + uc * cos - vc * sin, my + uc * sin + vc * cos]
  let rx = (u1 - u0) / 2, ry = (v1 - v0) / 2
  // The smallest turn that lines the axes up.
  if (rot > Math.PI / 4 || rot < -Math.PI / 4) {
    rot = wrapTo(rot, Math.PI / 2)
    ;[rx, ry] = [ry, rx]
  }
  return { c, rx, ry, rot }
}

/** Mean distance of the points from the ellipse (approximately), and their mean relative miss. */
function ellipseError(pts: readonly Vec2[], e: { c: Vec2; rx: number; ry: number; rot: number }): { abs: number; rel: number } {
  if (e.rx < 1e-6 || e.ry < 1e-6) return { abs: Infinity, rel: Infinity }
  const cos = Math.cos(e.rot), sin = Math.sin(e.rot)
  let rel = 0
  for (const [x, y] of pts) {
    const dx = x - e.c[0], dy = y - e.c[1]
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos
    rel += Math.abs(Math.hypot(u / e.rx, v / e.ry) - 1)
  }
  rel /= pts.length
  return { abs: rel * ((e.rx + e.ry) / 2), rel }
}

function ellipseShape(e: { c: Vec2; rx: number; ry: number; rot: number }): Snapped {
  const ratio = e.rx / e.ry
  if (ratio > 0.85 && ratio < 1 / 0.85) {
    const r = (e.rx + e.ry) / 2
    return fromSpec(boxSpec('ellipse', e.c, 2 * r, 2 * r, 0), 'circle')
  }
  const rot = levelAngle(e.rot)
  const first = fromSpec(boxSpec('ellipse', e.c, 2 * e.rx, 2 * e.ry, rot), 'ellipse')
  return staged(first, fromSpec(boxSpec('ellipse', e.c, 2 * e.rx, 2 * e.ry, 0), 'ellipse'))
}

// ---------------------------------------------------------------------------------------------
// Triangles

function triangleFrom(v: readonly Vec2[], kind: 'triangle' | 'rightTriangle', next?: Snapped): Snapped {
  return fromSpec(vertexSpec(kind, v), kind, next)
}

/** Corners turned by `rot` about their centroid, with tiny tilts dropped. */
function levelled(v: readonly Vec2[], tilt: number): Vec2[] {
  const l = levelAngle(tilt)
  return Math.abs(l - tilt) > 1e-12 ? turnAll(v, centroid(v), l - tilt) : [...v]
}

function triangleShape(c: readonly Vec2[]): Snapped {
  // Clockwise on screen, as the board's own triangles.
  let v: Vec2[] = area2(c) < 0 ? [c[0], c[2], c[1]] : [...c]
  const angles = v.map((_, i) => cornerAngle(v, i))
  const right = angles.findIndex((a) => Math.abs(a - Math.PI / 2) < 7 * DEG)
  if (right >= 0) {
    // The right angle in the middle (like the board's right triangle), made exactly 90 deg.
    const a = v[(right + 2) % 3], b = v[right], d = v[(right + 1) % 3]
    const m: Vec2 = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2]
    const k = len(a, d) / 2 / (len(b, m) || 1)
    const b2: Vec2 = [m[0] + (b[0] - m[0]) * k, m[1] + (b[1] - m[1]) * k]
    v = [d, b2, a]
    v = levelled(v, tiltOf(sub(v[0], v[1])))
    return staged(triangleFrom(v, 'rightTriangle'), levelRightTriangle(v))
  }
  const sides = v.map((p, i) => len(p, v[(i + 1) % 3]))
  const mean = (sides[0] + sides[1] + sides[2]) / 3
  if (sides.every((s) => Math.abs(s - mean) < mean * 0.08)) {
    const fit = regularFit(v)
    const tilt = levelAngle(wrapTo(fit.turn + Math.PI / 2, (2 * Math.PI) / 3))
    const eq = regularVertices(fit.c, fit.r, 3, -Math.PI / 2 + tilt)
    return staged(triangleFrom(eq, 'triangle'), levelTriangle(eq))
  }
  // Two equal sides: the apex moves onto the middle line of the base.
  for (let i = 0; i < 3; i++) {
    const s1 = sides[(i + 2) % 3], s2 = sides[i] // the sides at corner i
    if (Math.abs(s1 - s2) < ((s1 + s2) / 2) * 0.08) {
      const apex = v[i], p = v[(i + 1) % 3], q = v[(i + 2) % 3]
      const m: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
      const base = sub(q, p)
      const nrm: Vec2 = [-base[1] / (Math.hypot(...base) || 1), base[0] / (Math.hypot(...base) || 1)]
      const h = dot(sub(apex, m), nrm)
      const out = [...v]
      out[i] = [m[0] + nrm[0] * h, m[1] + nrm[1] * h]
      const lv = levelled(out, tiltOf(base))
      return staged(triangleFrom(lv, 'triangle'), levelTriangle(lv))
    }
  }
  const longest = sides.indexOf(Math.max(...sides))
  const lv = levelled(v, tiltOf(sub(v[(longest + 1) % 3], v[longest])))
  return staged(triangleFrom(lv, 'triangle'), levelTriangle(lv))
}

/** Level: the longest side down, the triangle the board's isosceles one in that box. */
function levelTriangle(v: readonly Vec2[]): Snapped {
  const sides = v.map((p, i) => len(p, v[(i + 1) % 3]))
  const i = sides.indexOf(Math.max(...sides))
  const d = sub(v[(i + 1) % 3], v[i])
  let rot = Math.atan2(d[1], d[0])
  const g = centroid(v)
  // The third corner above the base.
  const apex = turnPoint(v[(i + 2) % 3][0], v[(i + 2) % 3][1], g[0], g[1], -rot)
  const base = turnPoint(v[i][0], v[i][1], g[0], g[1], -rot)
  if (apex[1] > base[1]) rot += Math.PI
  // Turned level in place (about its centroid).
  const b = unturnedBox(v, rot)
  return fromSpec({ kind: 'triangle', ax: b.x0, ay: b.y0, bx: b.x1, by: b.y1 }, 'triangle')
}

/** Level: legs along the axes; the board's right triangle when the right angle ends up bottom left. */
function levelRightTriangle(v: readonly Vec2[]): Snapped {
  const tilt = tiltOf(sub(v[0], v[1]))
  const lv = turnAll(v, centroid(v), -tilt)
  const b = boxOfVertices(lv)
  const w = b.bx - b.ax, h = b.by - b.ay
  const tol = Math.max(w, h) * 1e-6
  if (Math.abs(lv[1][0] - b.ax) < tol + 1e-9 && Math.abs(lv[1][1] - b.by) < tol + 1e-9) {
    return fromSpec({ kind: 'rightTriangle', ...b }, 'rightTriangle')
  }
  return triangleFrom(lv, 'rightTriangle')
}

// ---------------------------------------------------------------------------------------------
// Quadrilaterals

const parallel = (a: Vec2, b: Vec2): boolean => Math.abs(cross(a, b)) / (Math.hypot(...a) * Math.hypot(...b) || 1) < Math.sin(8 * DEG)

/** Level version of a box shape: turned to the nearest quarter turn. */
function levelBox(s: Snapped): Snapped | null {
  if (!s.spec) return null
  const rot = quarter(s.spec.rot ?? 0)
  const spec: ShapeSpec = { ...s.spec }
  delete spec.rot
  if (Math.abs(rot) > 1e-9) spec.rot = rot
  return fromSpec(spec, s.kind)
}

function quadShape(c: readonly Vec2[]): Snapped | null {
  const v: Vec2[] = area2(c) < 0 ? [c[0], c[3], c[2], c[1]] : [...c]
  if (!isSimple(v)) return null
  const s = v.map((p, i) => sub(v[(i + 1) % 4], p))
  const lens = s.map((d) => Math.hypot(...d))
  const p02 = parallel(s[0], s[2]), p13 = parallel(s[1], s[3])
  if (p02 && p13) {
    const angles = v.map((_, i) => cornerAngle(v, i))
    if (angles.every((a) => Math.abs(a - Math.PI / 2) < 10 * DEG)) {
      const tilt = meanTilt(s, Math.PI / 2)
      const rot = levelAngle(tilt)
      // Measured along its own sides; a tiny tilt then snaps level.
      const b = unturnedBox(v, tilt)
      let w = b.x1 - b.x0, h = b.y1 - b.y0
      let kind: SnapKind = 'rectangle'
      if (w / h > 0.9 && w / h < 1 / 0.9) {
        w = h = (w + h) / 2
        kind = 'square'
      }
      const first = fromSpec(boxSpec('rectangle', b.centre, w, h, rot), kind)
      return staged(first, levelBox(first))
    }
    const mean = (lens[0] + lens[1] + lens[2] + lens[3]) / 4
    if (lens.every((l) => Math.abs(l - mean) < mean * 0.12)) {
      // Rhombus: the board's one has its diagonals along the axes.
      const tilt = meanTilt([sub(v[2], v[0]), sub(v[3], v[1])], Math.PI / 2)
      const rot = levelAngle(tilt)
      const b = unturnedBox(v, tilt)
      const first = fromSpec(boxSpec('rhombus', b.centre, b.x1 - b.x0, b.y1 - b.y0, rot), 'rhombus')
      return staged(first, levelBox(first))
    }
    // Parallelogram: the pair of sides nearest level becomes its top and bottom.
    const r0 = wrapTo(Math.atan2(s[0][1], s[0][0]), Math.PI), r1 = wrapTo(Math.atan2(s[1][1], s[1][0]), Math.PI)
    const tilt = Math.abs(r0) <= Math.abs(r1) ? meanTilt([s[0], s[2]], Math.PI) : meanTilt([s[1], s[3]], Math.PI)
    const rot = levelAngle(tilt)
    const b = unturnedBox(v, tilt)
    const w = b.x1 - b.x0
    const byY = [...b.local].sort((p, q) => p[1] - q[1])
    const topLeftX = Math.min(byY[0][0], byY[1][0])
    const bottomLeftX = Math.min(byY[2][0], byY[3][0])
    const skew = topLeftX > bottomLeftX ? (topLeftX - b.x0) / w : -(bottomLeftX - b.x0) / w
    if (Math.abs(skew) <= 0.75) {
      const first = fromSpec(boxSpec('parallelogram', b.centre, w, b.y1 - b.y0, rot, { skew }), 'parallelogram')
      return staged(first, levelBox(first))
    }
  } else if (p02 || p13) {
    const trap = trapezoidShape(v, p02 ? 0 : 1)
    if (trap) return trap
  }
  // Any other quadrilateral: its own corners; level, the rectangle of its box.
  const first = fromSpec(vertexSpec('polygon', v), 'quadrilateral')
  if (!isConvex(v)) return first
  const longest = lens.indexOf(Math.max(...lens))
  // Turned level in place (about its centroid).
  const b = unturnedBox(v, tiltOf(s[longest]))
  return { ...first, next: fromSpec({ kind: 'rectangle', ax: b.x0, ay: b.y0, bx: b.x1, by: b.y1 }, 'rectangle') }
}

/** Trapezoid with sides `i` and `i + 2` as its bases (the longer one at the bottom). */
function trapezoidShape(v: readonly Vec2[], i: number): Snapped | null {
  // Along both bases (they run opposite ways round the outline).
  const da = sub(v[i + 1], v[i]), db = sub(v[(i + 3) % 4], v[(i + 2) % 4])
  const la = Math.hypot(...da) || 1, lb = Math.hypot(...db) || 1
  let rot = Math.atan2(da[1] / la - db[1] / lb, da[0] / la - db[0] / lb)
  const g = centroid(v)
  const local = turnAll(v, g, -rot)
  const baseA = [local[i], local[i + 1]], baseB = [local[(i + 2) % 4], local[(i + 3) % 4]]
  const span = (b: Vec2[]): number => Math.abs(b[1][0] - b[0][0])
  const yOf = (b: Vec2[]): number => (b[0][1] + b[1][1]) / 2
  const [longer, shorter] = span(baseA) >= span(baseB) ? [baseA, baseB] : [baseB, baseA]
  // Turn half way round when the longer base would be on top.
  if (yOf(longer) < yOf(shorter)) rot += Math.PI
  const tilt = wrap(rot)
  rot = levelAngle(tilt)
  const b = unturnedBox(v, tilt)
  const w = b.x1 - b.x0
  const byY = [...b.local].sort((p, q) => p[1] - q[1])
  const top = [byY[0][0], byY[1][0]].sort((p, q) => p - q)
  const bottom = [byY[2][0], byY[3][0]].sort((p, q) => p - q)
  const tol = w * 0.03
  // The top must sit over the bottom, as the board's trapezoid does.
  if (top[0] < bottom[0] - tol || top[1] > bottom[1] + tol) return null
  let tl = Math.max(0, (top[0] - b.x0) / w)
  let tr = Math.max(0, (b.x1 - top[1]) / w)
  if (Math.abs(tl - tr) < 0.06) tl = tr = (tl + tr) / 2
  if (tl < 0.04) tl = 0
  if (tr < 0.04) tr = 0
  if (tl + tr > 0.96) return null
  const first = fromSpec(boxSpec('trapezoid', b.centre, w, b.y1 - b.y0, rot, { topLeft: tl, topRight: tr }), 'trapezoid')
  return staged(first, levelBox(first))
}

// ---------------------------------------------------------------------------------------------
// Polygons

function polygonShape(v: readonly Vec2[]): Snapped | null {
  const n = v.length
  if (!isSimple(v)) return null
  const sides = v.map((p, i) => len(p, v[(i + 1) % n]))
  const mean = sides.reduce((a, b) => a + b, 0) / n
  const inner = ((n - 2) * Math.PI) / n
  const regular =
    isConvex(v) && sides.every((s) => Math.abs(s - mean) < mean * 0.2) && v.every((_, i) => Math.abs(cornerAngle(v, i) - inner) < 15 * DEG)
  const fit = regularFit(v)
  const k = regularKind(n)
  const level = regularShape(n, fit.c, fit.r, 0)
  if (regular) {
    const rot = levelAngle(wrapTo(fit.turn - k.start, (2 * Math.PI) / n))
    return staged(regularShape(n, fit.c, fit.r, rot), level)
  }
  if (n > MAX_IRREGULAR) return null
  const first = fromSpec(vertexSpec('polygon', area2(v) < 0 ? [...v].reverse() : v), 'polygon')
  return isConvex(v) ? { ...first, next: level } : first
}

// ---------------------------------------------------------------------------------------------
// Arcs

/** Least-squares circle through the points (Kasa fit): centre and radius. */
function fitCircle(points: readonly Point[]): { cx: number; cy: number; r: number } | null {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
  const n = points.length
  for (const [x, y] of points) {
    const z = x * x + y * y
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z
  }
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] · [a b c] = [sxz syz sz], circle x² + y² = a x + b y + c.
  const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]]
  for (let i = 0; i < 3; i++) {
    let p = i
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k
    ;[m[i], m[p]] = [m[p], m[i]]
    if (Math.abs(m[i][i]) < 1e-9) return null
    for (let k = 0; k < 3; k++) {
      if (k === i) continue
      const f = m[k][i] / m[i][i]
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]
    }
  }
  const a = m[0][3] / m[0][0], b = m[1][3] / m[1][1], c = m[2][3] / m[2][2]
  const cx = a / 2, cy = b / 2
  const r2 = c + cx * cx + cy * cy
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : null
}

function arcPoints(cx: number, cy: number, r: number, a0: number, sweep: number): Point[] {
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (4 * DEG)))
  const out: Point[] = []
  for (let i = 0; i <= n; i++) out.push(pt(cx + Math.cos(a0 + (sweep * i) / n) * r, cy + Math.sin(a0 + (sweep * i) / n) * r))
  return out
}

/** An open stroke is an arc when its points sit on one circle and it doesn't come back on itself. */
function arcShape(points: readonly Point[], diag: number): Snapped | null {
  // It must bulge clearly: a slightly bent straight stroke is not an arc.
  const first = points[0]
  const last = points[points.length - 1]
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1])
  let bulge = 0
  for (const p of points) bulge = Math.max(bulge, distToSegment(p, first, last))
  if (bulge < chord * 0.12) return null
  const fit = fitCircle(points)
  // A huge circle means the stroke is nearly straight: not an arc.
  if (!fit || fit.r > diag * 2) return null
  let err = 0
  for (const [x, y] of points) err += Math.abs(Math.hypot(x - fit.cx, y - fit.cy) - fit.r)
  if (err / points.length > fit.r * 0.05) return null
  let sweep = 0
  for (let i = 1; i < points.length; i++) {
    let d = Math.atan2(points[i][1] - fit.cy, points[i][0] - fit.cx) - Math.atan2(points[i - 1][1] - fit.cy, points[i - 1][0] - fit.cx)
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    sweep += d
  }
  if (Math.abs(sweep) < 30 * DEG || Math.abs(sweep) > 330 * DEG) return null
  const a0 = Math.atan2(first[1] - fit.cy, first[0] - fit.cx)
  return { kind: 'arc', points: arcPoints(fit.cx, fit.cy, fit.r, a0, sweep), pivot: [fit.cx, fit.cy] }
}

// ---------------------------------------------------------------------------------------------

/**
 * The clean shape this stroke resembles, or null when it isn't one of the snapping shapes (the
 * stroke then stays as drawn). `minSize` is the smallest shape worth snapping, in board units.
 */
export function recognizeShape(points: readonly Point[], minSize = 8): Snapped | null {
  if (points.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag < minSize) return null
  const first = points[0]
  const last = points[points.length - 1]
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1])

  // Closed when the end comes back near the start (hand-drawn circles rarely meet exactly).
  if (gap > pathLength(points) * 0.2 && gap > diag * 0.25) return arcShape(points, diag)
  if (w < minSize / 2 || h < minSize / 2) return null

  const pts = resample(points, 128)
  const ellipse = fitEllipse(pts)
  const ellErr = ellipseError(pts, ellipse)
  const round = ellErr.rel <= 0.15

  const idx = cornerIndices(pts, diag * 0.07)
  if (idx.length >= 3 && idx.length <= MAX_REGULAR) {
    const c = refineCorners(pts, idx, diag)
    let polyErr = 0
    for (const p of pts) polyErr += distToPolygon(p, c)
    polyErr /= pts.length
    // Straight sides fit better than an ellipse: a polygon.
    if (polyErr <= diag * 0.04 && !(round && ellErr.abs < polyErr)) {
      const shape = c.length === 3 ? triangleShape(c) : c.length === 4 ? quadShape(c) : polygonShape(c)
      if (shape) return shape
    }
  }
  return round ? ellipseShape(ellipse) : null
}

/** Perfect corners of a vertex triangle: equilateral, or isosceles when it has a right angle. */
function perfectTriangle(s: Snapped): Snapped {
  const v = s.spec!.vertices!
  if (s.spec!.kind === 'rightTriangle') {
    // The right angle is the middle corner: both legs get their mean length.
    const [a, b, d] = v
    const l = (len(a, b) + len(d, b)) / 2
    const leg = (p: Vec2): Vec2 => {
      const k = l / (len(p, b) || 1)
      return [b[0] + (p[0] - b[0]) * k, b[1] + (p[1] - b[1]) * k]
    }
    return triangleFrom([leg(a), b, leg(d)], 'rightTriangle')
  }
  const fit = regularFit(v)
  return triangleFrom(regularVertices(fit.c, fit.r, 3, fit.turn), 'triangle')
}

/**
 * The perfect version (Shift or a finger): rectangle to square, oval to circle, rhombus to square,
 * triangle to equilateral (right triangle: isosceles), trapezoid to isosceles, polygon to regular.
 * The turn is kept.
 */
export function perfectShape(s: Snapped): Snapped {
  const spec = s.spec
  if (!spec) return s
  if (spec.vertices) {
    if (spec.kind === 'triangle' || spec.kind === 'rightTriangle') return perfectTriangle(s)
    const fit = regularFit(spec.vertices)
    return regularShape(spec.vertices.length, fit.c, fit.r, wrapTo(fit.turn - regularKind(spec.vertices.length).start, (2 * Math.PI) / spec.vertices.length))
  }
  const [px, py] = s.pivot
  const w = Math.abs(spec.bx - spec.ax)
  const h = Math.abs(spec.by - spec.ay)
  let hw = w / 2, hh = h / 2
  let kind = s.kind
  const extra: Partial<ShapeSpec> = {}
  let rot = spec.rot ?? 0
  switch (spec.kind) {
    case 'rectangle':
      hw = hh = Math.max(w, h) / 2
      kind = 'square'
      break
    case 'ellipse':
      hw = hh = (w + h) / 4
      kind = 'circle'
      rot = 0
      break
    case 'rhombus':
    case 'rightTriangle':
    case 'pentagon':
    case 'hexagon':
    case 'polygon':
      hw = hh = Math.max(w, h) / 2
      break
    case 'triangle':
      hh = (w * Math.sqrt(3)) / 4
      break
    case 'trapezoid': {
      const t = ((spec.topLeft ?? 0.22) + (spec.topRight ?? 0.22)) / 2
      extra.topLeft = extra.topRight = t
      break
    }
  }
  const out: ShapeSpec = { ...spec, ...extra, ax: px - hw, ay: py - hh, bx: px + hw, by: py + hh }
  delete out.rot
  if (rot) out.rot = rot
  return fromSpec(out, kind)
}

/**
 * Keep holding after the snap and drag: the shape grows or shrinks around its pivot (it never
 * turns). The scale is how much further the pen is from the pivot than at `from`, where it was
 * when the shape snapped.
 */
export function holdShape(base: Snapped, from: readonly [number, number], to: readonly [number, number], perfect = false): Snapped {
  const s = perfect ? perfectShape(base) : base
  const [px, py] = s.pivot
  const la = Math.hypot(from[0] - px, from[1] - py)
  const lb = Math.hypot(to[0] - px, to[1] - py)
  // The pen sits on the pivot: nothing sensible to scale by.
  if (la < 1e-6 || lb < 1e-6) return s
  const k = lb / la
  const map = (x: number, y: number): [number, number] => [px + (x - px) * k, py + (y - py) * k]
  if (s.spec) {
    const [ax, ay] = map(s.spec.ax, s.spec.ay)
    const [bx, by] = map(s.spec.bx, s.spec.by)
    const spec: ShapeSpec = { ...s.spec, ax, ay, bx, by }
    if (s.spec.vertices) spec.vertices = s.spec.vertices.map(([x, y]) => map(x, y))
    return fromSpec(spec, s.kind)
  }
  return { ...s, points: s.points.map(([x, y, p]): Point => [...map(x, y), p]) }
}
