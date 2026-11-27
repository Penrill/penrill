import { turnPoint } from './geometry'
import type { EvalConstruction } from './shapeEval'
import type { ShapeConstruction, ShapeGeometry, TangentMarks, Vec2 } from './types'

/**
 * Tangents to a circle (or an ellipse) and the school facts that come with them: the radius to the
 * touch point is perpendicular to the tangent, two tangents from one point P are equal (PA = PB),
 * PO bisects the angle APB, ∠APB + ∠AOB = 180°, and the angle between a tangent and the chord AB is
 * half the arc AB. Pure geometry, shared by the evaluator, the handles and the board's build mode.
 */

export type TangentConstruction = Extract<ShapeConstruction, { kind: 'tangent' }>

/**
 * How far from the circle's edge two tangents may meet and still be drawn up to their crossing
 * point: 10 cm of the board (one centimetre is two cells of the squared paper, 48 units; see
 * src/board/engine/straightedge.ts `CM`).
 */
export const TANGENT_REACH = 10 * 48
/** The shortest side a tangent can have, 0.5 cm. */
export const TANGENT_MIN_SIDE = 24

export interface EllipseFrame {
  cx: number
  cy: number
  rx: number
  ry: number
  rot: number
  /** The unit tangent lengths are measured in: the radius (the mean one for an ellipse). */
  unit: number
  /** True for a circle: only then do the radius and angle facts hold, so only then are they marked. */
  circle: boolean
}

export function ellipseFrame(geo: ShapeGeometry): EllipseFrame {
  const x0 = Math.min(geo.ax, geo.bx), x1 = Math.max(geo.ax, geo.bx)
  const y0 = Math.min(geo.ay, geo.by), y1 = Math.max(geo.ay, geo.by)
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    rx,
    ry,
    rot: geo.rot ?? 0,
    unit: Math.max(1e-6, (rx + ry) / 2),
    circle: Math.abs(rx - ry) <= Math.max(rx, ry) * 0.02
  }
}

/** The touch point at parameter `angle` and the unit direction of the tangent there (growing angle). */
export function tangentAt(f: EllipseFrame, angle: number): { at: Vec2; dir: Vec2 } {
  const raw: Vec2 = [f.cx + Math.cos(angle) * f.rx, f.cy + Math.sin(angle) * f.ry]
  const at = f.rot ? turnPoint(raw[0], raw[1], f.cx, f.cy, f.rot) : raw
  let dx = -Math.sin(angle) * f.rx
  let dy = Math.cos(angle) * f.ry
  if (f.rot) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot)
    ;[dx, dy] = [dx * c - dy * s, dx * s + dy * c]
  }
  const len = Math.hypot(dx, dy) || 1
  return { at, dir: [dx / len, dy / len] }
}

/** The parameter angle of the point on the ellipse nearest to `p` (exact for a circle). */
export function nearestAngle(f: EllipseFrame, p: Vec2): number {
  const local = f.rot ? turnPoint(p[0], p[1], f.cx, f.cy, -f.rot) : p
  const ux = (local[0] - f.cx) / Math.max(1e-6, f.rx)
  const uy = (local[1] - f.cy) / Math.max(1e-6, f.ry)
  let t = Math.atan2(uy, ux)
  // A few Newton steps for an ellipse: the nearest point is not on the ray through the centre.
  for (let i = 0; i < 6 && !f.circle; i++) {
    const ex = f.rx * Math.cos(t), ey = f.ry * Math.sin(t)
    const tx = -f.rx * Math.sin(t), ty = f.ry * Math.cos(t)
    const dx = ex - (local[0] - f.cx), dy = ey - (local[1] - f.cy)
    const g = dx * tx + dy * ty
    const h = tx * tx + ty * ty + dx * -ex + dy * -ey
    if (Math.abs(h) < 1e-9) break
    t -= g / h
  }
  return t
}

/** Distance from `p` to the ellipse outline (approximate for an ellipse, exact for a circle). */
export function distanceToOutline(f: EllipseFrame, p: Vec2): number {
  const { at } = tangentAt(f, nearestAngle(f, p))
  return Math.hypot(p[0] - at[0], p[1] - at[1])
}

/** One drawn tangent: its stored sides plus any extension up to a crossing point. */
export interface LaidTangent {
  c: TangentConstruction
  at: Vec2
  dir: Vec2
  /** Side lengths in board units as drawn (never shorter than stored). */
  back: number
  fwd: number
  /** Letter of the touch point: A, B, C… */
  letter: string
}

