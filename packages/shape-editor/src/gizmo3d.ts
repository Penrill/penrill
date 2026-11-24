import { distToSegmentSq } from '@penrill/core/geometry'
import { evaluateShape } from '@penrill/core/shapeEval'
import {
  DEFAULT_ORBIT,
  effectiveDim3,
  effectiveQuat,
  effectiveRotMat3,
  eulerDegToQuat,
  ISOMETRIC_QUAT,
  orbitToQuat,
  project3dMat,
  quatFromAxisAngle,
  quatMul,
  quatNormalize,
  quatToEulerDeg,
  quatToMat3,
  rotate3dMat,
  type Mat3
} from '@penrill/core/shapeEval3d'
import { is3D } from '@penrill/core/shapes'
import type { Camera, Quat, ShapeGeometry, ShapeItem, Vec2, Vec3 } from '@penrill/core/types'
import { withShapeUpdate } from './elements'
import { snapScalar, type HandleDragOptions, type SnapGuide } from './snapping'

export type GizmoAxis = 'x' | 'y' | 'z' | 'view'
export type GizmoSpace = 'local' | 'world'
export type GizmoRingId = 'rotX' | 'rotY' | 'rotZ' | 'rotView'
export type GizmoPoleId = 'poleX' | 'poleY' | 'poleZ'
export type ViewPreset3d = 'axon' | 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left'

export interface GizmoRing {
  id: GizmoRingId
  axis: GizmoAxis
  color: string
  label: string
  frontPts: Vec2[][]
  backPts: Vec2[][]
  pole: { pos: Vec2; depth: number } | null
  /** Rotation axis expressed in right-handed camera space (x right, y up, z toward viewer). */
  axis3View: Vec3
}

export interface Gizmo3dModel {
  center: Vec2
  radius: number
  outerRadius: number
  space: GizmoSpace
  /** Current orientation as [X, Y, Z] Euler degrees (`R_z(Z) * R_x(X) * R_y(Y)`). */
  eulerDeg: [x: number, y: number, z: number]
  /** Active preset name when snapped within ~2 deg of a standard view, else null. */
  activeView: ViewPreset3d | null
  rings: GizmoRing[]
}

export interface GizmoHitResult {
  kind: 'ring' | 'pole'
  id: GizmoRingId | GizmoPoleId
  axis: GizmoAxis
  ring: GizmoRing
  x: number
  y: number
}

export interface GizmoActiveArc {
  id: GizmoRingId
  axis: GizmoAxis
  color: string
  center: Vec2
  /** Closed sector polygon [center, ...projected arc points] in world coordinates. */
  sectorPts: Vec2[]
  /** Start radial endpoint on the ring. */
  startPt: Vec2
  /** Current radial endpoint on the ring. */
  endPt: Vec2
  deltaDeg: number
}

export interface GizmoDragStart {
  startWorld: Vec2
  startGeo: ShapeGeometry
  prevWorld?: Vec2
  prevGeo?: ShapeGeometry
  gizmoSpace?: GizmoSpace
  free3d?: boolean
}

export interface GizmoDragResult {
  item: ShapeItem
  label: string | null
  guides: SnapGuide[]
  snapped: boolean
  gizmoArc: GizmoActiveArc | null
}

const DEG = Math.PI / 180
const RING_SAMPLES = 72
const IDENTITY_MAT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const WORLD_REF_MAT: Mat3 = quatToMat3(orbitToQuat(DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]))

const RING_COLORS: Record<GizmoRingId, string> = {
  rotX: '#e03131',
  rotY: '#2f9e44',
  rotZ: '#1971c2',
  rotView: '#64748b'
}

const RING_LABELS: Record<GizmoRingId, string> = {
  rotX: 'X',
  rotY: 'Y',
  rotZ: 'Z',
  rotView: ''
}

