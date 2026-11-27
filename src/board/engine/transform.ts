import { circleHitsPolyline, turnedBBox, turnPoint } from '@penrill/core/geometry'
import { evaluateShape, shapeBBox } from '@penrill/core/shapeEval'
import { effectiveQuat, quatFromAxisAngle, quatMul, quatNormalize } from '@penrill/core/shapeEval3d'
import { boxOfVertices, is3D, isLinear, isVertexShape, shapeVertices } from '@penrill/core/shapes'
import { formulaBBox, formulaLocalBox } from './formulatype'
import { graphBBox } from './graph'
import { scaleRuns, textBBox, textBox } from './text'
import type { BBox, FormulaItem, ImageItem, Item, ShapeGeometry, ShapeSpec, TextItem } from '@penrill/core/types'

/**
 * Uniform scale `s` and turn `r` (radians, clockwise on screen) about anchor (ax, ay), then
 * translate by (dx, dy): p' = a + R(r)·(p - a)·s + d
 */
export interface Xform {
  s: number
  ax: number
  ay: number
  dx: number
  dy: number
  r?: number
}

export const IDENTITY: Xform = { s: 1, ax: 0, ay: 0, dx: 0, dy: 0 }

export function isIdentity(t: Xform): boolean {
  return t.s === 1 && t.dx === 0 && t.dy === 0 && !t.r
}

/** Where point (x, y) goes under `t`. */
export function xformPoint(t: Xform, x: number, y: number): [number, number] {
  let px = (x - t.ax) * t.s
  let py = (y - t.ay) * t.s
  if (t.r) [px, py] = turnPoint(px, py, 0, 0, t.r)
  return [t.ax + px + t.dx, t.ay + py + t.dy]
}

/** Bounds of box `b` after `t` (when it turns: bounds of the turned box). */
export function xformBBox(b: BBox, t: Xform): BBox {
  const [x0, y0] = xformPoint(t, b.minX, b.minY)
  const [x1, y1] = xformPoint(t, b.maxX, b.maxY)
  const box = { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) }
  if (!t.r) return box
  // Turned: the box's centre went to the middle of (x0, y0)–(x1, y1); its size is scaled, then turned.
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const hw = ((b.maxX - b.minX) * t.s) / 2
  const hh = ((b.maxY - b.minY) * t.s) / 2
  return turnedBBox({ minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh }, t.r)
}

type Boxed = ImageItem | TextItem | FormulaItem

/** The own (unturned) box of an image, text or formula. */
export function localBox(item: Boxed): BBox {
  if (item.type === 'text') return textBox(item)
  if (item.type === 'formula') return formulaLocalBox(item)
  return { minX: item.x, minY: item.y, maxX: item.x + item.w, maxY: item.y + item.h }
}

/** A turned image, text or formula: the centre it turns about and the angle; null when not turned. */
export function itemTurn(item: Item): { cx: number; cy: number; rot: number } | null {
  // Ink and shapes bake their turn into their own geometry.
  if (item.type === 'stroke' || item.type === 'shape' || item.type === 'graph' || !item.rot) return null
  const b = localBox(item)
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, rot: item.rot }
}

/**
 * Whether a selection shows the ↻ handle: anything but locked items and coordinate lines and planes
 * (their axes stay level). A lone straight line turns by its ends; a lone 3D solid uses its 3D orbit handle.
 */
export function canTurnSelection(items: readonly Item[]): boolean {
  if (!items.length || items.some((i) => i.locked || i.type === 'graph')) return false
  const one = items.length === 1 ? items[0] : null
  if (one?.type === 'stroke' && (one.shape ? isLinear(one.shape.kind) : one.geom === 'line' && one.points.length === 2)) return false
  if (one?.type === 'shape' && (isLinear(one.geo.kind) || is3D(one.geo.kind))) return false
  return true
}

/** Angle in (-π, π], 0 kept as absent. */
const normRot = (r: number): number | undefined => {
  let a = r % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a <= -Math.PI) a += Math.PI * 2
  return Math.abs(a) < 1e-9 ? undefined : a
}

/**
 * A boxed item moved so that its own box's centre follows `t`, its content scaled by `t.s` and its
 * turn increased by `t.r`. (x, y) stays the top-left of the unturned box, which scales with the item.
 */
function placeBoxed<T extends Boxed>(item: T, t: Xform, scaled: T): T {
  const b = localBox(item)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const [ncx, ncy] = xformPoint(t, cx, cy)
  const rot = normRot((item.rot ?? 0) + (t.r ?? 0))
  const { rot: _old, ...rest } = scaled
  return { ...(rest as T), x: ncx - (cx - item.x) * t.s, y: ncy - (cy - item.y) * t.s, ...(rot !== undefined ? { rot } : {}) }
}