/** Two neighbouring tangents that meet at P near enough to the circle. */
export interface TangentPair {
  a: LaidTangent
  b: LaidTangent
  p: Vec2
  letter: string
}

const TOUCH_LETTERS = 'ABCDEFGHIKLMN'
const CROSS_LETTERS = 'PQRSTUVWXYZ'
const letterOf = (set: string, i: number): string => set[i % set.length] + (i >= set.length ? String(Math.floor(i / set.length)) : '')

/** The letter of the i-th tangent's touch point (in the order they were built). */
export const tangentLetter = (i: number): string => letterOf(TOUCH_LETTERS, i)

const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0]

/**
 * Lay the circle's tangents out: neighbouring ones (by position around the circle) are intersected,
 * and when they meet within TANGENT_REACH of the edge a side too short to reach the crossing point
 * is drawn up to it. A side that already goes past it is left as it is.
 */
export function layTangents(f: EllipseFrame, tangents: readonly TangentConstruction[]): { laid: LaidTangent[]; pairs: TangentPair[] } {
  const laid: LaidTangent[] = tangents.map((c, i) => {
    const { at, dir } = tangentAt(f, c.angle)
    return { c, at, dir, back: c.back * f.unit, fwd: c.fwd * f.unit, letter: letterOf(TOUCH_LETTERS, i) }
  })
  const pairs: TangentPair[] = []
  if (laid.length < 2) return { laid, pairs }
  const norm = (a: number): number => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const ring = [...laid].sort((x, y) => norm(x.c.angle) - norm(y.c.angle))
  const count = ring.length === 2 ? 1 : ring.length
  const outer = Math.max(f.rx, f.ry)
  for (let i = 0; i < count; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const den = cross(a.dir, b.dir)
    if (Math.abs(den) < 1e-6) continue
    const d: Vec2 = [b.at[0] - a.at[0], b.at[1] - a.at[1]]
    const s = cross(d, b.dir) / den
    const t = cross(d, a.dir) / den
    const p: Vec2 = [a.at[0] + a.dir[0] * s, a.at[1] + a.dir[1] * s]
    if (Math.hypot(p[0] - f.cx, p[1] - f.cy) - outer > TANGENT_REACH) continue
    if (s >= 0) a.fwd = Math.max(a.fwd, s)
    else a.back = Math.max(a.back, -s)
    if (t >= 0) b.fwd = Math.max(b.fwd, t)
    else b.back = Math.max(b.back, -t)
    pairs.push({ a, b, p, letter: letterOf(CROSS_LETTERS, pairs.length) })
  }
  return { laid, pairs }
}

/** The ends of a laid tangent: [back end, front end]. */
export function tangentEnds(t: Pick<LaidTangent, 'at' | 'dir' | 'back' | 'fwd'>): [Vec2, Vec2] {
  return [
    [t.at[0] - t.dir[0] * t.back, t.at[1] - t.dir[1] * t.back],
    [t.at[0] + t.dir[0] * t.fwd, t.at[1] + t.dir[1] * t.fwd]
  ]
}

/** Which groups of marks are on (all of them unless switched off). */
export function marksOn(m: TangentMarks | undefined): Required<TangentMarks> {
  return { radius: m?.radius !== false, angle: m?.angle !== false, equal: m?.equal !== false, chord: m?.chord !== false }
}

type Text = NonNullable<EvalConstruction['texts']>[number]
type Segment = EvalConstruction['segments'][number]

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const len2 = (v: Vec2): number => Math.hypot(v[0], v[1])
const unitOf = (v: Vec2): Vec2 => {
  const l = len2(v) || 1
  return [v[0] / l, v[1] / l]
}

/** The arc of the angle between rays `u` and `v` (unit) at `o`, and its size in degrees with the text spot. */
function angleMark(o: Vec2, u: Vec2, v: Vec2, r: number, gap: number): { seg: Segment; text: Text } {
  const a0 = Math.atan2(u[1], u[0])
  let sweep = Math.atan2(v[1], v[0]) - a0
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const steps = Math.max(6, Math.ceil(Math.abs(sweep) / 0.12))
  const pts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps
    pts.push([o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r])
  }
  const mid = a0 + sweep / 2
  const tr = r + gap
  return {
    seg: { pts, thin: true },
    text: { deg: (Math.abs(sweep) * 180) / Math.PI, pos: [o[0] + Math.cos(mid) * tr, o[1] + Math.sin(mid) * tr] }
  }
}

