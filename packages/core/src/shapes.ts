import { turnPoint } from './geometry'
import type { LineDash, Point, ShapeSpec, Vec2 } from './types'
import { triangleCircles } from './triangleCircles'
import { triangleAltitudes, triangleBisectors, triangleMedians } from './triangleConstructions'

export const SHAPES_2D = [
  'line',
  'arrow',
  'doubleArrow',
  'rectangle',
  'ellipse',
  'triangle',
  'rightTriangle',
  'rhombus',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'polygon',
  'star'
] as const
export const SHAPES_3D = ['cube', 'prism', 'pyramid', 'obliquePyramid', 'cylinder', 'cone', 'sphere'] as const
export const SHAPES = [...SHAPES_2D, ...SHAPES_3D] as const
export type ShapeKind = (typeof SHAPES)[number]

/** One polyline of a shape; 3D solids and triangle constructions draw auxiliary edges dashed or dotted. */
export interface ShapePart {
  points: Point[]
  dash?: LineDash
}

const LINEAR: ReadonlySet<ShapeKind> = new Set(['line', 'arrow', 'doubleArrow'])

/** Limits for polygon sides, star points and a solid's base (number of sides). */
export const MIN_BASE = 3
export const MAX_BASE = 24

/** Shapes with a configurable side/point count and their quick presets and default. */
export const SHAPE_BASES: Partial<Record<ShapeKind, { options: number[]; def: number }>> = {
  pyramid: { options: [3, 4, 5, 6], def: 4 },
  obliquePyramid: { options: [3, 4, 5, 6], def: 4 },
  prism: { options: [3, 4, 5, 6], def: 3 },
  polygon: { options: [3, 4, 5, 6], def: 5 },
  star: { options: [4, 5, 6, 8], def: 5 }
}

export const isShapeKind = (k: unknown): k is ShapeKind => typeof k === 'string' && (SHAPES as readonly string[]).includes(k)
export const isTriangle = (k: ShapeKind): boolean => k === 'triangle' || k === 'rightTriangle'
export const isVertexShape = (k: ShapeKind): boolean => isTriangle(k) || k === 'polygon'

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const clampBase = (n: number | undefined, def: number): number =>
  n !== undefined && Number.isFinite(n) ? Math.max(MIN_BASE, Math.min(MAX_BASE, Math.round(n))) : def

/**
 * The box a drag from a to b really produces: with `keep` (Shift) lines snap to 45 deg and boxes become
 * squares. Stored in the shape spec so the shape can be re-generated later.
 */
export function shapeBox(kind: ShapeKind, ax: number, ay: number, bx: number, by: number, keep: boolean): [number, number, number, number] {
  if (!keep) return [ax, ay, bx, by]
  if (LINEAR.has(kind)) {
    const [ex, ey] = snapAngle(ax, ay, bx, by, 45)
    return [ax, ay, ex, ey]
  }
  const s = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
  return [ax, ay, ax + Math.sign(bx - ax || 1) * s, ay + Math.sign(by - ay || 1) * s]
}

/** Bounding box of a list of 2D vertices. */
export function boxOfVertices(verts: readonly Vec2[]): { ax: number; ay: number; bx: number; by: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of verts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { ax: minX, ay: minY, bx: maxX, by: maxY }
}

/** Exact world vertices for vertex-driven shapes (`triangle`, `rightTriangle`, `polygon`). */
export function shapeVertices(spec: ShapeSpec): Vec2[] {
  if (isTriangle(spec.kind)) {
    if (spec.vertices?.length === 3) return spec.vertices.map(([x, y]) => [x, y])
    const x0 = Math.min(spec.ax, spec.bx), x1 = Math.max(spec.ax, spec.bx)
    const y0 = Math.min(spec.ay, spec.by), y1 = Math.max(spec.ay, spec.by)
    const cx = (x0 + x1) / 2
    const base: Vec2[] = spec.kind === 'rightTriangle' ? [[x0, y0], [x0, y1], [x1, y1]] : [[cx, y0], [x1, y1], [x0, y1]]
    if (spec.rot) {
      const cy = (y0 + y1) / 2
      return base.map(([x, y]) => turnPoint(x, y, cx, cy, spec.rot!))
    }
    return base
  }
  if (spec.kind === 'polygon') {
    if (spec.vertices && spec.vertices.length >= MIN_BASE) return spec.vertices.map(([x, y]) => [x, y])
    const x0 = Math.min(spec.ax, spec.bx), x1 = Math.max(spec.ax, spec.bx)
    const y0 = Math.min(spec.ay, spec.by), y1 = Math.max(spec.ay, spec.by)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
    const n = clampBase(spec.base, SHAPE_BASES.polygon!.def)
    const rot = -Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0)
    const verts: Vec2[] = []
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2
      const pt: Vec2 = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
      verts.push(spec.rot ? turnPoint(pt[0], pt[1], cx, cy, spec.rot) : pt)
    }
    return verts
  }
  return []
}