/** Transform a shape spec under `t`, preserving editability across moves, scales and rotations. */
function xformShape(shape: ShapeSpec, t: Xform): ShapeSpec {
  if (isLinear(shape.kind)) {
    const [ax, ay] = xformPoint(t, shape.ax, shape.ay)
    const [bx, by] = xformPoint(t, shape.bx, shape.by)
    return { ...shape, ax, ay, bx, by }
  }
  if (isVertexShape(shape.kind) && (shape.vertices || t.r)) {
    const verts = shapeVertices(shape).map(([x, y]): [number, number] => xformPoint(t, x, y))
    const { rot: _r, ...rest } = shape
    return { ...rest, ...boxOfVertices(verts), vertices: verts }
  }
  if (!t.r) {
    const [ax, ay] = xformPoint(t, shape.ax, shape.ay)
    const [bx, by] = xformPoint(t, shape.bx, shape.by)
    return { ...shape, ax, ay, bx, by }
  }
  const cx = (shape.ax + shape.bx) / 2
  const cy = (shape.ay + shape.by) / 2
  const [ncx, ncy] = xformPoint(t, cx, cy)
  const hw = ((shape.bx - shape.ax) / 2) * t.s
  const hh = ((shape.by - shape.ay) / 2) * t.s
  const rot = normRot((shape.rot ?? 0) + t.r)
  const { rot: _old, ...rest } = shape
  return { ...rest, ax: ncx - hw, ay: ncy - hh, bx: ncx + hw, by: ncy + hh, ...(rot !== undefined ? { rot } : {}) }
}

/** Transform a first-class ShapeGeometry under `t`, preserving editability across moves, scales and rotations. */
function xformShapeGeo(geo: ShapeGeometry, t: Xform): ShapeGeometry {
  if (isLinear(geo.kind)) {
    const [ax, ay] = xformPoint(t, geo.ax, geo.ay)
    const [bx, by] = xformPoint(t, geo.bx, geo.by)
    return { ...geo, ax, ay, bx, by }
  }
  if (geo.vertices) {
    const verts = geo.vertices.map(([x, y]): [number, number] => xformPoint(t, x, y))
    const { rot: _r, ...rest } = geo
    return { ...rest, ...boxOfVertices(verts), vertices: verts }
  }
  if (is3D(geo.kind)) {
    const cx = (geo.ax + geo.bx) / 2
    const cy = (geo.ay + geo.by) / 2
    const [ncx, ncy] = xformPoint(t, cx, cy)
    const hw = ((geo.bx - geo.ax) / 2) * t.s
    const hh = ((geo.by - geo.ay) / 2) * t.s
    // A solid turned with a selection spins about the axis facing the viewer. On screen y points
    // down and the view's y points up, so a clockwise screen turn is a negative turn about z.
    const rot3 = t.r ? quatNormalize(quatMul(quatFromAxisAngle([0, 0, 1], -t.r), effectiveQuat(geo))) : null
    return {
      ...geo,
      ax: ncx - hw,
      ay: ncy - hh,
      bx: ncx + hw,
      by: ncy + hh,
      ...(rot3 ? { rot3 } : {}),
      ...(geo.dim3 ? { dim3: [geo.dim3[0] * t.s, geo.dim3[1] * t.s, geo.dim3[2] * t.s] } : {})
    }
  }
  const cx = (geo.ax + geo.bx) / 2
  const cy = (geo.ay + geo.by) / 2
  const [ncx, ncy] = xformPoint(t, cx, cy)
  const hw = ((geo.bx - geo.ax) / 2) * t.s
  const hh = ((geo.by - geo.ay) / 2) * t.s
  const rot = normRot((geo.rot ?? 0) + (t.r ?? 0))
  const { rot: _old, ...rest } = geo
  return { ...rest, ax: ncx - hw, ay: ncy - hh, bx: ncx + hw, by: ncy + hh, ...(rot !== undefined ? { rot } : {}) }
}

