import { turnPoint } from '@penrill/core/geometry'
import { evaluateShape } from '@penrill/core/shapeEval'
import { effectiveDim3, effectiveOrbit, effectiveSlant3, project3d, unprojectDelta3d } from '@penrill/core/shapeEval3d'
import {
  boxOfVertices,
  is3D,
  isLinear,
  isTriangle,
  isVertexShape,
  MAX_BASE,
  MIN_BASE,
  SHAPE_BASES,
  shapeVertices,
  type ShapeKind
} from '@penrill/core/shapes'
import type { ShapeGeometry, ShapeItem, ShapeSpec, Vec2, Vec3 } from '@penrill/core/types'
import { withShapeUpdate } from './elements'
import { snapPolygonVertex, snapScalar, snapTriangleVertex, type HandleDragOptions, type SnapGuide } from './snapping'
import { remapIndicesOnInsert, remapIndicesOnRemove } from './targets'

export type ShapeHandleKind = 'vertex' | 'control' | 'addVertex' | 'orbit'

export type ShapeHandleHint =
  | 'shape.hint.vertex'
  | 'shape.hint.polygonVertex'
  | 'shape.hint.addVertex'
  | 'shape.hint.skew'
  | 'shape.hint.trapezoid'
  | 'shape.hint.inner'
  | 'shape.hint.apex'
  | 'shape.hint.depth'
  | 'shape.hint.orbit'
  | 'shape.hint.dim3'

export interface ShapeHandle {
  /** Stable identifier: 'v0', 'v:0', 'add:1', 'orbit', 'dimX', 'dimY', 'dimZ', 'radius', 'apex', etc. */
  id: string
  kind: ShapeHandleKind
  x: number
  y: number
  hint: ShapeHandleHint
  cursor: 'crosshair' | 'grab' | 'ew-resize' | 'ns-resize' | 'pointer'
  index?: number
  /** Vertex id on ShapeItem when tapping opens the Vertex popover. */
  vertexId?: string
  /** True when dragging this handle actually changes geometry (false = click-only vertex for popover). */
  draggable?: boolean
}

export interface HandleDragResult {
  spec: ShapeSpec
  label: string | null
  guides: SnapGuide[]
  snapped: boolean
}

export interface ShapeItemDragStart {
  startWorld: Vec2
  startGeo: ShapeGeometry
}