const POLYGONAL_2D: ReadonlySet<ShapeKind> = new Set([
  'rectangle',
  'triangle',
  'rightTriangle',
  'rhombus',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'polygon'
])

/** Ordered world-space corner vertices for any polygonal 2D shape (empty for curves, stars, lines and 3D solids). */
export function shapePolygonVertices(spec: ShapeSpec): Vec2[] {
  if (!POLYGONAL_2D.has(spec.kind)) return []
  if (isVertexShape(spec.kind)) return shapeVertices(spec)
  const pts = shapeOutline(spec.kind, spec.ax, spec.ay, spec.bx, spec.by, false, 0, spec)
  // Closed outlines repeat their first point at the end.
  const open = pts.length > 1 ? pts.slice(0, -1) : pts
  const cx = (spec.ax + spec.bx) / 2
  const cy = (spec.ay + spec.by) / 2
  return open.map(([x, y]): Vec2 => (spec.rot ? turnPoint(x, y, cx, cy, spec.rot) : [x, y]))
}

/** Ordered world-space edges for any polygonal 2D shape or straight linear shape. */
export function shapeEdges(spec: ShapeSpec): { index: number; a: Vec2; b: Vec2 }[] {
  if (LINEAR.has(spec.kind)) {
    return [{ index: 0, a: [spec.ax, spec.ay], b: [spec.bx, spec.by] }]
  }
  const verts = shapePolygonVertices(spec)
  if (verts.length < 2) return []
  return verts.map((a, i) => ({ index: i, a, b: verts[(i + 1) % verts.length] }))
}

const P = (x: number, y: number): Point => [x, y, 0.5]

/** All parts of a stored shape. */
export function specParts(spec: ShapeSpec, size: number): ShapePart[] {
  if (isTriangle(spec.kind)) {
    const verts = shapeVertices(spec)
    const pts = [...verts.map(([x, y]) => P(x, y)), P(verts[0][0], verts[0][1])]
    const parts: ShapePart[] = [{ points: pts }]
    const [a, b, c] = pts
    if (spec.incircle || spec.circumcircle) {
      const circles = triangleCircles(a, b, c)
      if (circles) {
        for (const key of ['incircle', 'circumcircle'] as const) {
          if (!spec[key]) continue
          const { x, y, radius } = circles[key]
          parts.push({ points: ellipseArc(x, y, radius, radius, 0, Math.PI * 2, 128) })
        }
      }
    }
    if (spec.altitudeAt?.length) parts.push(...triangleAltitudes(a, b, c, spec.altitudeAt, size))
    if (spec.medianAt?.length) parts.push(...triangleMedians(a, b, c, spec.medianAt))
    if (spec.bisectorAt?.length) parts.push(...triangleBisectors(a, b, c, spec.bisectorAt))
    return parts
  }
  if (spec.kind === 'polygon') {
    const verts = shapeVertices(spec)
    return [{ points: [...verts.map(([x, y]) => P(x, y)), P(verts[0][0], verts[0][1])] }]
  }
  const parts = shapePartsFromSpec(spec, size)
  if (spec.rot && !LINEAR.has(spec.kind)) {
    const cx = (spec.ax + spec.bx) / 2
    const cy = (spec.ay + spec.by) / 2
    const r = spec.rot
    return parts.map((part) => ({
      ...part,
      points: part.points.map(([x, y, pr]): Point => [...turnPoint(x, y, cx, cy, r), pr])
    }))
  }
  return parts
}

const sameVec2 = (a: Vec2 | undefined, b: Vec2 | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a[0] === b[0] && a[1] === b[1])

const sameVertices = (a: readonly Vec2[] | undefined, b: readonly Vec2[] | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.length === b.length && a.every((v, i) => v[0] === b[i][0] && v[1] === b[i][1]))