const RING_BASIS: Record<Exclude<GizmoRingId, 'rotView'>, { axis: Vec3; u: Vec3; v: Vec3 }> = {
  rotX: { axis: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  rotY: { axis: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  rotZ: { axis: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }
}

const PRESET_QUATS: Record<ViewPreset3d, Quat> = {
  axon: orbitToQuat(DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]),
  iso: ISOMETRIC_QUAT,
  front: [0, 0, 0, 1],
  back: eulerDegToQuat(0, 180, 0),
  top: eulerDegToQuat(90, 0, 0),
  bottom: eulerDegToQuat(-90, 0, 0),
  right: eulerDegToQuat(0, -90, 0),
  left: eulerDegToQuat(0, 90, 0)
}

export function isGizmoRingId(id: string): id is GizmoRingId {
  return id === 'rotX' || id === 'rotY' || id === 'rotZ' || id === 'rotView'
}

export function isGizmoPoleId(id: string): id is GizmoPoleId {
  return id === 'poleX' || id === 'poleY' || id === 'poleZ'
}

export function poleToRingId(id: GizmoPoleId): Exclude<GizmoRingId, 'rotView'> {
  return id === 'poleX' ? 'rotX' : id === 'poleY' ? 'rotY' : 'rotZ'
}

export function isSideViewPreset(preset: ViewPreset3d | null | undefined): boolean {
  return preset === 'front' || preset === 'back' || preset === 'top' || preset === 'bottom' || preset === 'right' || preset === 'left'
}

/** Detect if a 3D ShapeGeometry is aligned within ~2 deg of a standard view preset. */
export function detectViewPreset3d(geo: ShapeGeometry): ViewPreset3d | null {
  if (!is3D(geo.kind)) return null
  const q = effectiveQuat(geo)
  let best: ViewPreset3d | null = null
  let bestDot = 0.9994 // cos(1 deg) ~= 0.99985, 0.9994 ~= 2 deg tolerance
  for (const [key, ref] of Object.entries(PRESET_QUATS) as [ViewPreset3d, Quat][]) {
    const d = Math.abs(q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3])
    if (d > bestDot) {
      bestDot = d
      best = key
    }
  }
  return best
}

function ringAxis(id: GizmoRingId): GizmoAxis {
  return id === 'rotX' ? 'x' : id === 'rotY' ? 'y' : id === 'rotZ' ? 'z' : 'view'
}

/** World-space radius of the 3D gizmo sphere framing the solid cleanly without crowding inner vertices. */
export function gizmo3dRadius(item: ShapeItem, zoom: number): number {
  const [w, h, d] = effectiveDim3(item.geo)
  const halfDiag = Math.hypot(w, h, d) * 0.5
  const minWorld = 48 / Math.max(0.05, zoom)
  return Math.max(halfDiag * 1.08, minWorld)
}

/** Split a sampled closed ring into contiguous front (depth >= 0) and back (depth < 0) polyline runs. */
function splitRingFrontBack(samples: { pos: Vec2; front: boolean }[]): { frontPts: Vec2[][]; backPts: Vec2[][] } {
  const n = samples.length
  if (n < 2) return { frontPts: [], backPts: [] }
  const allSame = samples.every((s) => s.front === samples[0].front)
  if (allSame) {
    const pts = samples.map((s) => s.pos)
    pts.push(samples[0].pos)
    return samples[0].front ? { frontPts: [pts], backPts: [] } : { frontPts: [], backPts: [pts] }
  }
  let start = 0
  for (let i = 0; i < n; i++) {
    if (samples[i].front !== samples[(i - 1 + n) % n].front) {
      start = i
      break
    }
  }
  const frontPts: Vec2[][] = []
  const backPts: Vec2[][] = []
  let run: Vec2[] = [samples[start].pos]
  let runFront = samples[start].front
  for (let step = 1; step <= n; step++) {
    const s = samples[(start + step) % n]
    run.push(s.pos)
    if (s.front !== runFront || step === n) {
      ;(runFront ? frontPts : backPts).push(run)
      run = [s.pos]
      runFront = s.front
    }
  }
  return { frontPts, backPts }
}