export interface ShapeItemDragResult {
  item: ShapeItem
  label: string | null
  guides: SnapGuide[]
  snapped: boolean
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const DEG = Math.PI / 180

function boundsOf(spec: Pick<ShapeSpec, 'ax' | 'ay' | 'bx' | 'by'>): {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  h: number
  cx: number
  cy: number
} {
  const x0 = Math.min(spec.ax, spec.bx)
  const x1 = Math.max(spec.ax, spec.bx)
  const y0 = Math.min(spec.ay, spec.by)
  const y1 = Math.max(spec.ay, spec.by)
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

function toWorld(spec: Pick<ShapeSpec, 'ax' | 'ay' | 'bx' | 'by' | 'rot'>, lx: number, ly: number): Vec2 {
  if (!spec.rot) return [lx, ly]
  const { cx, cy } = boundsOf(spec)
  return turnPoint(lx, ly, cx, cy, spec.rot)
}

function toLocal(spec: Pick<ShapeSpec, 'ax' | 'ay' | 'bx' | 'by' | 'rot'>, wx: number, wy: number): Vec2 {
  if (!spec.rot) return [wx, wy]
  const { cx, cy } = boundsOf(spec)
  return turnPoint(wx, wy, cx, cy, -spec.rot)
}

// ===================================================================== First-class ShapeItem handles

/** All interactive on-canvas handles for any 2D or 3D ShapeItem, in world coordinates. */
export function shapeItemHandles(item: ShapeItem): ShapeHandle[] {
  const geo = item.geo
  const ev = evaluateShape(item)
  const out: ShapeHandle[] = []

  if (!ev.is3D) {
    // Every 2D vertex is visible and interactive!
    for (let i = 0; i < ev.vertices.length; i++) {
      const v = ev.vertices[i]
      const isFreePoly = geo.kind === 'polygon'
      out.push({
        id: v.id,
        kind: v.role === 'inner' ? 'control' : 'vertex',
        x: v.pos[0],
        y: v.pos[1],
        hint: isFreePoly ? 'shape.hint.polygonVertex' : v.role === 'inner' ? 'shape.hint.inner' : 'shape.hint.vertex',
        cursor: 'crosshair',
        index: i,
        vertexId: v.id,
        draggable: true
      })
    }
    // Add-vertex '+' handles along edges of a polygon.
    if (geo.kind === 'polygon' && ev.vertices.length < MAX_BASE) {
      for (let i = 0; i < ev.edges.length; i++) {
        const e = ev.edges[i]
        out.push({
          id: `add:${i}`,
          kind: 'addVertex',
          x: (e.a[0] + e.b[0]) / 2,
          y: (e.a[1] + e.b[1]) / 2,
          hint: 'shape.hint.addVertex',
          cursor: 'pointer',
          index: i,
          draggable: false
        })
      }
    }
    return out
  }

  // 3D solid handles:
  // 1. Clickable (and for apex/topCenter, draggable) 3D vertices.
  for (let i = 0; i < ev.vertices.length; i++) {
    const v = ev.vertices[i]
    const isApexLike = v.id === 'apex' || v.id === 'topCenter'
    // Keep cylinder/cone rim vertices subtle; expose corners, apex, topCenter, and center.
    if (v.role === 'cardinal' && (geo.kind === 'cylinder' || geo.kind === 'cone' || geo.kind === 'sphere')) continue
    out.push({
      id: v.id,
      kind: 'vertex',
      x: v.pos[0],
      y: v.pos[1],
      hint: isApexLike ? 'shape.hint.apex' : 'shape.hint.vertex',
      cursor: isApexLike ? 'crosshair' : 'pointer',
      index: i,
      vertexId: v.id,
      draggable: isApexLike
    })
  }

  // 2. 3D dimension control handles (amber diamonds).
  const [w, h, d] = effectiveDim3(geo)
  const [yaw, pitch] = effectiveOrbit(geo)
  const center = ev.center
  const p3 = (p: Vec3): Vec2 => project3d(p, center, yaw, pitch).pos

  if (geo.kind === 'cube') {
    const px = p3([w / 2, 0, 0])
    const py = p3([0, h / 2, 0])
    const pz = p3([0, 0, d / 2])
    out.push(
      { id: 'dimX', kind: 'control', x: px[0], y: px[1], hint: 'shape.hint.dim3', cursor: 'grab', draggable: true },
      { id: 'dimY', kind: 'control', x: py[0], y: py[1], hint: 'shape.hint.dim3', cursor: 'grab', draggable: true },
      { id: 'dimZ', kind: 'control', x: pz[0], y: pz[1], hint: 'shape.hint.dim3', cursor: 'grab', draggable: true }
    )
  } else if (geo.kind === 'sphere') {
    const r = Math.min(w, h) / 2
    out.push({
      id: 'radius',
      kind: 'control',
      x: center[0] + r,
      y: center[1],
      hint: 'shape.hint.dim3',
      cursor: 'ew-resize',
      draggable: true
    })
  } else {
    // Prism, pyramid, obliquePyramid, cylinder, cone: base radius handle + height/slant on top/apex.
    const pr = p3([w / 2, -h / 2, 0])
    out.push({
      id: 'radius',
      kind: 'control',
      x: pr[0],
      y: pr[1],
      hint: 'shape.hint.dim3',
      cursor: 'grab',
      draggable: true
    })
    if (geo.kind === 'prism') {
      const [sx, sz] = effectiveSlant3(geo)
      const pt = p3([sx * (w / 2), h / 2, sz * (d / 2)])
      out.push({
        id: 'topCenter',
        kind: 'control',
        x: pt[0],
        y: pt[1],
        hint: 'shape.hint.apex',
        cursor: 'crosshair',
        draggable: true
      })
    }
  }

  // 3. Universal 3D Orbit handle positioned cleanly at top-right outside the solid bounds.
  out.push({
    id: 'orbit',
    kind: 'orbit',
    x: ev.bounds.maxX + 20,
    y: ev.bounds.minY - 6,
    hint: 'shape.hint.orbit',
    cursor: 'grab',
    draggable: true
  })

  return out
}

/**
 * Update a ShapeItem by dragging handle `handleId` to `worldPt` (preserving 2D geometric constraints
 * until unlocked, or orbiting / resizing real 3D solids).
 */
export function dragShapeItemHandle(
  item: ShapeItem,
  handleId: string,
  worldPt: Vec2,
  opts: HandleDragOptions,
  dragStart?: ShapeItemDragStart
): ShapeItemDragResult {
  const geo = item.geo
  const guides: SnapGuide[] = []

  // --- Free vertex shapes (triangle, rightTriangle, unlocked polygon) ---
  if (handleId.startsWith('v') && (isTriangle(geo.kind) || (geo.kind === 'polygon' && !!geo.vertices))) {
    const idx = Number(handleId.slice(1))
    const ev = evaluateShape(item)
    const verts = ev.vertices.map((v): Vec2 => [v.pos[0], v.pos[1]])
    if (Number.isInteger(idx) && idx >= 0 && idx < verts.length) {
      const snap = isTriangle(geo.kind)
        ? snapTriangleVertex(idx, verts, worldPt, opts)
        : snapPolygonVertex(idx, verts, worldPt, opts)
      const nextVerts = verts.map((v, i): Vec2 => (i === idx ? snap.point : v))
      const nextGeo: ShapeGeometry = {
        ...geo,
        ...boxOfVertices(nextVerts),
        vertices: nextVerts,
        ...(geo.kind === 'polygon' ? { sides: nextVerts.length } : {})
      }
      delete nextGeo.rot
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: snap.label, guides: snap.guides, snapped: snap.snapped }
    }
  }

  // --- Linear shapes (line, arrow, doubleArrow) ---
  if (isLinear(geo.kind) && (handleId === 'v0' || handleId === 'v1')) {
    const fixed: Vec2 = handleId === 'v0' ? [geo.bx, geo.by] : [geo.ax, geo.ay]
    let pt: Vec2 = [worldPt[0], worldPt[1]]
    let snapped = false
    if (opts.ctrl) {
      pt = [Math.round(pt[0] / opts.gridStep[0]) * opts.gridStep[0], Math.round(pt[1] / opts.gridStep[1]) * opts.gridStep[1]]
      snapped = true
    } else if (opts.shift) {
      const dx = pt[0] - fixed[0], dy = pt[1] - fixed[1]
      const len = Math.hypot(dx, dy)
      if (len > 1e-4) {
        const step = Math.PI / 12
        const a = Math.round(Math.atan2(dy, dx) / step) * step
        pt = [fixed[0] + Math.cos(a) * len, fixed[1] + Math.sin(a) * len]
        snapped = true
      }
    } else if (!opts.alt) {
      if (Math.abs(pt[0] - fixed[0]) <= opts.snapTol) { pt = [fixed[0], pt[1]]; snapped = true }
      else if (Math.abs(pt[1] - fixed[1]) <= opts.snapTol) { pt = [pt[0], fixed[1]]; snapped = true }
    }
    const nextGeo: ShapeGeometry = handleId === 'v0'
      ? { ...geo, ax: pt[0], ay: pt[1] }
      : { ...geo, bx: pt[0], by: pt[1] }
    const deg = Math.round((Math.atan2(-(pt[1] - fixed[1]), pt[0] - fixed[0]) * 180) / Math.PI)
    return { item: withShapeUpdate(item, { geo: nextGeo }), label: `${deg}°`, guides, snapped }
  }

  // --- Constrained 2D shapes ---
  if (!is3D(geo.kind)) {
    const baseGeo = dragStart?.startGeo ?? geo
    const { x0, y0, x1, y1, w, h, cx, cy } = boundsOf(baseGeo)
    const [lx, ly] = toLocal(baseGeo, worldPt[0], worldPt[1])
    const minHalf = 10

    if (geo.kind === 'rhombus' && handleId.startsWith('v')) {
      const idx = Number(handleId.slice(1))
      let halfW = Math.max(minHalf, w / 2)
      let halfH = Math.max(minHalf, h / 2)
      let snapped = false
      const isVert = idx === 0 || idx === 2
      if (isVert) {
        let raw = Math.max(minHalf, Math.abs(ly - cy))
        if (opts.ctrl) { raw = Math.max(minHalf, Math.round(raw / opts.gridStep[1]) * opts.gridStep[1]); snapped = true }
        else if (!opts.alt) {
          const targets = [halfW, halfW * Math.sqrt(3), halfW / Math.sqrt(3)]
          const s = snapScalar(raw, targets, opts.snapTol)
          raw = Math.max(minHalf, s.value)
          snapped = s.snapped
        }
        halfH = raw
      } else {
        let raw = Math.max(minHalf, Math.abs(lx - cx))
        if (opts.ctrl) { raw = Math.max(minHalf, Math.round(raw / opts.gridStep[0]) * opts.gridStep[0]); snapped = true }
        else if (!opts.alt) {
          const targets = [halfH, halfH * Math.sqrt(3), halfH / Math.sqrt(3)]
          const s = snapScalar(raw, targets, opts.snapTol)
          raw = Math.max(minHalf, s.value)
          snapped = s.snapped
        }
        halfW = raw
      }
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx - halfW, ay: cy - halfH, bx: cx + halfW, by: cy + halfH }
      const cornerDeg = isVert
        ? Math.round((2 * Math.atan2(halfW, halfH) * 180) / Math.PI)
        : Math.round((2 * Math.atan2(halfH, halfW) * 180) / Math.PI)
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: `${cornerDeg}°`, guides, snapped }
    }