const sameIndexList = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean => {
  const al = a?.length ?? 0
  const bl = b?.length ?? 0
  if (al !== bl) return false
  for (let i = 0; i < al; i++) if (a![i] !== b![i]) return false
  return true
}

export function sameSpec(a: ShapeSpec | undefined, b: ShapeSpec | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.ax === b.ax && a.ay === b.ay && a.bx === b.bx && a.by === b.by
    && a.rot === b.rot
    && a.base === b.base
    && !!a.incircle === !!b.incircle && !!a.circumcircle === !!b.circumcircle
    && sameIndexList(a.altitudeAt, b.altitudeAt)
    && sameIndexList(a.medianAt, b.medianAt)
    && sameIndexList(a.bisectorAt, b.bisectorAt)
    && sameIndexList(a.angleAt, b.angleAt)
    && sameIndexList(a.lengthAt, b.lengthAt)
    && a.skew === b.skew && a.topLeft === b.topLeft && a.topRight === b.topRight
    && a.innerRatio === b.innerRatio && a.depth === b.depth
    && sameVec2(a.apex, b.apex)
    && sameVertices(a.vertices, b.vertices)
}

/** Snap an angle to multiples of 45 deg when it's within `tolDeg` of one (Shift lines). */
export function snapAngle(ax: number, ay: number, bx: number, by: number, tolDeg = 6): [number, number] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len === 0) return [bx, by]
  const ang = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snapped = Math.round(ang / step) * step
  if (Math.abs(ang - snapped) > (tolDeg * Math.PI) / 180) return [bx, by]
  return [ax + Math.cos(snapped) * len, ay + Math.sin(snapped) * len]
}

function arrowHead(ax: number, ay: number, bx: number, by: number, size: number): Point[] {
  const len = Math.hypot(bx - ax, by - ay) || 1
  const head = Math.min(len * 0.4, Math.max(12, size * 4.5))
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const wing = (sign: number): Point => P(bx - ux * head - uy * head * 0.55 * sign, by - uy * head + ux * head * 0.55 * sign)
  return [wing(1), P(bx, by), wing(-1)]
}

function regular(cx: number, cy: number, rx: number, ry: number, n: number, rot = -Math.PI / 2): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = rot + (i / n) * Math.PI * 2
    pts.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return pts
}

function starOutline(cx: number, cy: number, rx: number, ry: number, n: number, innerRatio: number): Point[] {
  const pts: Point[] = []
  const total = n * 2
  for (let i = 0; i <= total; i++) {
    const a = -Math.PI / 2 + (i / total) * Math.PI * 2
    const r = i % 2 === 0 ? 1 : innerRatio
    pts.push(P(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r))
  }
  return pts
}

/**
 * Outline of a shape dragged from (ax, ay) to (bx, by), as one continuous polyline (closed shapes
 * repeat their first point). With `keep` (Shift) boxes become squares and lines snap to 45 deg.
 */