/** The 90° square at `o` between unit rays `u` and `v`. */
function rightMark(o: Vec2, u: Vec2, v: Vec2, m: number): Segment {
  return {
    pts: [
      [o[0] + u[0] * m, o[1] + u[1] * m],
      [o[0] + (u[0] + v[0]) * m, o[1] + (u[1] + v[1]) * m],
      [o[0] + v[0] * m, o[1] + v[1] * m]
    ],
    thin: true
  }
}

/** A short stroke across the middle of segment a-b: the "equal segments" tick. */
function tick(a: Vec2, b: Vec2, half: number): Segment {
  const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const [ux, uy] = unitOf(sub(b, a))
  return { pts: [[m[0] - uy * half, m[1] + ux * half], [m[0] + uy * half, m[1] - ux * half]], thin: true }
}

/**
 * The circle's tangents as constructions: each tangent with its touch point and letter, and, on
 * the tangent that starts each pair, the marks of that pair (P, the angles, equal ticks, chord).
 */
export function evaluateTangents(
  geo: ShapeGeometry,
  tangents: readonly TangentConstruction[],
  marks: TangentMarks | undefined,
  size: number,
  hasCenter: boolean
): EvalConstruction[] {
  if (!tangents.length) return []
  const f = ellipseFrame(geo)
  const on = marksOn(marks)
  const o: Vec2 = [f.cx, f.cy]
  const { laid, pairs } = layTangents(f, tangents)
  const gap = 10 + size * 1.5
  const out = new Map<string, EvalConstruction>()
  for (const t of laid) {
    const [e0, e1] = tangentEnds(t)
    const ev: EvalConstruction = {
      id: t.c.id,
      kind: 'tangent',
      segments: [{ pts: [e0, e1] }],
      dots: [{ pos: t.at }],
      texts: [{ letter: t.letter, pos: t.at, awayFrom: o }]
    }
    if (f.circle && on.radius) {
      ev.segments.push({ pts: [o, t.at], dash: 'dashed', thin: true })
      const side: Vec2 = t.fwd >= t.back ? t.dir : [-t.dir[0], -t.dir[1]]
      ev.segments.push(rightMark(t.at, unitOf(sub(o, t.at)), side, Math.min(8 + size * 1.5, f.unit * 0.3)))
    }
    out.set(t.c.id, ev)
  }
  let usesCenter = f.circle && on.radius
  for (const pair of pairs) {
    const ev = out.get(pair.a.c.id)!
    const { a, b, p } = pair
    const pa = sub(a.at, p), pb = sub(b.at, p)
    const side = Math.min(len2(pa), len2(pb))
    ev.dots!.push({ pos: p })
    ev.texts!.push({ letter: pair.letter, pos: p, awayFrom: o })
    if (on.angle && side > 1) {
      const m = angleMark(p, unitOf(pa), unitOf(pb), Math.min(28 + size, side * 0.35), gap)
      ev.segments.push(m.seg)
      ev.texts!.push(m.text)
      if (f.circle) {
        const c = angleMark(o, unitOf(sub(a.at, o)), unitOf(sub(b.at, o)), Math.min(24 + size, f.unit * 0.3), gap)
        ev.segments.push(c.seg)
        ev.texts!.push(c.text)
        usesCenter = true
      }
    }
    if (f.circle && on.equal) {
      ev.segments.push({ pts: [p, o], dash: 'dashed', thin: true })
      const half = 5 + size
      ev.segments.push(tick(p, a.at, half), tick(p, b.at, half))
      usesCenter = true
    }
    if (f.circle && on.chord) {
      ev.segments.push({ pts: [a.at, b.at], thin: true })
      const ab = sub(b.at, a.at)
      const r = Math.min(24 + size, Math.min(len2(ab), len2(pa)) * 0.35)
      if (r > 2) {
        const m = angleMark(a.at, unitOf(sub(p, a.at)), unitOf(ab), r, gap)
        ev.segments.push(m.seg)
        ev.texts!.push(m.text)
      }
    }
  }
  if (usesCenter && !hasCenter) {
    const first = out.get(laid[0].c.id)!
    first.dots!.push({ pos: o })
    first.texts!.push({ letter: 'O', pos: o, awayFrom: [o[0] - 0.6, o[1] - 0.8] })
  }
  return [...out.values()]
}
