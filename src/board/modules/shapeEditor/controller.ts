import { distToSegmentSq } from '@penrill/core/geometry'
import { evaluateShape } from '@penrill/core/shapeEval'
import { regenerateShape } from '@penrill/core/shapeItems'
import { shapePolygonVertices } from '@penrill/core/shapes'
import type { Scene } from '@penrill/core/scene'
import type { Camera, Item, ShapeGeometry, ShapeItem, ShapeSpec, StrokeItem, Vec2 } from '@penrill/core/types'
import type { GizmoActiveArc, GizmoSpace } from '@penrill/shape-editor/gizmo3d'
import { shapeEdgeTargets } from '@penrill/shape-editor/targets'
import type { ShapeEditorCornerTarget, ShapeEditorEdgeTarget, ShapeEditorFeature, ShapeEditorGuide, ShapeEditorHandle } from '../../registry'

export const SHAPE_HANDLE_R = 6.5
export const ORBIT_HANDLE_R = 9
export const ADD_HANDLE_R = 5
export const HANDLE_TAP_SLOP = 4

/** Screen-space hit test for direct shape handles (vertices, controls and 3D orbit win over add-vertex dots; closer 3D depth wins on overlapping vertices). */
export function hitShapeHandle(
  handles: readonly ShapeEditorHandle[],
  sx: number,
  sy: number,
  cam: Camera,
  reach: number
): ShapeEditorHandle | null {
  let best: ShapeEditorHandle | null = null
  let bestScore = Infinity
  let bestDepth = -Infinity
  for (const h of handles) {
    const hx = (h.x - cam.x) * cam.zoom
    const hy = (h.y - cam.y) * cam.zoom
    const baseR = h.kind === 'orbit' ? ORBIT_HANDLE_R : h.kind === 'addVertex' ? ADD_HANDLE_R : SHAPE_HANDLE_R
    const radius = baseR + 5 + reach
    const d = Math.hypot(sx - hx, sy - hy)
    if (d > radius) continue
    const score = d + (h.kind === 'addVertex' ? 4 : h.kind === 'orbit' ? -2 : 0)
    const depth = h.depth ?? 0
    // In orthographic side views front & back 3D vertices project to the same pixel: prefer the closer vertex.
    const nearTie = best !== null && Math.abs(score - bestScore) <= 3 && h.kind === best.kind
    if ((!nearTie && score < bestScore) || (nearTie && depth > bestDepth + 1e-4)) {
      bestScore = score
      bestDepth = depth
      best = h
    }
  }
  return best
}

/** Hit-test edges of a selected first-class 2D or 3D ShapeItem (excluding zones right on vertices). */
export function hitShapeItemEdge(item: ShapeItem, wx: number, wy: number, zoom: number): ShapeEditorEdgeTarget | null {
  const ev = evaluateShape(item)
  if (!ev.edges.length) return null
  const tol = 10 / zoom
  const tolSq = tol * tol
  const cornerClear = 12 / zoom
  let best: ShapeEditorEdgeTarget | null = null
  let bestSq = tolSq
  for (let i = 0; i < ev.edges.length; i++) {
    const e = ev.edges[i]
    if (Math.hypot(wx - e.a[0], wy - e.a[1]) <= cornerClear) continue
    if (Math.hypot(wx - e.b[0], wy - e.b[1]) <= cornerClear) continue
    const dSq = distToSegmentSq(wx, wy, e.a[0], e.a[1], e.b[0], e.b[1])
    if (dSq <= bestSq) {
      bestSq = dSq
      best = {
        id: e.id,
        index: i,
        a: e.a,
        b: e.b,
        mid: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2],
        length: e.length
      }
    }
  }
  return best
}

/** Hit-test corners of any legacy polygonal 2D shape. */
export function hitShapeCorner(
  spec: ShapeSpec,
  sx: number,
  sy: number,
  cam: Camera,
  reach: number
): ShapeEditorCornerTarget | null {
  const verts = shapePolygonVertices(spec)
  if (!verts.length) return null
  let best: ShapeEditorCornerTarget | null = null
  let bestD = SHAPE_HANDLE_R + 6 + reach
  for (let i = 0; i < verts.length; i++) {
    const vx = (verts[i][0] - cam.x) * cam.zoom
    const vy = (verts[i][1] - cam.y) * cam.zoom
    const d = Math.hypot(sx - vx, sy - vy)
    if (d <= bestD) {
      bestD = d
      best = { index: i, x: verts[i][0], y: verts[i][1] }
    }
  }
  return best
}