export function shapeOutline(
  kind: ShapeKind,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  keep: boolean,
  size: number,
  opts?: Pick<ShapeSpec, 'base' | 'skew' | 'topLeft' | 'topRight' | 'innerRatio'>
): Point[] {
  if (LINEAR.has(kind)) {
    if (keep) [bx, by] = snapAngle(ax, ay, bx, by, 45)
    if (kind === 'line') return [P(ax, ay), P(bx, by)]
    // Arrows: shaft, then the head wings, retracing the tip (one stroke, invisible overlap).
    const head = arrowHead(ax, ay, bx, by, size)
    if (kind === 'arrow') return [P(ax, ay), P(bx, by), head[0], P(bx, by), head[2]]
    const tail = arrowHead(bx, by, ax, ay, size)
    return [tail[0], P(ax, ay), tail[2], P(ax, ay), P(bx, by), head[0], P(bx, by), head[2]]
  }
  if (keep) {
    const s = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
    bx = ax + Math.sign(bx - ax || 1) * s
    by = ay + Math.sign(by - ay || 1) * s
  }
  const x0 = Math.min(ax, bx)
  const y0 = Math.min(ay, by)
  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  switch (kind) {
    case 'rectangle':
      return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)]
    case 'ellipse':
      return regular(cx, cy, w / 2, h / 2, 96, 0)
    case 'triangle':
      return [P(cx, y0), P(x1, y1), P(x0, y1), P(cx, y0)]
    case 'rightTriangle':
      return [P(x0, y0), P(x0, y1), P(x1, y1), P(x0, y0)]
    case 'rhombus':
      return [P(cx, y0), P(x1, cy), P(cx, y1), P(x0, cy), P(cx, y0)]
    case 'parallelogram': {
      const skew = clamp(opts?.skew ?? 0.25, -0.75, 0.75)
      if (skew >= 0) {
        const o = w * skew
        return [P(x0 + o, y0), P(x1, y0), P(x1 - o, y1), P(x0, y1), P(x0 + o, y0)]
      }
      const o = w * -skew
      return [P(x0, y0), P(x1 - o, y0), P(x1, y1), P(x0 + o, y1), P(x0, y0)]
    }
    case 'trapezoid': {
      let tl = clamp(opts?.topLeft ?? 0.22, 0, 0.95)
      let tr = clamp(opts?.topRight ?? 0.22, 0, 0.95)
      if (tl + tr > 0.96) {
        const k = 0.96 / (tl + tr)
        tl *= k
        tr *= k
      }
      return [P(x0 + w * tl, y0), P(x1 - w * tr, y0), P(x1, y1), P(x0, y1), P(x0 + w * tl, y0)]
    }
    case 'pentagon':
      return regular(cx, cy, w / 2, h / 2, 5)
    case 'hexagon':
      return regular(cx, cy, w / 2, h / 2, 6, 0)
    case 'polygon': {
      const n = clampBase(opts?.base, SHAPE_BASES.polygon!.def)
      const rot = -Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0)
      return regular(cx, cy, w / 2, h / 2, n, rot)
    }
    case 'star': {
      const n = clampBase(opts?.base, SHAPE_BASES.star!.def)
      const inner = clamp(opts?.innerRatio ?? 0.4, 0.15, 0.9)
      return starOutline(cx, cy, w / 2, h / 2, n, inner)
    }
    default:
      return [P(ax, ay), P(bx, by)]
  }
}

/** Shapes for which a plain click (no drag) inserts a default-size shape. */
export const DEFAULT_SHAPE_SIZE = 144
export const isLinear = (k: ShapeKind): boolean => LINEAR.has(k)

export const is3D = (k: ShapeKind): boolean => (SHAPES_3D as readonly string[]).includes(k)

/** Points along part of an ellipse (angles in radians, canvas orientation: y grows downwards). */
function ellipseArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push(P(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry))
  }
  return pts
}

/**
 * All polylines of a shape dragged from (ax, ay) to (bx, by). Flat shapes are one part; solids are
 * several parts, with the edges you can't see drawn dashed (like in a school geometry book).
 */
export function shapeParts(
  kind: ShapeKind,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  keep: boolean,
  size: number,
  base?: number
): ShapePart[] {
  const [sx0, sy0, sx1, sy1] = shapeBox(kind, ax, ay, bx, by, keep)
  return shapePartsFromSpec({ kind, ax: sx0, ay: sy0, bx: sx1, by: sy1, ...(base !== undefined ? { base } : {}) }, size)
}