    if (geo.kind === 'rectangle' && handleId.startsWith('v')) {
      const idx = Number(handleId.slice(1))
      // Anchor the diagonally opposite corner in local frame so it stays pinned on screen.
      const corners: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      const oppLocal = corners[(idx + 2) % 4]
      const oppWorld = toWorld(baseGeo, oppLocal[0], oppLocal[1])
      let dx = lx - oppLocal[0]
      let dy = ly - oppLocal[1]
      const sx = dx >= 0 ? 1 : -1
      const sy = dy >= 0 ? 1 : -1
      let nw = Math.max(minHalf * 2, Math.abs(dx))
      let nh = Math.max(minHalf * 2, Math.abs(dy))
      let snapped = false
      if (opts.shift) {
        const s = Math.max(nw, nh)
        nw = s; nh = s; snapped = true
      } else if (!opts.alt && Math.abs(nw - nh) <= opts.snapTol) {
        const s = (nw + nh) / 2
        nw = s; nh = s; snapped = true
      }
      dx = sx * nw
      dy = sy * nh
      // New centre in world coordinates keeps oppWorld fixed!
      const rot = baseGeo.rot ?? 0
      const halfRot = rot ? turnPoint(dx / 2, dy / 2, 0, 0, rot) : [dx / 2, dy / 2]
      const ncx = oppWorld[0] + halfRot[0]
      const ncy = oppWorld[1] + halfRot[1]
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: ncx - nw / 2, ay: ncy - nh / 2, bx: ncx + nw / 2, by: ncy + nh / 2 }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: Math.abs(nw - nh) < 1 ? '1:1' : null, guides, snapped }
    }

    if (geo.kind === 'parallelogram' && handleId.startsWith('v')) {
      const idx = Number(handleId.slice(1))
      const curSkew = clamp(baseGeo.skew ?? 0.25, -0.75, 0.75)
      if (idx === 0 || idx === 1) {
        // Top corners adjust skew & height smoothly while bottom edge stays anchored.
        const ny0 = Math.min(y1 - minHalf * 2, ly)
        const baseTopX = idx === 0 ? x0 : x1
        let rawSkew: number
        if (idx === 0) rawSkew = clamp((lx - x0) / Math.max(1, w), -0.75, 0.75)
        else rawSkew = clamp((lx - x1) / Math.max(1, w) + Math.max(0, curSkew), -0.75, 0.75)
        void baseTopX
        let skew = rawSkew
        let snapped = false
        if (!opts.alt) {
          const s = snapScalar(skew, [-0.25, 0, 0.25], opts.snapTol / Math.max(1, w))
          skew = s.value
          snapped = s.snapped
          if (snapped && skew === 0) guides.push({ kind: 'line', points: [toWorld(baseGeo, x0, ny0), toWorld(baseGeo, x0, y1)] })
        }
        const rot = baseGeo.rot ?? 0
        const dyCenter = (ny0 - y0) / 2
        const shiftW = rot ? turnPoint(0, dyCenter, 0, 0, rot) : [0, dyCenter]
        const nh = y1 - ny0
        const ncx = cx + shiftW[0], ncy = cy + shiftW[1]
        const nextGeo: ShapeGeometry = { ...baseGeo, ax: ncx - w / 2, ay: ncy - nh / 2, bx: ncx + w / 2, by: ncy + nh / 2, skew }
        const deg = Math.round((Math.atan2(nh, Math.abs(skew) * w) * 180) / Math.PI)
        return { item: withShapeUpdate(item, { geo: nextGeo }), label: `${deg}°`, guides, snapped }
      }
      // Bottom corners resize width & height from top-opposite anchor.
      const nx0 = idx === 3 ? Math.min(x1 - minHalf * 2, lx) : x0
      const nx1 = idx === 2 ? Math.max(x0 + minHalf * 2, lx) : x1
      const ny1 = Math.max(y0 + minHalf * 2, ly)
      const nw = nx1 - nx0, nh = ny1 - y0
      const dcx = (nx0 + nx1) / 2 - cx, dcy = (y0 + ny1) / 2 - cy
      const rot = baseGeo.rot ?? 0
      const shiftW = rot ? turnPoint(dcx, dcy, 0, 0, rot) : [dcx, dcy]
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx + shiftW[0] - nw / 2, ay: cy + shiftW[1] - nh / 2, bx: cx + shiftW[0] + nw / 2, by: cy + shiftW[1] + nh / 2 }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
    }

    if (geo.kind === 'trapezoid' && handleId.startsWith('v')) {
      const idx = Number(handleId.slice(1))
      const curTl = clamp(baseGeo.topLeft ?? 0.22, 0, 0.95)
      const curTr = clamp(baseGeo.topRight ?? 0.22, 0, 0.95)
      if (idx === 0 || idx === 1) {
        const ny0 = Math.min(y1 - minHalf * 2, ly)
        const tol = opts.snapTol / Math.max(1, w)
        let tl = curTl, tr = curTr, snapped = false
        if (idx === 0) {
          const raw = clamp((lx - x0) / Math.max(1, w), 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tr))
          const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, opts.shift ? [0, 0.22] : [0, 0.22, tr], tol)
          tl = clamp(s.value, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tr))
          if (opts.shift) tr = tl
          snapped = s.snapped
          if (snapped && tl === 0) guides.push({ kind: 'line', points: [toWorld(baseGeo, x0, ny0), toWorld(baseGeo, x0, y1)] })
        } else {
          const raw = clamp((x1 - lx) / Math.max(1, w), 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tl))
          const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, opts.shift ? [0, 0.22] : [0, 0.22, tl], tol)
          tr = clamp(s.value, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tl))
          if (opts.shift) tl = tr
          snapped = s.snapped
          if (snapped && tr === 0) guides.push({ kind: 'line', points: [toWorld(baseGeo, x1, ny0), toWorld(baseGeo, x1, y1)] })
        }
        const nh = y1 - ny0
        const dyCenter = (ny0 - y0) / 2
        const rot = baseGeo.rot ?? 0
        const shiftW = rot ? turnPoint(0, dyCenter, 0, 0, rot) : [0, dyCenter]
        const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx + shiftW[0] - w / 2, ay: cy + shiftW[1] - nh / 2, bx: cx + shiftW[0] + w / 2, by: cy + shiftW[1] + nh / 2, topLeft: tl, topRight: tr }
        return { item: withShapeUpdate(item, { geo: nextGeo }), label: `${Math.round((1 - tl - tr) * 100)}%`, guides, snapped }
      }
      // Bottom corners resize bottom base width & height while keeping bases parallel.
      const nx0 = idx === 3 ? Math.min(x1 - minHalf * 2, lx) : x0
      const nx1 = idx === 2 ? Math.max(x0 + minHalf * 2, lx) : x1
      const ny1 = Math.max(y0 + minHalf * 2, ly)
      const nw = nx1 - nx0, nh = ny1 - y0
      const dcx = (nx0 + nx1) / 2 - cx, dcy = (y0 + ny1) / 2 - cy
      const rot = baseGeo.rot ?? 0
      const shiftW = rot ? turnPoint(dcx, dcy, 0, 0, rot) : [dcx, dcy]
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx + shiftW[0] - nw / 2, ay: cy + shiftW[1] - nh / 2, bx: cx + shiftW[0] + nw / 2, by: cy + shiftW[1] + nh / 2 }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
    }

    if (geo.kind === 'star' && handleId.startsWith('v')) {
      const idx = Number(handleId.slice(1))
      const rx = Math.max(1, w / 2), ry = Math.max(1, h / 2)
      if (idx % 2 === 1) {
        // Inner valley adjusts innerRatio.
        const n = baseGeo.sides ?? SHAPE_BASES.star!.def
        const a = -Math.PI / 2 + (idx / (n * 2)) * Math.PI * 2
        const raw = ((lx - cx) / rx) * Math.cos(a) + ((ly - cy) / ry) * Math.sin(a)
        let inner = clamp(raw, 0.15, 0.9)
        let snapped = false
        if (!opts.alt) {
          const s = snapScalar(inner, [0.382, 0.4, 0.5], opts.snapTol / Math.max(1, Math.min(rx, ry)))
          inner = s.value
          snapped = s.snapped
        }
        return { item: withShapeUpdate(item, { geo: { ...baseGeo, innerRatio: inner } }), label: `${Math.round(inner * 100)}%`, guides, snapped }
      }
      // Outer tip scales star uniformly from centre.
      const r = Math.max(minHalf, Math.hypot(lx - cx, ly - cy))
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx - r, ay: cy - r, bx: cx + r, by: cy + r }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
    }

    if (geo.kind === 'pentagon' || geo.kind === 'hexagon' || (geo.kind === 'polygon' && !geo.vertices)) {
      const r = Math.max(minHalf, Math.hypot(lx - cx, ly - cy))
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx - r, ay: cy - r, bx: cx + r, by: cy + r }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
    }

    if (geo.kind === 'ellipse') {
      if (handleId === 'center') {
        const dx = worldPt[0] - cx, dy = worldPt[1] - cy
        const nextGeo: ShapeGeometry = { ...baseGeo, ax: baseGeo.ax + dx, ay: baseGeo.ay + dy, bx: baseGeo.bx + dx, by: baseGeo.by + dy }
        return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
      }
      const idx = Number(handleId.slice(1))
      let rx = Math.max(minHalf, w / 2)
      let ry = Math.max(minHalf, h / 2)
      let snapped = false
      if (idx === 0 || idx === 2) {
        let raw = Math.max(minHalf, Math.abs(ly - cy))
        if (opts.shift || (!opts.alt && Math.abs(raw - rx) <= opts.snapTol)) { raw = rx; snapped = true }
        ry = raw
      } else {
        let raw = Math.max(minHalf, Math.abs(lx - cx))
        if (opts.shift || (!opts.alt && Math.abs(raw - ry) <= opts.snapTol)) { raw = ry; snapped = true }
        rx = raw
      }
      const nextGeo: ShapeGeometry = { ...baseGeo, ax: cx - rx, ay: cy - ry, bx: cx + rx, by: cy + ry }
      return { item: withShapeUpdate(item, { geo: nextGeo }), label: Math.abs(rx - ry) < 1 ? '1:1' : null, guides, snapped }
    }

    return { item, label: null, guides, snapped: false }
  }

  // --- Real 3D solid handles ---
  const baseGeo = dragStart?.startGeo ?? geo
  const startWorld = dragStart?.startWorld ?? worldPt
  const center: Vec2 = [(baseGeo.ax + baseGeo.bx) / 2, (baseGeo.ay + baseGeo.by) / 2]
  const [bw, bh, bd] = effectiveDim3(baseGeo)
  const [startYaw, startPitch] = effectiveOrbit(baseGeo)
  const [startSx, startSz] = effectiveSlant3(baseGeo)

  if (handleId === 'orbit') {
    // Convert world drag delta to zoom-independent screen pixels via snapTol (~10 / zoom).
    const zoomEst = 10 / Math.max(1e-3, opts.snapTol)
    const dxPx = (worldPt[0] - startWorld[0]) * zoomEst
    const dyPx = (worldPt[1] - startWorld[1]) * zoomEst
    let yaw = startYaw + dxPx * 0.011
    let pitch = clamp(startPitch + dyPx * 0.011, -1.35, 1.35)
    // Normalize yaw into [-pi, pi].
    while (yaw > Math.PI) yaw -= Math.PI * 2
    while (yaw < -Math.PI) yaw += Math.PI * 2
    let snapped = false
    if (!opts.alt) {
      const yawTargets = [-180, -135, -90, -45, -30, 0, 30, 45, 90, 135, 180].map((d) => d * DEG)
      const pitchTargets = [-45, -30, -20, 0, 20, 30, 45].map((d) => d * DEG)
      const sy = snapScalar(yaw, yawTargets, 4.5 * DEG)
      const sp = snapScalar(pitch, pitchTargets, 4.5 * DEG)
      yaw = sy.value
      pitch = sp.value
      snapped = sy.snapped || sp.snapped
    }
    const nextGeo: ShapeGeometry = { ...baseGeo, dim3: [bw, bh, bd], orbit: [yaw, pitch] }
    const label = `${Math.round(yaw / DEG)}° · ${Math.round(pitch / DEG)}°`
    return { item: withShapeUpdate(item, { geo: nextGeo }), label, guides, snapped }
  }

  if (geo.kind === 'cube' && (handleId === 'dimX' || handleId === 'dimY' || handleId === 'dimZ')) {
    const axis3: Vec3 = handleId === 'dimX' ? [1, 0, 0] : handleId === 'dimY' ? [0, 1, 0] : [0, 0, 1]
    const p0 = project3d([0, 0, 0], center, startYaw, startPitch).pos
    const p1 = project3d(axis3, center, startYaw, startPitch).pos
    const ax2x = p1[0] - p0[0], ax2y = p1[1] - p0[1]
    const axLen = Math.hypot(ax2x, ax2y)
    const dirX = axLen > 1e-3 ? ax2x / axLen : 1
    const dirY = axLen > 1e-3 ? ax2y / axLen : 0
    const delta = ((worldPt[0] - startWorld[0]) * dirX + (worldPt[1] - startWorld[1]) * dirY) * 2
    let [nw, nh, nd] = [bw, bh, bd]
    let snapped = false
    if (handleId === 'dimX') {
      let raw = Math.max(20, bw + delta)
      if (!opts.alt) {
        const s = snapScalar(raw, [bh, bd], opts.snapTol * 1.5)
        raw = Math.max(20, s.value); snapped = s.snapped
      }
      nw = raw
    } else if (handleId === 'dimY') {
      let raw = Math.max(20, bh + delta)
      if (!opts.alt) {
        const s = snapScalar(raw, [bw, bd], opts.snapTol * 1.5)
        raw = Math.max(20, s.value); snapped = s.snapped
      }
      nh = raw
    } else {
      let raw = Math.max(20, bd + delta)
      if (!opts.alt) {
        const s = snapScalar(raw, [bw, bh], opts.snapTol * 1.5)
        raw = Math.max(20, s.value); snapped = s.snapped
      }
      nd = raw
    }
    const nextGeo: ShapeGeometry = { ...baseGeo, dim3: [nw, nh, nd], orbit: [startYaw, startPitch] }
    const isCube = Math.abs(nw - nh) < 1 && Math.abs(nh - nd) < 1
    return { item: withShapeUpdate(item, { geo: nextGeo }), label: isCube ? 'a=b=c' : null, guides, snapped }
  }

  if (handleId === 'radius') {
    const baseC = geo.kind === 'sphere' ? center : project3d([0, -bh / 2, 0], center, startYaw, startPitch).pos
    const r = Math.max(14, Math.hypot(worldPt[0] - baseC[0], worldPt[1] - baseC[1]))
    const nextDim: [number, number, number] = geo.kind === 'sphere' ? [r * 2, r * 2, r * 2] : [r * 2, bh, r * 2]
    const nextGeo: ShapeGeometry = {
      ...baseGeo,
      ...(geo.kind === 'sphere' ? { ax: center[0] - r, ay: center[1] - r, bx: center[0] + r, by: center[1] + r } : {}),
      dim3: nextDim,
      orbit: [startYaw, startPitch]
    }
    return { item: withShapeUpdate(item, { geo: nextGeo }), label: null, guides, snapped: false }
  }

  if (handleId === 'apex' || handleId === 'topCenter') {
    // Drag apex / top-face centre: vertical screen delta adjusts height `h`, horizontal adjusts 3D slant `[sx, sz]`.
    const dx = worldPt[0] - startWorld[0]
    const dy = worldPt[1] - startWorld[1]
    const d3 = unprojectDelta3d(dx, dy, startYaw, startPitch)
    const rx = Math.max(12, bw / 2)
    const rz = Math.max(12, bd / 2)
    let sx = clamp(startSx + d3[0] / rx, -2.2, 2.2)
    let sz = clamp(startSz + d3[2] / rz, -2.2, 2.2)
    let nh = Math.max(20, bh + d3[1])
    let snapped = false
    if (!opts.alt) {
      const s0 = snapScalar(sx, [0], opts.snapTol / rx)
      const s1 = snapScalar(sz, [0], opts.snapTol / rz)
      sx = s0.value
      sz = s1.value
      snapped = s0.snapped || s1.snapped
      if (sx === 0 && sz === 0) {
        const pBot = project3d([0, -nh / 2, 0], center, startYaw, startPitch).pos
        const pTop = project3d([0, nh / 2, 0], center, startYaw, startPitch).pos
        guides.push({ kind: 'line', points: [pBot, pTop] })
      }
    }
    const nextGeo: ShapeGeometry = { ...baseGeo, dim3: [bw, nh, bd], orbit: [startYaw, startPitch], slant3: [sx, sz] }
    const slantDist = Math.hypot(sx * rx, sz * rz)
    const slantDeg = Math.round((Math.atan2(slantDist, nh) * 180) / Math.PI)
    return { item: withShapeUpdate(item, { geo: nextGeo }), label: `${slantDeg}°`, guides, snapped }
  }

  return { item, label: null, guides, snapped: false }
}

