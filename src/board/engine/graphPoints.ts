/**
 * Special points of the curves on a coordinate plane: maxima and minima, zeros and the points where
 * two curves cross. Worked out from the formulas (sampling, then bisection or golden-section search),
 * not from the drawn lines, so the coordinates are exact to the digits shown.
 */
import { parsePlot } from './formulaexpr'
import { plotCurve, plotImplicit } from './graph'
import type { MathFn } from '@penrill/math/mathexpr'
import type { GraphParams, PlotFn } from '@penrill/core/types'

export type PointKind = 'max' | 'min' | 'root' | 'cross'

/** A special point in axis units. */
export interface GraphPoint {
  x: number
  y: number
  kind: PointKind
  color: string
}

/** At most this many points of one kind on one curve (sin(1/x) would otherwise cover the plane). */
const MAX_PER_CURVE = 24
/** Point colour where curves of different colours meet. */
export const CROSS_COLOR = '#3b3d43'

/** One curve with the window it is drawn in. */
interface Curve {
  f: PlotFn
  fn: MathFn
  eq: boolean
  x0: number
  x1: number
  y0: number
  y1: number
}

function curvesOf(g: GraphParams): Curve[] {
  if (g.kind !== 'plane' || !g.fns?.length) return []
  const out: Curve[] = []
  for (const f of g.fns) {
    const r = parsePlot(f)
    if (!r.ok) continue
    const x0 = Math.max(g.xMin, f.from ?? -Infinity)
    const x1 = Math.min(g.xMax, f.to ?? Infinity)
    const y0 = Math.max(g.yMin, f.yFrom ?? -Infinity)
    const y1 = Math.min(g.yMax, f.yTo ?? Infinity)
    if (!(x0 < x1) || !(y0 < y1)) continue
    out.push({ f, fn: r.fn, eq: !!r.eq, x0, x1, y0, y1 })
  }
  return out
}

const finite = (v: number): number => (Number.isFinite(v) ? v : NaN)
const samplesFor = (x0: number, x1: number): number => Math.min(6000, Math.max(400, Math.ceil((x1 - x0) * 60)))

/** Golden-section search for the extremum of h on [a, b] (`sign` 1 = maximum, −1 = minimum). */
function golden(h: (x: number) => number, a: number, b: number, sign: number): number {
  const k = (Math.sqrt(5) - 1) / 2
  let c = b - k * (b - a)
  let d = a + k * (b - a)
  let fc = sign * h(c)
  let fd = sign * h(d)
  for (let i = 0; i < 80 && b - a > 1e-12 * (1 + Math.abs(a)); i++) {
    if (fc > fd || Number.isNaN(fd)) {
      b = d
      d = c
      fd = fc
      c = b - k * (b - a)
      fc = sign * h(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + k * (b - a)
      fd = sign * h(d)
    }
  }
  return (a + b) / 2
}

/**
 * Extrema of h on (x0, x1): where the sampled values turn from rising to falling (or back), refined
 * by golden-section search. A turn that is really a jump (the two sides of a pole, as for 1/x) is
 * left out: there the refined value runs far away from the sampled ones.
 */
export function findExtrema(h: (x: number) => number, x0: number, x1: number): { x: number; y: number; kind: 'max' | 'min' }[] {
  const n = samplesFor(x0, x1)
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    xs.push(x)
    ys.push(finite(h(x)))
  }
  const out: { x: number; y: number; kind: 'max' | 'min' }[] = []
  // Last direction (1 up, −1 down) and the sample where the values last changed.
  let dir = 0
  let from = 0
  for (let i = 1; i <= n; i++) {
    if (Number.isNaN(ys[i]) || Number.isNaN(ys[i - 1])) {
      dir = 0
      continue
    }
    const d = Math.sign(ys[i] - ys[i - 1])
    if (d === 0) continue
    if (dir !== 0 && d !== dir) {
      // Turned between sample `from` (where the run before ended) and i; search around it.
      const a = Math.max(0, from - 1)
      const kind = dir > 0 ? 'max' : 'min'
      const x = golden(h, xs[a], xs[i], dir)
      const y = finite(h(x))
      const spread = Math.max(Math.abs(ys[from] - ys[a]), Math.abs(ys[i] - ys[from]), 1e-9)
      if (!Number.isNaN(y) && Math.abs(y - ys[from]) <= spread * 4) {
        out.push({ x, y, kind })
        if (out.length > MAX_PER_CURVE * 2) return []
      }
    }
    dir = d
    from = i
  }
  return out
}

/**
 * Zeros of h on [x0, x1]: sign changes found by bisection (a sign change across a pole, as for 1/x
 * or tan x, is left out), and zeros where the curve only touches the axis (x² at 0).
 */