/** Hit-test edges of a selected legacy 2D shape (excluding zones right on top of vertices). */
export function hitShapeEdge(spec: ShapeSpec, wx: number, wy: number, zoom: number): ShapeEditorEdgeTarget | null {
  const edges = shapeEdgeTargets(spec)
  if (!edges.length) return null
  const tol = 10 / zoom
  const tolSq = tol * tol
  const cornerClear = 13 / zoom
  let best: ShapeEditorEdgeTarget | null = null
  let bestSq = tolSq
  for (const e of edges) {
    if (Math.hypot(wx - e.a[0], wy - e.a[1]) <= cornerClear) continue
    if (Math.hypot(wx - e.b[0], wy - e.b[1]) <= cornerClear) continue
    const dSq = distToSegmentSq(wx, wy, e.a[0], e.a[1], e.b[0], e.b[1])
    if (dSq <= bestSq) {
      bestSq = dSq
      best = e
    }
  }
  return best
}

export interface ShapeHandleHost {
  scene: Scene
  camera: Camera
  setSelection(items: Item[]): void
}

export interface ShapeSelection {
  spec: ShapeSpec
  parts: StrokeItem[]
}

export interface ShapeHandleGesture {
  readonly handleId: string
  readonly handle: ShapeEditorHandle
  readonly moved: boolean
  move(worldPt: Vec2, mods: { shift: boolean; ctrl: boolean; alt: boolean }, gridStep: readonly [number, number]): void
  /** Returns true if geometry changed (dragged), false if it was a plain tap on the handle. */
  end(): boolean
  guides(): readonly ShapeEditorGuide[]
  label(): string | null
  gizmoArc?(): GizmoActiveArc | null
}

export interface ShapeItemHandleOptions {
  gizmoSpace?: GizmoSpace
  free3d?: boolean
}

/**
 * Headless gesture controller for dragging any handle of a first-class ShapeItem (2D constrained
 * or free vertex, 3D orbit/trackball knob, 3D X/Y/Z/roll gizmo ring, 3D dimension/apex handle,
 * or polygon '+' insert).
 * Distinguishes a tap (<= 4 screen px) from a drag so tapping any 2D/3D vertex opens its popover
 * and tapping the 3D orbit knob toggles the Blender-style X/Y/Z gizmo.
 */
export function beginShapeItemHandle(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  startItem: ShapeItem,
  handle: ShapeEditorHandle,
  startPt: Vec2,
  options?: ShapeItemHandleOptions
): ShapeHandleGesture {
  const { scene } = host
  let baseItem: ShapeItem = startItem
  let startGeo: ShapeGeometry = startItem.geo
  let prevWorld: Vec2 = startPt
  let prevGeo: ShapeGeometry = startItem.geo
  let handleId = handle.id
  let current: ShapeItem = startItem
  let lastGuides: ShapeEditorGuide[] = []
  let lastLabel: string | null = null
  let lastGizmoArc: GizmoActiveArc | null = null
  let moved = false

  if (handle.kind === 'addVertex' && handle.index !== undefined) {
    const inserted = feature.insertItemVertex(startItem, handle.index, startPt)
    if (inserted) {
      baseItem = inserted.item
      startGeo = inserted.item.geo
      prevGeo = inserted.item.geo
      handleId = inserted.vertexId
      moved = true
      scene.replace([current], [inserted.item], false)
      current = inserted.item
      host.setSelection([current])
    }
  }

  return {
    get handleId() {
      return handleId
    },
    get handle() {
      return handle
    },
    get moved() {
      return moved
    },
    move(worldPt, mods, gridStep) {
      if (handle.draggable === false) return
      if (!moved && Math.hypot(worldPt[0] - startPt[0], worldPt[1] - startPt[1]) * host.camera.zoom <= HANDLE_TAP_SLOP) {
        return
      }
      moved = true
      const res = feature.dragItemHandle(
        baseItem,
        handleId,
        worldPt,
        {
          shift: mods.shift,
          ctrl: mods.ctrl,
          alt: mods.alt,
          snapTol: 10 / host.camera.zoom,
          gridStep
        },
        {
          startWorld: startPt,
          startGeo,
          prevWorld,
          prevGeo,
          gizmoSpace: options?.gizmoSpace,
          free3d: options?.free3d
        }
      )
      lastGuides = res.guides
      lastLabel = res.label
      lastGizmoArc = res.gizmoArc ?? null
      prevWorld = worldPt
      prevGeo = res.item.geo
      scene.replace([current], [res.item], false)
      current = res.item
      host.setSelection([current])
    },
    end() {
      if (current !== startItem) {
        scene.record({ added: [current], removed: [startItem] })
        host.setSelection([current])
        return true
      }
      return false
    },
    guides: () => lastGuides,
    label: () => lastLabel,
    gizmoArc: () => lastGizmoArc
  }
}