/** Insert a new vertex on edge `edgeIndex` of a free polygon ShapeItem, remapping labels/angles/lengths/constructions. */
export function insertShapeItemVertex(
  item: ShapeItem,
  edgeIndex: number,
  worldPt: Vec2
): { item: ShapeItem; vertexId: string } | null {
  if (item.geo.kind !== 'polygon') return null
  const ev = evaluateShape(item)
  if (ev.vertices.length >= MAX_BASE || edgeIndex < 0 || edgeIndex >= ev.vertices.length) return null
  const insertAt = edgeIndex + 1
  const verts = ev.vertices.map((v): Vec2 => [v.pos[0], v.pos[1]])
  const nextVerts: Vec2[] = [...verts.slice(0, insertAt), [worldPt[0], worldPt[1]], ...verts.slice(insertAt)]
  const shiftId = (prefix: 'v' | 'e', id: string): string => {
    if (!id.startsWith(prefix)) return id
    const idx = Number(id.slice(1))
    return Number.isInteger(idx) && idx >= insertAt ? `${prefix}${idx + 1}` : id
  }
  const labels: Record<string, string> = {}
  for (const [k, v] of Object.entries(item.labels ?? {})) labels[shiftId('v', k)] = v
  const angles = item.angles?.map((id) => shiftId('v', id))
  const lengths = item.lengths?.map((id) => shiftId('e', id))
  const nextGeo: ShapeGeometry = { ...item.geo, ...boxOfVertices(nextVerts), vertices: nextVerts, sides: nextVerts.length }
  delete nextGeo.rot
  return {
    item: withShapeUpdate(item, { geo: nextGeo, labels, angles, lengths }),
    vertexId: `v${insertAt}`
  }
}