/** Build the pure 3D rotation gizmo geometry (X/Y/Z great circles + outer screen-roll ring) in world coordinates. */
export function buildGizmo3d(item: ShapeItem, zoom: number, space: GizmoSpace = 'local'): Gizmo3dModel | null {
  if (!is3D(item.geo.kind)) return null
  const ev = evaluateShape(item)
  const center = ev.center
  const radius = gizmo3dRadius(item, zoom)
  const outerRadius = radius * 1.16
  const basisMat = space === 'local' ? effectiveRotMat3(item.geo) : WORLD_REF_MAT

  const rings: GizmoRing[] = []
  for (const id of ['rotX', 'rotY', 'rotZ'] as const) {
    const { axis, u, v } = RING_BASIS[id]
    const samples = Array.from({ length: RING_SAMPLES }, (_, i) => {
      const a = (i / RING_SAMPLES) * Math.PI * 2
      const ca = Math.cos(a) * radius
      const sa = Math.sin(a) * radius
      const p3: Vec3 = [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa]
      const pr = project3dMat(p3, center, basisMat)
      return { pos: pr.pos, front: pr.depth >= -1e-4 }
    })
    const { frontPts, backPts } = splitRingFrontBack(samples)
    const polePr = project3dMat([axis[0] * radius, axis[1] * radius, axis[2] * radius], center, basisMat)
    rings.push({
      id,
      axis: ringAxis(id),
      color: RING_COLORS[id],
      label: RING_LABELS[id],
      frontPts,
      backPts,
      pole: { pos: polePr.pos, depth: polePr.depth },
      axis3View: rotate3dMat(axis, basisMat)
    })
  }

  // Outer view-plane ring (rotates cleanly around the camera Z axis).
  const outerPts: Vec2[] = Array.from({ length: RING_SAMPLES + 1 }, (_, i) => {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    return [center[0] + Math.cos(a) * outerRadius, center[1] - Math.sin(a) * outerRadius]
  })
  rings.push({
    id: 'rotView',
    axis: 'view',
    color: RING_COLORS.rotView,
    label: '',
    frontPts: [outerPts],
    backPts: [],
    pole: null,
    axis3View: [0, 0, 1]
  })

  const eulerDeg = quatToEulerDeg(effectiveQuat(item.geo))
  const activeView = detectViewPreset3d(item.geo)
  return { center, radius, outerRadius, space, eulerDeg, activeView, rings }
}

/** Screen-space hit-test against the 3D gizmo axis pole pills (`X`, `Y`, `Z`) and rings. */
export function hitGizmo3dRing(
  gizmo: Gizmo3dModel,
  sx: number,
  sy: number,
  cam: Camera,
  reach: number
): GizmoHitResult | null {
  const toSx = (x: number): number => (x - cam.x) * cam.zoom
  const toSy = (y: number): number => (y - cam.y) * cam.zoom

  // 1. Clickable X / Y / Z pole pills (tap snaps to side view; drag rotates the ring).
  let bestPole: { ring: GizmoRing; score: number } | null = null
  const poleR = 9 + reach
  for (const ring of gizmo.rings) {
    if (!ring.pole || ring.id === 'rotView') continue
    const d = Math.hypot(sx - toSx(ring.pole.pos[0]), sy - toSy(ring.pole.pos[1]))
    if (d > poleR) continue
    const score = d + (ring.pole.depth < -1e-4 ? 6 : 0)
    if (!bestPole || score < bestPole.score) bestPole = { ring, score }
  }
  if (bestPole) {
    const r = bestPole.ring
    const poleId: GizmoPoleId = r.id === 'rotX' ? 'poleX' : r.id === 'rotY' ? 'poleY' : 'poleZ'
    return { kind: 'pole', id: poleId, axis: r.axis, ring: r, x: r.pole!.pos[0], y: r.pole!.pos[1] }
  }

  // 2. 3D ring arcs (front arcs beat back arcs; interior stays unobstructed).
  const tolPx = 8 + reach
  const tolSq = tolPx * tolPx
  let best: { ring: GizmoRing; score: number } | null = null

  const testRuns = (ring: GizmoRing, runs: readonly Vec2[][], isBack: boolean): void => {
    for (const pts of runs) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const dSq = distToSegmentSq(sx, sy, toSx(pts[i][0]), toSy(pts[i][1]), toSx(pts[i + 1][0]), toSy(pts[i + 1][1]))
        if (dSq > tolSq) continue
        const score = Math.sqrt(dSq) + (isBack ? 5 : 0) + (ring.id === 'rotView' ? 1.5 : 0)
        if (!best || score < best.score) best = { ring, score }
      }
    }
  }

  for (const ring of gizmo.rings) {
    testRuns(ring, ring.frontPts, false)
    testRuns(ring, ring.backPts, true)
  }

  if (!best) return null
  const hitRing = (best as { ring: GizmoRing; score: number }).ring
  const wx = sx / cam.zoom + cam.x
  const wy = sy / cam.zoom + cam.y
  return { kind: 'ring', id: hitRing.id, axis: hitRing.axis, ring: hitRing, x: wx, y: wy }
}

