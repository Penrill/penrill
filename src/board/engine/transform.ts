import { circleHitsPolyline, turnedBBox, turnPoint } from '@penrill/core/geometry'
import { isLinear } from '@penrill/core/shapes'
import { formulaBBox, formulaLocalBox } from './formulatype'
import { graphBBox } from './graph'
import { scaleRuns, textBBox, textBox } from './text'
import type { BBox, FormulaItem, ImageItem, Item, TextItem } from '@penrill/core/types'

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
  // Ink is drawn from its (already turned) points.
  if (item.type === 'stroke' || item.type === 'graph' || !item.rot) return null
  const b = localBox(item)
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, rot: item.rot }
}

/**
 * Whether a selection shows the ↻ handle: anything but locked items and coordinate lines and planes
 * (their axes stay level). A lone straight line has none: it turns by dragging its ends.
 */
export function canTurnSelection(items: readonly Item[]): boolean {
  if (!items.length || items.some((i) => i.locked || i.type === 'graph')) return false
  const one = items.length === 1 ? items[0] : null
  if (one?.type === 'stroke' && (one.shape ? isLinear(one.shape.kind) : one.geom === 'line' && one.points.length === 2)) return false
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

/** Returns a new item with the transform baked in (same id and z, so undo/redo swaps it cleanly). */
export function applyXform(item: Item, t: Xform): Item {
  if (item.type === 'stroke') {
    const points = item.points.map(([x, y, p]): [number, number, number] => [...xformPoint(t, x, y), p])
    const pad = item.size * t.s
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of points) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const { shape, rot: _rot, ...rest } = item
    // A shape's spec is an upright box: a turned shape keeps its look but becomes plain lines.
    const keepShape = shape && !t.r
    const rot = normRot((item.rot ?? 0) + (t.r ?? 0))
    return {
      ...rest,
      ...(rot !== undefined ? { rot } : {}),
      size: item.size * t.s,
      points,
      bbox: t.r ? { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad } : xformBBox(item.bbox, t),
      ...(keepShape ? { shape: { ...shape, ...pair('a', xformPoint(t, shape.ax, shape.ay)), ...pair('b', xformPoint(t, shape.bx, shape.by)) } } : {})
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

const pair = (k: 'a' | 'b', [x, y]: [number, number]) => (k === 'a' ? { ax: x, ay: y } : { bx: x, by: y })

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

/** Items enclosed by a lasso: strokes with most of their points inside, images whose centre is inside. */
export function itemsInLasso(items: readonly Item[], lasso: readonly (readonly [number, number])[]): Item[] {
  if (lasso.length < 3) return []
  const out: Item[] = []
  for (const it of items) {
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