/** Remove vertex `vertexId` from a free polygon ShapeItem (keeping at least 3 vertices). */
export function removeShapeItemVertex(item: ShapeItem, vertexId: string): ShapeItem | null {
  if (item.geo.kind !== 'polygon' || !vertexId.startsWith('v')) return null
  const removeAt = Number(vertexId.slice(1))
  const ev = evaluateShape(item)
  if (ev.vertices.length <= MIN_BASE || !Number.isInteger(removeAt) || removeAt < 0 || removeAt >= ev.vertices.length) return null
  const nextVerts = ev.vertices.filter((_, i) => i !== removeAt).map((v): Vec2 => [v.pos[0], v.pos[1]])
  const remap = (prefix: 'v' | 'e', id: string): string | null => {
    if (!id.startsWith(prefix)) return id
    const idx = Number(id.slice(1))
    if (!Number.isInteger(idx)) return id
    if (idx === removeAt) return null
    return idx > removeAt ? `${prefix}${idx - 1}` : id
  }
  const labels: Record<string, string> = {}
  for (const [k, v] of Object.entries(item.labels ?? {})) {
    const nk = remap('v', k)
    if (nk) labels[nk] = v
  }
  const angles = item.angles?.map((id) => remap('v', id)).filter((x): x is string => !!x)
  const lengths = item.lengths?.map((id) => remap('e', id)).filter((x): x is string => !!x)
  const nextGeo: ShapeGeometry = { ...item.geo, ...boxOfVertices(nextVerts), vertices: nextVerts, sides: nextVerts.length }
  delete nextGeo.rot
  return withShapeUpdate(item, { geo: nextGeo, labels, angles, lengths, constructions: undefined })
}