/** Build the projected 3D sweep sector polygon on the active ring for live Blender-style drag feedback. */
function buildActiveArc(
  id: GizmoRingId,
  center: Vec2,
  radius: number,
  basisMat: Mat3,
  startWorld: Vec2,
  deltaRad: number
): GizmoActiveArc {
  const isView = id === 'rotView'
  const r = isView ? radius * 1.16 : radius
  const u: Vec3 = isView ? [1, 0, 0] : RING_BASIS[id].u
  const v: Vec3 = isView ? [0, 1, 0] : RING_BASIS[id].v
  const m = isView ? IDENTITY_MAT : basisMat

  const pointAt = (a: number): Vec2 => {
    const ca = Math.cos(a) * r
    const sa = Math.sin(a) * r
    return project3dMat([u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa], center, m).pos
  }

  let a0 = 0
  if (isView) {
    a0 = Math.atan2(-(startWorld[1] - center[1]), startWorld[0] - center[0])
  } else {
    let bestD = Infinity
    for (let i = 0; i < RING_SAMPLES; i++) {
      const a = (i / RING_SAMPLES) * Math.PI * 2
      const pt = pointAt(a)
      const d = (pt[0] - startWorld[0]) ** 2 + (pt[1] - startWorld[1]) ** 2
      if (d < bestD) {
        bestD = d
        a0 = a
      }
    }
  }

  const steps = Math.max(8, Math.ceil(Math.abs(deltaRad) / (4 * DEG)))
  const arcPts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    arcPts.push(pointAt(a0 + (deltaRad * i) / steps))
  }

  return {
    id,
    axis: ringAxis(id),
    color: RING_COLORS[id],
    center,
    sectorPts: [center, ...arcPts],
    startPt: arcPts[0],
    endPt: arcPts[arcPts.length - 1],
    deltaDeg: Math.round(deltaRad / DEG)
  }
}

/** Drag one of the 3D gizmo rings (`rotX`, `rotY`, `rotZ`, `rotView`) around its axis with optional snapping. */
export function dragGizmo3dRing(
  item: ShapeItem,
  ringId: GizmoRingId,
  worldPt: Vec2,
  opts: HandleDragOptions,
  dragStart?: GizmoDragStart
): GizmoDragResult {
  const baseGeo = dragStart?.startGeo ?? item.geo
  const startWorld = dragStart?.startWorld ?? worldPt
  const space: GizmoSpace = dragStart?.gizmoSpace ?? 'local'
  const center: Vec2 = [(baseGeo.ax + baseGeo.bx) / 2, (baseGeo.ay + baseGeo.by) / 2]
  const q0 = effectiveQuat(baseGeo)
  const startMat = quatToMat3(q0)
  const basisMat = space === 'local' ? startMat : WORLD_REF_MAT

  const axis3View: Vec3 = ringId === 'rotView' ? [0, 0, 1] : rotate3dMat(RING_BASIS[ringId].axis, basisMat)
  const zoomEst = 10 / Math.max(1e-3, opts.snapTol)
  const radius = gizmo3dRadius({ ...item, geo: baseGeo }, zoomEst)

  let rawDelta = 0
  if (Math.abs(axis3View[2]) >= 0.24) {
    const aStart = Math.atan2(startWorld[1] - center[1], startWorld[0] - center[0])
    const aCur = Math.atan2(worldPt[1] - center[1], worldPt[0] - center[0])
    let dScreen = aCur - aStart
    while (dScreen > Math.PI) dScreen -= Math.PI * 2
    while (dScreen < -Math.PI) dScreen += Math.PI * 2
    rawDelta = -(axis3View[2] >= 0 ? 1 : -1) * dScreen
  } else {
    const ax2Len = Math.hypot(axis3View[0], axis3View[1])
    const dirSx = ax2Len > 1e-4 ? axis3View[1] / ax2Len : 1
    const dirSy = ax2Len > 1e-4 ? axis3View[0] / ax2Len : 0
    const dxPx = (worldPt[0] - startWorld[0]) * zoomEst
    const dyPx = (worldPt[1] - startWorld[1]) * zoomEst
    const rPx = Math.max(40, radius * zoomEst)
    rawDelta = ((dxPx * dirSx + dyPx * dirSy) / rPx) * 1.4
  }

  let delta = rawDelta
  let snapped = false
  if (opts.shift) {
    const step = 15 * DEG
    delta = Math.round(rawDelta / step) * step
    snapped = true
  } else if (!opts.alt) {
    const targets = [-180, -150, -135, -120, -90, -60, -45, -30, 0, 30, 45, 60, 90, 120, 135, 150, 180].map((d) => d * DEG)
    const s = snapScalar(rawDelta, targets, 4 * DEG)
    delta = s.value
    snapped = s.snapped
  }

  let qNext: Quat
  if (ringId === 'rotView') {
    qNext = quatNormalize(quatMul(quatFromAxisAngle([0, 0, 1], delta), q0))
  } else if (space === 'local') {
    qNext = quatNormalize(quatMul(q0, quatFromAxisAngle(RING_BASIS[ringId].axis, delta)))
  } else {
    qNext = quatNormalize(quatMul(quatFromAxisAngle(axis3View, delta), q0))
  }

  const nextGeo: ShapeGeometry = { ...baseGeo, dim3: effectiveDim3(baseGeo), rot3: qNext }
  delete nextGeo.orbit
  const deg = Math.round(delta / DEG)
  const prefix = ringId === 'rotView' ? 'Roll' : RING_LABELS[ringId]
  const sign = deg > 0 ? '+' : ''
  const label = `${prefix}: ${sign}${deg}°`
  const gizmoArc = buildActiveArc(ringId, center, radius, basisMat, startWorld, delta)

  return {
    item: withShapeUpdate(item, { geo: nextGeo }),
    label,
    guides: [],
    snapped,
    gizmoArc
  }
}