function shapePartsFromSpec(spec: ShapeSpec, size: number): ShapePart[] {
  const { kind, ax, ay, bx, by, base, apex, depth } = spec
  if (!is3D(kind)) return [{ points: shapeOutline(kind, ax, ay, bx, by, false, size, spec) }]
  const x0 = Math.min(ax, bx)
  const y0 = Math.min(ay, by)
  const x1 = Math.max(ax, bx)
  const y1 = Math.max(ay, by)
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const hidden = (...pts: Point[]): ShapePart => ({ points: pts, dash: 'dashed' })
  const solid = (...pts: Point[]): ShapePart => ({ points: pts })

  switch (kind) {
    case 'cube': {
      const d = Math.min(w, h) * clamp(depth ?? 0.3, 0.08, 0.48)
      const F = [P(x0, y0 + d), P(x1 - d, y0 + d), P(x1 - d, y1), P(x0, y1)]
      const B = F.map(([x, y]) => P(x + d, y - d))
      return [
        solid(F[0], F[1], F[2], F[3], F[0]),
        solid(F[0], B[0], B[1], B[2], F[2]),
        solid(F[1], B[1]),
        hidden(B[0], B[3], B[2]),
        hidden(B[3], F[3])
      ]
    }
    case 'prism':
      return polygonSolid('prism', x0, y0, x1, y1, base ?? SHAPE_BASES.prism!.def, apex, depth)
    case 'pyramid':
      return polygonSolid('pyramid', x0, y0, x1, y1, base ?? SHAPE_BASES.pyramid!.def, apex, depth)
    case 'obliquePyramid':
      return polygonSolid('obliquePyramid', x0, y0, x1, y1, base ?? SHAPE_BASES.obliquePyramid!.def, apex, depth)
    case 'cylinder': {
      const ry = Math.min(h * clamp(depth ?? 0.14, 0.05, 0.45), w * 0.42)
      const rx = w / 2
      const dx = apex ? (apex[0] - 0.5) * w : 0
      const dy = apex ? apex[1] * h : 0
      const tcx = cx + dx
      const ty = y0 + ry + dy
      const byy = y1 - ry
      const vx = -dx
      const vy = byy - ty
      const t = (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) || rx === 0 ? 0 : Math.atan2(-ry * vx, rx * vy)
      const p1x = Math.cos(t) * rx, p1y = Math.sin(t) * ry
      const p2x = Math.cos(t + Math.PI) * rx, p2y = Math.sin(t + Math.PI) * ry
      // When the top face is dragged below the bottom face, flip which ellipse is fully visible.
      if (ty > byy) {
        return [
          solid(...ellipseArc(cx, byy, rx, ry, 0, Math.PI * 2, 72)),
          solid(P(cx + p1x, byy + p1y), P(tcx + p1x, ty + p1y)),
          solid(P(cx + p2x, byy + p2y), P(tcx + p2x, ty + p2y)),
          solid(...ellipseArc(tcx, ty, rx, ry, t, t + Math.PI)),
          hidden(...ellipseArc(tcx, ty, rx, ry, t + Math.PI, t + Math.PI * 2))
        ]
      }
      return [
        solid(...ellipseArc(tcx, ty, rx, ry, 0, Math.PI * 2, 72)),
        solid(P(tcx + p2x, ty + p2y), P(cx + p2x, byy + p2y)),
        solid(P(tcx + p1x, ty + p1y), P(cx + p1x, byy + p1y)),
        solid(...ellipseArc(cx, byy, rx, ry, t, t + Math.PI)),
        hidden(...ellipseArc(cx, byy, rx, ry, t + Math.PI, t + Math.PI * 2))
      ]
    }
    case 'cone': {
      const ry = Math.min(h * clamp(depth ?? 0.14, 0.05, 0.45), w * 0.42)
      const rx = w / 2
      const byy = y1 - ry
      const axp = apex ? x0 + apex[0] * w : cx
      const ayp = apex ? y0 + apex[1] * h : y0
      const u = rx > 0 ? (axp - cx) / rx : 0
      const v = ry > 0 ? (ayp - byy) / ry : 0
      const dist = Math.hypot(u, v)
      if (!apex && depth === undefined) {
        return [
          solid(P(x0, byy), P(cx, y0), P(x1, byy)),
          solid(...ellipseArc(cx, byy, rx, ry, 0, Math.PI)),
          hidden(...ellipseArc(cx, byy, rx, ry, Math.PI, Math.PI * 2))
        ]
      }
      if (dist <= 1.001) {
        return [solid(...ellipseArc(cx, byy, rx, ry, 0, Math.PI * 2, 72))]
      }
      const theta = Math.atan2(v, u)
      const alpha = Math.acos(1 / dist)
      const t1 = theta + alpha
      const t2 = theta - alpha
      const T1 = P(cx + Math.cos(t1) * rx, byy + Math.sin(t1) * ry)
      const T2 = P(cx + Math.cos(t2) * rx, byy + Math.sin(t2) * ry)
      if (v > 0) {
        // Inverted cone (apex below base): base is on top, fully visible.
        return [
          solid(T2, P(axp, ayp), T1),
          solid(...ellipseArc(cx, byy, rx, ry, 0, Math.PI * 2, 72))
        ]
      }
      return [
        solid(T2, P(axp, ayp), T1),
        solid(...ellipseArc(cx, byy, rx, ry, t1, t2 + Math.PI * 2)),
        hidden(...ellipseArc(cx, byy, rx, ry, t2, t1))
      ]
    }
    case 'sphere': {
      const cy = (y0 + y1) / 2
      const rx = w / 2
      const ry = h / 2
      const ery = ry * clamp(depth ?? 0.28, 0.08, 0.48)
      return [
        solid(...ellipseArc(cx, cy, rx, ry, 0, Math.PI * 2, 96)),
        solid(...ellipseArc(cx, cy, rx, ery, 0, Math.PI)),
        hidden(...ellipseArc(cx, cy, rx, ery, Math.PI, Math.PI * 2))
      ]
    }
    default:
      return [{ points: shapeOutline(kind, ax, ay, bx, by, false, size, spec) }]
  }
}