export function findRoots(h: (x: number) => number, x0: number, x1: number): number[] {
  const n = samplesFor(x0, x1)
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    xs.push(x)
    ys.push(finite(h(x)))
  }
  const out: number[] = []
  // A function that is 0 along a whole stretch (y = 0 itself) has no points to mark.
  let zeros = 0
  for (let i = 0; i <= n; i++) {
    if (ys[i] === 0) {
      zeros++
      if (zeros > 2) return []
    } else zeros = 0
  }
  for (let i = 0; i <= n; i++) {
    if (ys[i] === 0) out.push(xs[i])
    if (i === n) break
    const fa = ys[i]
    const fb = ys[i + 1]
    if (Number.isNaN(fa) || Number.isNaN(fb) || fa === 0 || fb === 0 || Math.sign(fa) === Math.sign(fb)) continue
    let a = xs[i]
    let b = xs[i + 1]
    let va = fa
    for (let k = 0; k < 80; k++) {
      const m = (a + b) / 2
      const vm = finite(h(m))
      if (Number.isNaN(vm)) break
      if (vm === 0) {
        a = b = m
        break
      }
      if (Math.sign(vm) === Math.sign(va)) {
        a = m
        va = vm
      } else b = m
    }
    const m = (a + b) / 2
    const vm = finite(h(m))
    if (!Number.isNaN(vm) && Math.abs(vm) <= Math.max(Math.abs(fa), Math.abs(fb))) out.push(m)
  }
  // Touching zeros: a minimum of |h| that reaches 0 without a change of sign.
  for (const e of findExtrema(h, x0, x1)) {
    if (Math.abs(e.y) < 1e-9 && !out.some((x) => Math.abs(x - e.x) < 1e-6)) out.push(e.x)
  }
  return out.sort((a, b) => a - b)
}

/** Where two polylines (axis units) cross. */
function polylineCrossings(a: [number, number][][], b: [number, number][][]): [number, number][] {
  const out: [number, number][] = []
  for (const p of a) {
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1]
      const [bx, by] = p[i]
      const lx = Math.min(ax, bx), hx = Math.max(ax, bx), ly = Math.min(ay, by), hy = Math.max(ay, by)
      for (const q of b) {
        for (let j = 1; j < q.length; j++) {
          const [cx, cy] = q[j - 1]
          const [dx, dy] = q[j]
          if (Math.max(cx, dx) < lx || Math.min(cx, dx) > hx || Math.max(cy, dy) < ly || Math.min(cy, dy) > hy) continue
          const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
          if (den === 0) continue
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den
          const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den
          if (t < 0 || t > 1 || u < 0 || u > 1) continue
          out.push([ax + t * (bx - ax), ay + t * (by - ay)])
          if (out.length > MAX_PER_CURVE * 4) return out
        }
      }
    }
  }
  return out
}

const inside = (c: Curve, x: number, y: number): boolean => x >= c.x0 - 1e-9 && x <= c.x1 + 1e-9 && y >= c.y0 - 1e-9 && y <= c.y1 + 1e-9

/** The curve as polylines, finely sampled, for crossings with an equation. */
function linesOf(c: Curve): [number, number][][] {
  const step = Math.max((c.x1 - c.x0) / 600, (c.y1 - c.y0) / 600, 1 / 96)
  return c.eq ? plotImplicit(c.fn, c.x0, c.x1, c.y0, c.y1, step) : plotCurve(c.fn, c.x0, c.x1, c.y0, c.y1, step / 2)
}

/** A number as shown next to a point: whole when it is (to rounding), else two decimals. */
export function roundCoord(v: number): number {
  const r = Math.round(v)
  if (Math.abs(v - r) < 1e-6) return r === 0 ? 0 : r
  const t = Math.round(v * 100) / 100
  return t === 0 ? 0 : t
}

/** The special points switched on for the plane, in axis units. Points at the same place are kept once. */
export function graphPoints(g: GraphParams): GraphPoint[] {
  const want = g.points
  if (!want || g.kind !== 'plane') return []
  const curves = curvesOf(g)
  const out: GraphPoint[] = []
  const add = (x: number, y: number, kind: PointKind, color: string): void => {
    const near = out.find((p) => Math.abs(p.x - x) < 1e-4 && Math.abs(p.y - y) < 1e-4)
    if (near) {
      if (near.color !== color) near.color = CROSS_COLOR
      return
    }
    out.push({ x, y, kind, color })
  }
  for (const c of curves) {
    if (want.extrema && !c.eq) {
      let k = 0
      for (const e of findExtrema((x) => c.fn(x), c.x0, c.x1)) {
        if (inside(c, e.x, e.y) && k++ < MAX_PER_CURVE) add(e.x, e.y, e.kind, c.f.color)
      }
    }
    if (want.roots && c.y0 <= 0 && c.y1 >= 0) {
      // An equation meets the axis where F(x, 0) = 0.
      const h = c.eq ? (x: number): number => c.fn(x, 0) : (x: number): number => c.fn(x)
      const xs = findRoots(h, c.x0, c.x1)
      if (xs.length <= MAX_PER_CURVE) for (const x of xs) add(x, 0, 'root', c.f.color)
    }
  }
  if (want.cross) {
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const a = curves[i]
        const b = curves[j]
        const color = a.f.color === b.f.color ? a.f.color : CROSS_COLOR
        const found: [number, number][] = []
        if (!a.eq && !b.eq) {
          const x0 = Math.max(a.x0, b.x0)
          const x1 = Math.min(a.x1, b.x1)
          if (!(x0 < x1)) continue
          for (const x of findRoots((x) => a.fn(x) - b.fn(x), x0, x1)) found.push([x, a.fn(x)])
        } else {
          found.push(...polylineCrossings(linesOf(a), linesOf(b)))
        }
        if (found.length > MAX_PER_CURVE) continue
        for (const [x, y] of found) if (inside(a, x, y) && inside(b, x, y)) add(x, y, 'cross', color)
      }
    }
  }
  return out
}

/** The label of a point: (2; −1,5) or (2, −1.5). */
export function pointLabel(x: number, y: number, comma: boolean): string {
  const num = (v: number): string => {
    const s = String(roundCoord(v)).replace('-', '−')
    return comma ? s.replace('.', ',') : s
  }
  return comma ? `(${num(x)}; ${num(y)})` : `(${num(x)}, ${num(y)})`
}