// ===================================================================== Legacy ShapeSpec helpers (v4-v11 compatibility)

/** True when the shape is edited directly via its corner vertices instead of box side handles. */
export function usesVertexHandles(kind: ShapeKind): boolean {
  return isVertexShape(kind)
}

/** True when a legacy shape spec has custom geometry overrides beyond its default bounding-box form. */
export function isCustomizedShape(spec: ShapeSpec): boolean {
  return Boolean(
    spec.vertices ||
    spec.skew !== undefined ||
    spec.topLeft !== undefined ||
    spec.topRight !== undefined ||
    spec.innerRatio !== undefined ||
    spec.apex !== undefined ||
    spec.depth !== undefined
  )
}

/** Reset custom vertices, slant, apex and depth on a legacy ShapeSpec. */
export function resetShapeGeometry(spec: ShapeSpec): ShapeSpec {
  const next: ShapeSpec = { ...spec }
  delete next.vertices
  delete next.skew
  delete next.topLeft
  delete next.topRight
  delete next.innerRatio
  delete next.apex
  delete next.depth
  return next
}

/** All direct on-canvas editing handles for a legacy ShapeSpec, in world coordinates. */
export function shapeHandles(spec: ShapeSpec): ShapeHandle[] {
  if (isTriangle(spec.kind)) {
    return shapeVertices(spec).map(([x, y], i) => ({
      id: `v:${i}`,
      kind: 'vertex',
      x,
      y,
      hint: 'shape.hint.vertex',
      cursor: 'crosshair',
      index: i
    }))
  }
  if (spec.kind === 'polygon') {
    const verts = shapeVertices(spec)
    const out: ShapeHandle[] = verts.map(([x, y], i) => ({
      id: `v:${i}`,
      kind: 'vertex',
      x,
      y,
      hint: 'shape.hint.polygonVertex',
      cursor: 'crosshair',
      index: i
    }))
    if (verts.length < MAX_BASE) {
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i]
        const b = verts[(i + 1) % verts.length]
        out.push({
          id: `add:${i}`,
          kind: 'addVertex',
          x: (a[0] + b[0]) / 2,
          y: (a[1] + b[1]) / 2,
          hint: 'shape.hint.addVertex',
          cursor: 'pointer',
          index: i
        })
      }
    }
    return out
  }

  const { x0, y0, x1, y1, w, h, cx, cy } = boundsOf(spec)
  if (w < 1e-6 || h < 1e-6) return []

  switch (spec.kind) {
    case 'parallelogram': {
      const skew = clamp(spec.skew ?? 0.25, -0.75, 0.75)
      const [x, y] = toWorld(spec, cx + (skew / 2) * w, y0)
      return [{ id: 'skew', kind: 'control', x, y, hint: 'shape.hint.skew', cursor: 'ew-resize' }]
    }
    case 'trapezoid': {
      let tl = clamp(spec.topLeft ?? 0.22, 0, 0.95)
      let tr = clamp(spec.topRight ?? 0.22, 0, 0.95)
      if (tl + tr > 0.96) {
        const k = 0.96 / (tl + tr)
        tl *= k
        tr *= k
      }
      const [lx, ly] = toWorld(spec, x0 + w * tl, y0)
      const [rx, ry] = toWorld(spec, x1 - w * tr, y0)
      return [
        { id: 'topLeft', kind: 'control', x: lx, y: ly, hint: 'shape.hint.trapezoid', cursor: 'ew-resize' },
        { id: 'topRight', kind: 'control', x: rx, y: ry, hint: 'shape.hint.trapezoid', cursor: 'ew-resize' }
      ]
    }
    case 'star': {
      const n = spec.base ?? SHAPE_BASES.star!.def
      const inner = clamp(spec.innerRatio ?? 0.4, 0.15, 0.9)
      const a = -Math.PI / 2 + Math.PI / n
      const [x, y] = toWorld(spec, cx + Math.cos(a) * (w / 2) * inner, cy + Math.sin(a) * (h / 2) * inner)
      return [{ id: 'inner', kind: 'control', x, y, hint: 'shape.hint.inner', cursor: 'grab' }]
    }
    case 'cube': {
      const d = Math.min(w, h) * clamp(spec.depth ?? 0.3, 0.08, 0.48)
      const [x, y] = toWorld(spec, x0 + d, y0)
      return [{ id: 'depth', kind: 'control', x, y, hint: 'shape.hint.depth', cursor: 'ew-resize' }]
    }
    case 'pyramid':
    case 'obliquePyramid': {
      const ry = Math.min(h * clamp(spec.depth ?? 0.16, 0.05, 0.45), w * 0.42)
      const defaultUx = spec.kind === 'obliquePyramid' ? 0.9 : 0.5
      const [ux, uy] = spec.apex ?? [defaultUx, 0]
      const [axp, ayp] = toWorld(spec, x0 + ux * w, y0 + uy * h)
      const [dx, dy] = toWorld(spec, cx, y1 - ry)
      return [
        { id: 'apex', kind: 'vertex', x: axp, y: ayp, hint: 'shape.hint.apex', cursor: 'crosshair' },
        { id: 'depth', kind: 'control', x: dx, y: dy, hint: 'shape.hint.depth', cursor: 'ns-resize' }
      ]
    }
    case 'cone': {
      const ry = Math.min(h * clamp(spec.depth ?? 0.14, 0.05, 0.45), w * 0.42)
      const [ux, uy] = spec.apex ?? [0.5, 0]
      const [axp, ayp] = toWorld(spec, x0 + ux * w, y0 + uy * h)
      const [dx, dy] = toWorld(spec, cx, y1 - ry)
      return [
        { id: 'apex', kind: 'vertex', x: axp, y: ayp, hint: 'shape.hint.apex', cursor: 'crosshair' },
        { id: 'depth', kind: 'control', x: dx, y: dy, hint: 'shape.hint.depth', cursor: 'ns-resize' }
      ]
    }
    case 'prism':
    case 'cylinder': {
      const defDepth = spec.kind === 'prism' ? 0.16 : 0.14
      const ry = Math.min(h * clamp(spec.depth ?? defDepth, 0.05, 0.45), w * 0.42)
      const [ux, uy] = spec.apex ?? [0.5, 0]
      const [tx, ty] = toWorld(spec, x0 + ux * w, y0 + ry + uy * h)
      const [dx, dy] = toWorld(spec, cx, y1 - ry)
      return [
        { id: 'apex', kind: 'vertex', x: tx, y: ty, hint: 'shape.hint.apex', cursor: 'crosshair' },
        { id: 'depth', kind: 'control', x: dx, y: dy, hint: 'shape.hint.depth', cursor: 'ns-resize' }
      ]
    }
    case 'sphere': {
      const ery = (h / 2) * clamp(spec.depth ?? 0.28, 0.08, 0.48)
      const [x, y] = toWorld(spec, cx, cy + ery)
      return [{ id: 'depth', kind: 'control', x, y, hint: 'shape.hint.depth', cursor: 'ns-resize' }]
    }
    default:
      return []
  }
}