/**
 * Gimbal-lock-free virtual trackball rotation (used when dragging the 3D Orbit knob while the
 * Blender-style 3D gizmo is active). Incremental per pointer sample so circular motion rolls naturally.
 */
export function dragTrackball3d(
  item: ShapeItem,
  worldPt: Vec2,
  opts: HandleDragOptions,
  dragStart?: GizmoDragStart
): GizmoDragResult {
  const prevGeo = dragStart?.prevGeo ?? dragStart?.startGeo ?? item.geo
  const prevWorld = dragStart?.prevWorld ?? dragStart?.startWorld ?? worldPt
  const zoomEst = 10 / Math.max(1e-3, opts.snapTol)
  const dxPx = (worldPt[0] - prevWorld[0]) * zoomEst
  const dyPx = (worldPt[1] - prevWorld[1]) * zoomEst
  const distPx = Math.hypot(dxPx, dyPx)
  if (distPx < 1e-4) {
    return { item, label: null, guides: [], snapped: false, gizmoArc: null }
  }
  const axisCam: Vec3 = [dyPx / distPx, dxPx / distPx, 0]
  const angle = distPx * 0.011
  const qPrev = effectiveQuat(prevGeo)
  const qNext = quatNormalize(quatMul(quatFromAxisAngle(axisCam, angle), qPrev))
  const nextGeo: ShapeGeometry = { ...prevGeo, dim3: effectiveDim3(prevGeo), rot3: qNext }
  delete nextGeo.orbit

  const [xDeg, yDeg, zDeg] = quatToEulerDeg(qNext)
  const label = `X ${xDeg}° · Y ${yDeg}° · Z ${zDeg}°`

  return {
    item: withShapeUpdate(item, { geo: nextGeo }),
    label,
    guides: [],
    snapped: false,
    gizmoArc: null
  }
}

/** Set exact [X, Y, Z] Euler orientation degrees on a 3D ShapeItem (matching the gizmo HUD & Blender inputs). */
export function setEulerDeg3d(item: ShapeItem, eulerDeg: readonly [number, number, number]): ShapeItem {
  if (!is3D(item.geo.kind)) return item
  const [x, y, z] = eulerDeg
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return item
  const nextGeo: ShapeGeometry = {
    ...item.geo,
    dim3: effectiveDim3(item.geo),
    rot3: eulerDegToQuat(x, y, z)
  }
  delete nextGeo.orbit
  return withShapeUpdate(item, { geo: nextGeo })
}

/** Snap a 3D ShapeItem to a standard 3D or orthographic side editing view preset. */
export function applyViewPreset3d(item: ShapeItem, preset: ViewPreset3d): ShapeItem {
  if (!is3D(item.geo.kind)) return item
  const nextGeo: ShapeGeometry = { ...item.geo, dim3: effectiveDim3(item.geo) }
  if (preset === 'axon') {
    delete nextGeo.rot3
    nextGeo.orbit = [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]]
  } else {
    delete nextGeo.orbit
    nextGeo.rot3 = [...PRESET_QUATS[preset]]
  }
  return withShapeUpdate(item, { geo: nextGeo })
}

/** Toggle an orthographic side view by clicking the X / Y / Z axis pole pill on the 3D gizmo. */
export function toggleAxisViewPreset3d(
  item: ShapeItem,
  axis: 'x' | 'y' | 'z'
): { item: ShapeItem; preset: ViewPreset3d } {
  const cur = detectViewPreset3d(item.geo)
  const preset: ViewPreset3d =
    axis === 'x'
      ? (cur === 'right' ? 'left' : 'right')
      : axis === 'y'
        ? (cur === 'top' ? 'bottom' : 'top')
        : (cur === 'front' ? 'back' : 'front')
  return { item: applyViewPreset3d(item, preset), preset }
}