/** Returns a new item with the transform baked in (same id and z, so undo/redo swaps it cleanly). */
export function applyXform(item: Item, t: Xform): Item {
  if (item.type === 'shape') {
    const { rot: _rot, ...rest } = item
    const rot = is3D(item.geo.kind) ? undefined : normRot((item.rot ?? 0) + (t.r ?? 0))
    const next = {
      ...rest,
      size: item.size * t.s,
      geo: xformShapeGeo(item.geo, t),
      ...(rot !== undefined ? { rot } : {})
    }
    return { ...next, bbox: shapeBBox(next) }
  }
  if (item.type === 'stroke') {
    const points = item.points.map(([x, y, p]): [number, number, number] => [...xformPoint(t, x, y), p])
    const pad = (item.geom ? 3 : 1) * item.size * t.s
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of points) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const { shape, rot: _rot, ...rest } = item
    const rot = normRot((item.rot ?? 0) + (t.r ?? 0))
    return {
      ...rest,
      ...(rot !== undefined ? { rot } : {}),
      size: item.size * t.s,
      points,
      bbox: t.r ? { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad } : xformBBox(item.bbox, t),
      ...(shape ? { shape: xformShape(shape, t) } : {})
    }
  }
  if (item.type === 'graph') {
    // Axes stay level: a coordinate plane only moves along with a turned selection.
    const [ox, oy] = xformPoint(t, item.ox, item.oy)
    const g = { ...item, ox, oy, unit: item.unit * t.s }
    return { ...g, bbox: graphBBox(g) }
  }
  if (item.type === 'text') {
    const n = placeBoxed(item, t, { ...item, size: item.size * t.s, ...(item.runs ? { runs: scaleRuns(item.runs, t.s) } : {}) })
    return { ...n, bbox: textBBox(n) }
  }
  if (item.type === 'formula') {
    const n = placeBoxed(item, t, { ...item, size: item.size * t.s })
    return { ...n, bbox: formulaBBox(n) }
  }
  const n = placeBoxed(item, t, { ...item, w: item.w * t.s, h: item.h * t.s })
  return { ...n, bbox: turnedBBox({ minX: n.x, minY: n.y, maxX: n.x + n.w, maxY: n.y + n.h }, n.rot) }
}

export function unionBBox(items: readonly Item[]): BBox | null {
  if (items.length === 0) return null
  const b = { ...items[0].bbox }
  for (const it of items) {
    b.minX = Math.min(b.minX, it.bbox.minX)
    b.minY = Math.min(b.minY, it.bbox.minY)
    b.maxX = Math.max(b.maxX, it.bbox.maxX)
    b.maxY = Math.max(b.maxY, it.bbox.maxY)
  }
  return b
}

export function pointInPolygon(x: number, y: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Items enclosed by a lasso: strokes and shapes with most of their path inside, images whose centre is inside. */
export function itemsInLasso(items: readonly Item[], lasso: readonly (readonly [number, number])[]): Item[] {
  if (lasso.length < 3) return []
  const out: Item[] = []
  for (const it of items) {
    if (it.type === 'shape') {
      const ev = evaluateShape(it)
      const pts = ev.hitPaths.flat()
      if (!pts.length) continue
      const step = Math.max(1, Math.floor(pts.length / 40))
      let total = 0
      let inside = 0
      for (let i = 0; i < pts.length; i += step) {
        total++
        if (pointInPolygon(pts[i][0], pts[i][1], lasso)) inside++
      }
      if (inside / total >= 0.5 || pointInPolygon(ev.center[0], ev.center[1], lasso)) out.push(it)
      continue
    }
    if (it.type !== 'stroke') {
      const b = it.bbox
      if (pointInPolygon((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, lasso)) out.push(it)
      continue
    }
    const step = Math.max(1, Math.floor(it.points.length / 40))
    let total = 0
    let inside = 0
    for (let i = 0; i < it.points.length; i += step) {
      total++
      if (pointInPolygon(it.points[i][0], it.points[i][1], lasso)) inside++
    }
    if (inside / total >= 0.5) out.push(it)
  }
  return out
}

/** Topmost item under a world point. `tol` is extra hit tolerance in world units. */
export function hitTest(items: readonly Item[], x: number, y: number, tol: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (x < it.bbox.minX - tol || x > it.bbox.maxX + tol || y < it.bbox.minY - tol || y > it.bbox.maxY + tol) continue
    if (it.type === 'shape') {
      const r = it.size / 2 + tol
      const ev = evaluateShape(it)
      if (ev.hitPaths.some((path) => circleHitsPolyline(x, y, r, path))) return it
      // A filled shape is picked up by its inside too.
      if (it.fill && ev.area && pointInPolygon(x, y, ev.area)) return it
      continue
    }
    if (it.type !== 'stroke') {
      // A turned box: test the point in the box's own frame, not against its larger bounds.
      const turn = itemTurn(it)
      if (!turn) return it
      const [lx, ly] = turnPoint(x, y, turn.cx, turn.cy, -turn.rot)
      const b = localBox(it as Boxed)
      if (lx >= b.minX - tol && lx <= b.maxX + tol && ly >= b.minY - tol && ly <= b.maxY + tol) return it
      continue
    }
    if (circleHitsPolyline(x, y, it.size / 2 + tol, it.points)) return it
  }
  return null
}