export function insertPolygonVertex(spec: ShapeSpec, edgeIndex: number, worldPt: Vec2): { spec: ShapeSpec; vertexIndex: number } | null {
  if (spec.kind !== 'polygon') return null
  const verts = shapeVertices(spec)
  if (verts.length >= MAX_BASE || edgeIndex < 0 || edgeIndex >= verts.length) return null
  const vertexIndex = edgeIndex + 1
  const nextVerts: Vec2[] = [...verts.slice(0, vertexIndex), [worldPt[0], worldPt[1]], ...verts.slice(vertexIndex)]
  const { rot: _r, angleAt, lengthAt, ...rest } = spec
  const nextAngles = remapIndicesOnInsert(angleAt, vertexIndex)
  const nextLengths = remapIndicesOnInsert(lengthAt, vertexIndex)
  return {
    spec: {
      ...rest,
      ...boxOfVertices(nextVerts),
      vertices: nextVerts,
      base: nextVerts.length,
      ...(nextAngles ? { angleAt: nextAngles } : {}),
      ...(nextLengths ? { lengthAt: nextLengths } : {})
    },
    vertexIndex
  }
}

export function removePolygonVertex(spec: ShapeSpec, vertexIndex: number): ShapeSpec | null {
  if (spec.kind !== 'polygon') return null
  const verts = shapeVertices(spec)
  if (verts.length <= MIN_BASE || vertexIndex < 0 || vertexIndex >= verts.length) return null
  const nextVerts = verts.filter((_, i) => i !== vertexIndex)
  const { rot: _r, angleAt, lengthAt, ...rest } = spec
  const nextAngles = remapIndicesOnRemove(angleAt, vertexIndex)
  const nextLengths = remapIndicesOnRemove(lengthAt, vertexIndex)
  return {
    ...rest,
    ...boxOfVertices(nextVerts),
    vertices: nextVerts,
    base: nextVerts.length,
    ...(nextAngles ? { angleAt: nextAngles } : {}),
    ...(nextLengths ? { lengthAt: nextLengths } : {})
  }
}