/**
 * Prism or pyramid over a regular n-gon base, seen slightly from above. Pyramids and oblique prisms
 * classify side faces by their projected winding so hidden edges follow the apex or top face cleanly.
 */
function polygonSolid(
  kind: 'prism' | 'pyramid' | 'obliquePyramid',
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  apexParam?: Vec2,
  depthParam?: number
): ShapePart[] {
  n = clampBase(n, SHAPE_BASES[kind]!.def)
  const w = x1 - x0
  const h = y1 - y0
  const ry = Math.min(h * clamp(depthParam ?? 0.16, 0.05, 0.45), w * 0.42)
  // Unit polygon, turned a little so no edge is seen exactly edge-on.
  const off = Math.PI / 2 - 0.17
  const unit = Array.from({ length: n }, (_, i) => {
    const a = off + (i / n) * Math.PI * 2
    return [Math.cos(a), Math.sin(a)] as const
  })
  const minX = Math.min(...unit.map((u) => u[0]))
  const maxX = Math.max(...unit.map((u) => u[0]))
  const minY = Math.min(...unit.map((u) => u[1]))
  const maxY = Math.max(...unit.map((u) => u[1]))
  const mapX = (u: number): number => x0 + ((u - minX) / (maxX - minX)) * w
  const mapY = (u: number, cy: number): number => cy - ry + ((u - minY) / (maxY - minY)) * 2 * ry
  const bottomCy = y1 - ry
  const bottom = unit.map(([ux, uy]) => P(mapX(ux), mapY(uy, bottomCy)))
  const solid: ShapePart[] = []
  const hidden: ShapePart[] = []
  const edge = (a: Point, b: Point, visible: boolean): void => {
    ;(visible ? solid : hidden).push(visible ? { points: [a, b] } : { points: [a, b], dash: 'dashed' })
  }

  if (kind !== 'prism') {
    const apex = apexParam
      ? P(x0 + apexParam[0] * w, y0 + apexParam[1] * h)
      : P(kind === 'obliquePyramid' ? x0 + w * 0.9 : mapX(0), y0)
    const inverted = apex[1] > bottomCy
    const front = unit.map((_, i) => {
      const a = bottom[i], b = bottom[(i + 1) % n]
      const wind = (b[0] - a[0]) * (apex[1] - a[1]) - (b[1] - a[1]) * (apex[0] - a[0])
      return inverted ? wind < 0 : wind > 0
    })
    const vertVisible = (i: number): boolean => front[i] || front[(i - 1 + n) % n]
    for (let i = 0; i < n; i++) edge(bottom[i], bottom[(i + 1) % n], inverted ? true : front[i])
    for (let i = 0; i < n; i++) edge(apex, bottom[i], vertVisible(i))
    return [...solid, ...hidden]
  }

  const dx = apexParam ? (apexParam[0] - 0.5) * w : 0
  const dy = apexParam ? apexParam[1] * h : 0
  const topCy = y0 + ry + dy
  const top = unit.map(([ux, uy]) => P(mapX(ux) + dx, mapY(uy, topCy)))
  const inverted = topCy > bottomCy
  const front = unit.map((_, i) => {
    const a = bottom[i], b = bottom[(i + 1) % n]
    const t0 = top[i]
    const wind = (b[0] - a[0]) * (t0[1] - a[1]) - (b[1] - a[1]) * (t0[0] - a[0])
    return inverted ? wind < 0 : wind > 0
  })
  const vertVisible = (i: number): boolean => front[i] || front[(i - 1 + n) % n]
  if (inverted) {
    solid.push({ points: [...bottom, bottom[0]] })
    for (let i = 0; i < n; i++) edge(top[i], top[(i + 1) % n], front[i])
  } else {
    solid.push({ points: [...top, top[0]] })
    for (let i = 0; i < n; i++) edge(bottom[i], bottom[(i + 1) % n], front[i])
  }
  for (let i = 0; i < n; i++) edge(top[i], bottom[i], vertVisible(i))
  // Solid parts first: the first part's pattern is the shape's own line style.
  return [...solid, ...hidden]
}