/** Reset only the 3D orientation of a ShapeItem back to default axonometry in one undo step. */
export function tryResetShapeItemOrbit(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  item: ShapeItem
): boolean {
  const next = feature.resetItemOrbit(item)
  if (next === item) return false
  host.scene.replace([item], [next])
  host.setSelection([next])
  return true
}

/** Snap or flip a 3D ShapeItem to the +/- orthographic side view for a clicked X/Y/Z gizmo pole in one undo step. */
export function tryToggleAxisView3d(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  item: ShapeItem,
  axis: 'x' | 'y' | 'z'
): boolean {
  const { item: next } = feature.toggleAxisViewPreset3d(item, axis)
  if (next === item) return false
  host.scene.replace([item], [next])
  host.setSelection([next])
  return true
}

/** Remove a polygon vertex from a first-class ShapeItem in one undo step. */
export function tryRemoveShapeItemVertex(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  item: ShapeItem,
  vertexId: string
): boolean {
  const next = feature.removeItemVertex(item, vertexId)
  if (!next) return false
  host.scene.replace([item], [next])
  host.setSelection([next])
  return true
}

function isInUserGroup(scene: Scene, parts: readonly StrokeItem[]): boolean {
  const gid = parts[0]?.groupId
  return !!gid && scene.getItems().some((i) => i.groupId === gid && !parts.includes(i as StrokeItem))
}

/** Legacy gesture controller for v4-v11 StrokeItem shapes. */
export function beginShapeHandle(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  sel: ShapeSelection,
  handle: ShapeEditorHandle,
  startPt: Vec2
): ShapeHandleGesture {
  const { scene } = host
  const inUserGroup = isInUserGroup(scene, sel.parts)
  let baseSpec = sel.spec
  let handleId = handle.id
  let current: StrokeItem[] = sel.parts
  let lastGuides: ShapeEditorGuide[] = []
  let lastLabel: string | null = null
  let moved = false

  if (handle.kind === 'addVertex' && handle.index !== undefined) {
    const inserted = feature.insertVertex(sel.spec, handle.index, startPt)
    if (inserted) {
      baseSpec = inserted.spec
      handleId = `v:${inserted.vertexIndex}`
      moved = true
      const next = regenerateShape(sel.parts, inserted.spec, () => scene.allocZ(), inUserGroup)
      scene.replace(current, next, false)
      current = next
      host.setSelection(current)
    }
  }

  return {
    get handleId() {
      return handleId
    },
    get handle() {
      return handle
    },
    get moved() {
      return moved
    },
    move(worldPt, mods, gridStep) {
      if (!moved && Math.hypot(worldPt[0] - startPt[0], worldPt[1] - startPt[1]) * host.camera.zoom <= HANDLE_TAP_SLOP) {
        return
      }
      moved = true
      const res = feature.dragHandle(baseSpec, handleId, worldPt, {
        shift: mods.shift,
        ctrl: mods.ctrl,
        alt: mods.alt,
        snapTol: 10 / host.camera.zoom,
        gridStep
      })
      lastGuides = res.guides
      lastLabel = res.label
      const next = regenerateShape(sel.parts, res.spec, () => scene.allocZ(), inUserGroup)
      scene.replace(current, next, false)
      current = next
      host.setSelection(current)
    },
    end() {
      if (current !== sel.parts) {
        scene.record({ added: current, removed: sel.parts })
        host.setSelection(current)
        return true
      }
      return false
    },
    guides: () => lastGuides,
    label: () => lastLabel
  }
}

/** Remove a polygon vertex from a legacy StrokeItem shape in one undo step. */
export function tryRemovePolygonVertex(
  feature: ShapeEditorFeature,
  host: ShapeHandleHost,
  sel: ShapeSelection,
  handle: Pick<ShapeEditorHandle, 'kind' | 'index'>
): boolean {
  if (handle.kind !== 'vertex' || handle.index === undefined) return false
  const nextSpec = feature.removeVertex(sel.spec, handle.index)
  if (!nextSpec) return false
  const inUserGroup = isInUserGroup(host.scene, sel.parts)
  const next = regenerateShape(sel.parts, nextSpec, () => host.scene.allocZ(), inUserGroup)
  host.scene.replace(sel.parts, next)
  host.setSelection(next)
  return true
}