export function dragShapeHandle(spec: ShapeSpec, handleId: string, worldPt: Vec2, opts: HandleDragOptions): HandleDragResult {
  if (handleId.startsWith('v:') && isVertexShape(spec.kind)) {
    const idx = Number(handleId.slice(2))
    const verts = shapeVertices(spec)
    if (!Number.isInteger(idx) || idx < 0 || idx >= verts.length) return { spec, label: null, guides: [], snapped: false }
    const snap = isTriangle(spec.kind) ? snapTriangleVertex(idx, verts, worldPt, opts) : snapPolygonVertex(idx, verts, worldPt, opts)
    const nextVerts = verts.map((v, i): Vec2 => (i === idx ? snap.point : v))
    const { rot: _r, ...rest } = spec
    return {
      spec: { ...rest, ...boxOfVertices(nextVerts), vertices: nextVerts, ...(spec.kind === 'polygon' ? { base: nextVerts.length } : {}) },
      label: snap.label,
      guides: snap.guides,
      snapped: snap.snapped
    }
  }
  const { x0, y0, x1, y1, w, h, cx, cy } = boundsOf(spec)
  if (w < 1e-6 || h < 1e-6) return { spec, label: null, guides: [], snapped: false }
  const [lx, ly] = toLocal(spec, worldPt[0], worldPt[1])
  const guides: SnapGuide[] = []
  if (spec.kind === 'parallelogram' && handleId === 'skew') {
    let skew = clamp((2 * (lx - cx)) / w, -0.75, 0.75)
    let snapped = false
    if (!opts.alt) {
      const s = snapScalar(skew, [-0.25, 0, 0.25], opts.snapTol / (w / 2))
      skew = s.value; snapped = s.snapped
      if (snapped && skew === 0) guides.push({ kind: 'line', points: [toWorld(spec, cx, y0), toWorld(spec, cx, y1)] })
    }
    return { spec: { ...spec, skew }, label: `${Math.round((Math.atan2(h, Math.abs(skew) * w) * 180) / Math.PI)}°`, guides, snapped }
  }
  if (spec.kind === 'trapezoid' && (handleId === 'topLeft' || handleId === 'topRight')) {
    const curTl = clamp(spec.topLeft ?? 0.22, 0, 0.95)
    const curTr = clamp(spec.topRight ?? 0.22, 0, 0.95)
    const tol = opts.snapTol / w
    let tl = curTl, tr = curTr, snapped = false
    if (handleId === 'topLeft') {
      const raw = clamp((lx - x0) / w, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tr))
      const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, opts.shift ? [0, 0.22] : [0, 0.22, tr], tol)
      tl = clamp(s.value, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tr))
      if (opts.shift) tr = tl
      snapped = s.snapped
    } else {
      const raw = clamp((x1 - lx) / w, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tl))
      const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, opts.shift ? [0, 0.22] : [0, 0.22, tl], tol)
      tr = clamp(s.value, 0, opts.shift ? 0.48 : Math.max(0, 0.96 - tl))
      if (opts.shift) tl = tr
      snapped = s.snapped
    }
    return { spec: { ...spec, topLeft: tl, topRight: tr }, label: `${Math.round((1 - tl - tr) * 100)}%`, guides, snapped }
  }
  if (spec.kind === 'star' && handleId === 'inner') {
    const n = spec.base ?? SHAPE_BASES.star!.def
    const a = -Math.PI / 2 + Math.PI / n
    const rx = w / 2, ry = h / 2
    let inner = clamp(((lx - cx) / rx) * Math.cos(a) + ((ly - cy) / ry) * Math.sin(a), 0.15, 0.9)
    let snapped = false
    if (!opts.alt) {
      const s = snapScalar(inner, [0.382, 0.4, 0.5], opts.snapTol / Math.max(1, Math.min(rx, ry)))
      inner = s.value; snapped = s.snapped
    }
    return { spec: { ...spec, innerRatio: inner }, label: `${Math.round(inner * 100)}%`, guides, snapped }
  }
  if (handleId === 'apex' && (spec.kind === 'pyramid' || spec.kind === 'obliquePyramid' || spec.kind === 'cone' || spec.kind === 'prism' || spec.kind === 'cylinder')) {
    const isTopFace = spec.kind === 'prism' || spec.kind === 'cylinder'
    const defDepth = spec.kind === 'prism' ? 0.16 : 0.14
    const ry = Math.min(h * clamp(spec.depth ?? defDepth, 0.05, 0.45), w * 0.42)
    let ux = clamp((lx - x0) / w, -1.5, 2.5)
    let uy = clamp((ly - (isTopFace ? y0 + ry : y0)) / h, -1.5, 2.5)
    let snapped = false
    if (!opts.alt) {
      const sx = snapScalar(ux, [0.5, 0, 1], opts.snapTol / w)
      const sy = snapScalar(uy, [0], opts.snapTol / h)
      ux = sx.value; uy = sy.value; snapped = sx.snapped || sy.snapped
    }
    const slantDeg = Math.round((Math.atan2((ux - 0.5) * w, Math.max(1, h - ry - uy * h)) * 180) / Math.PI)
    return { spec: { ...spec, apex: [ux, uy] }, label: `${slantDeg}°`, guides, snapped }
  }
  if (handleId === 'depth') {
    if (spec.kind === 'cube') {
      const sMin = Math.min(w, h)
      const raw = clamp((lx - x0) / sMin, 0.08, 0.48)
      const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, [0.3], opts.snapTol / sMin)
      return { spec: { ...spec, depth: s.value }, label: `${Math.round(s.value * 100)}%`, guides, snapped: s.snapped }
    }
    if (spec.kind === 'sphere') {
      const raw = clamp((ly - cy) / (h / 2), 0.08, 0.48)
      const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, [0.28], opts.snapTol / (h / 2))
      return { spec: { ...spec, depth: s.value }, label: `${Math.round(s.value * 100)}%`, guides, snapped: s.snapped }
    }
    const def = spec.kind === 'cylinder' || spec.kind === 'cone' ? 0.14 : 0.16
    const maxDepth = Math.min(0.45, (w * 0.42) / h)
    const raw = clamp((y1 - ly) / h, 0.05, Math.max(0.05, maxDepth))
    const s = opts.alt ? { value: raw, snapped: false } : snapScalar(raw, [def], opts.snapTol / h)
    return { spec: { ...spec, depth: s.value }, label: `${Math.round(s.value * 100)}%`, guides, snapped: s.snapped }
  }
  return { spec, label: null, guides: [], snapped: false }
}
