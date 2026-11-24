import { MAX_BASE, MIN_BASE, SHAPE_BASES, type ShapeKind } from './shapes'
import type { Quat, ShapeConstruction, ShapeGeometry, Vec2, Vec3 } from './types'
import {
  boundsOfPaths,
  vertexLetter,
  type EvalAngle3d,
  type EvalConstruction,
  type EvalCurve,
  type EvalEdge,
  type EvaluatedShape,
  type EvalVertex
} from './shapeEval'

/** Classic textbook axonometry: ~-30 deg yaw, ~21 deg pitch (front, top and right faces visible). */
export const DEFAULT_ORBIT: readonly [number, number] = [-0.52, 0.36]

/** Row-major 3x3 orthogonal rotation matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1]

const clampSides = (n: number | undefined, def: number): number =>
  n !== undefined && Number.isFinite(n) ? Math.max(MIN_BASE, Math.min(MAX_BASE, Math.round(n))) : def

const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const mid3 = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale3 = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s]
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const unit3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return l > 1e-8 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]
}

/** Normalize a quaternion to unit length (falling back to identity if degenerate). */
export function quatNormalize(q: readonly [number, number, number, number]): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0, 1]
  // Canonicalize sign so w >= 0 (keeps serialization stable across equivalent q and -q).
  const s = (q[3] < 0 ? -1 : 1) / len
  return [q[0] * s, q[1] * s, q[2] * s, q[3] * s]
}

/** Hamilton quaternion product `a * b` (applies rotation `b`, then rotation `a`). */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ]
}

/** Unit quaternion representing a right-handed rotation by `angle` radians around `axis`. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const u = unit3(axis)
  if (u[0] === 0 && u[1] === 0 && u[2] === 0) return [0, 0, 0, 1]
  const half = angle / 2
  const s = Math.sin(half)
  const c = Math.cos(half)
  return quatNormalize([u[0] * s, u[1] * s, u[2] * s, c])
}

/** Convert turntable orbit `[yaw, pitch]` (`R_x(pitch) * R_y(yaw)`) into an exact unit quaternion. */
export function orbitToQuat(yaw: number, pitch: number): Quat {
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2)
  const sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2)
  return quatNormalize(quatMul([sp, 0, 0, cp], [0, sy, 0, cy]))
}

/** Convert a unit quaternion into a row-major 3x3 orthogonal rotation matrix. */
export function quatToMat3(q: Quat): Mat3 {
  const [x, y, z, w] = quatNormalize(q)
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const xw = x * w, yw = y * w, zw = z * w
  return [
    1 - 2 * (yy + zz), 2 * (xy - zw), 2 * (xz + yw),
    2 * (xy + zw), 1 - 2 * (xx + zz), 2 * (yz - xw),
    2 * (xz - yw), 2 * (yz + xw), 1 - 2 * (xx + yy)
  ]
}

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const cleanZero = (n: number): number => (Object.is(n, -0) || Math.abs(n) < 1e-9 ? 0 : n)

/**
 * Extract intuitive [X, Y, Z] Euler angles in degrees from a unit quaternion using
 * `R_z(Z) * R_x(X) * R_y(Y)` (exact superset of turntable `orbit: [yaw, pitch]` with Z = 0).
 */
export function quatToEulerDeg(q: Quat): [x: number, y: number, z: number] {
  const m = quatToMat3(q)
  const sinX = Math.max(-1, Math.min(1, m[7]))
  const rx = Math.asin(sinX)
  const cosX = Math.cos(rx)
  let ry: number
  let rz: number
  if (Math.abs(cosX) > 1e-4) {
    ry = Math.atan2(-m[6], m[8])
    rz = Math.atan2(-m[1], m[4])
  } else {
    rz = 0
    ry = Math.atan2(m[2], m[0])
  }
  return [
    cleanZero(Math.round(rx * RAD_TO_DEG)),
    cleanZero(Math.round(ry * RAD_TO_DEG)),
    cleanZero(Math.round(rz * RAD_TO_DEG))
  ]
}

/** Build a unit quaternion from [X, Y, Z] Euler degrees using `R_z(Z) * R_x(X) * R_y(Y)`. */
export function eulerDegToQuat(xDeg: number, yDeg: number, zDeg: number): Quat {
  const qx = quatFromAxisAngle([1, 0, 0], xDeg * DEG_TO_RAD)
  const qy = quatFromAxisAngle([0, 1, 0], yDeg * DEG_TO_RAD)
  const qz = quatFromAxisAngle([0, 0, 1], zDeg * DEG_TO_RAD)
  return quatNormalize(quatMul(qz, quatMul(qx, qy)))
}

/** True mathematical isometric projection: yaw -45 deg, pitch arcsin(tan(30 deg)) (~35.264 deg). */
export const ISOMETRIC_QUAT: Quat = eulerDegToQuat(Math.asin(Math.tan(Math.PI / 6)) * RAD_TO_DEG, -45, 0)

/** Default real 3D dimensions [w, h, d] derived from the dragged 2D box (ax..bx, ay..by). */
export function defaultDim3(kind: ShapeKind, w: number, h: number): [number, number, number] {
  const bw = Math.max(12, Math.abs(w))
  const bh = Math.max(12, Math.abs(h))
  switch (kind) {
    case 'cube': {
      const m = Math.min(bw, bh)
      return [bw * 0.68, bh * 0.68, m * 0.68]
    }
    case 'sphere': {
      const d = Math.min(bw, bh)
      return [d, d, d]
    }
    case 'cylinder':
    case 'cone':
      return [bw * 0.9, bh * 0.86, bw * 0.9]
    default:
      return [bw * 0.84, bh * 0.84, bw * 0.84]
  }
}

export function effectiveDim3(geo: ShapeGeometry): [number, number, number] {
  if (geo.dim3 && geo.dim3.every((v) => Number.isFinite(v) && v > 0)) return geo.dim3
  return defaultDim3(geo.kind, geo.bx - geo.ax, geo.by - geo.ay)
}

export function effectiveOrbit(geo: ShapeGeometry): [number, number] {
  if (geo.orbit && Number.isFinite(geo.orbit[0]) && Number.isFinite(geo.orbit[1])) return geo.orbit
  return [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]]
}

/** Effective unit quaternion for a 3D ShapeGeometry (`rot3` when set, otherwise `orbit`). */
export function effectiveQuat(geo: ShapeGeometry): Quat {
  if (geo.rot3 && geo.rot3.length === 4 && geo.rot3.every(Number.isFinite)) {
    const len = Math.hypot(geo.rot3[0], geo.rot3[1], geo.rot3[2], geo.rot3[3])
    if (len > 1e-6) return quatNormalize(geo.rot3)
  }
  const [yaw, pitch] = effectiveOrbit(geo)
  return orbitToQuat(yaw, pitch)
}

/** Effective 3x3 orthogonal rotation matrix for a 3D ShapeGeometry. */
export function effectiveRotMat3(geo: ShapeGeometry): Mat3 {
  return quatToMat3(effectiveQuat(geo))
}

export function effectiveSlant3(geo: ShapeGeometry): [number, number] {
  if (geo.slant3 && Number.isFinite(geo.slant3[0]) && Number.isFinite(geo.slant3[1])) return geo.slant3
  return geo.kind === 'obliquePyramid' ? [0.85, 0] : [0, 0]
}

/** Rotate a 3D vector by a 3x3 rotation matrix `m`. */
export function rotate3dMat(p: Vec3, m: Mat3): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2]
  ]
}

/** Orthographic projection of a 3D point rotated by `m` around board `center`, with depth toward camera. */
export function project3dMat(p: Vec3, center: Vec2, m: Mat3): { pos: Vec2; depth: number } {
  const r = rotate3dMat(p, m)
  return { pos: [center[0] + r[0], center[1] - r[1]], depth: r[2] }
}

/** Inverse rotation `m^T * [dx, -dy, 0]`: maps a 2D board delta into local 3D space. */
export function unprojectDelta3dMat(dx: number, dy: number, m: Mat3): Vec3 {
  const rx = dx
  const ry = -dy
  return [
    m[0] * rx + m[3] * ry,
    m[1] * rx + m[4] * ry,
    m[2] * rx + m[5] * ry
  ]
}

/** Rotate a 3D vector by R_x(pitch) * R_y(yaw). */
export function rotate3d(p: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const x1 = p[0] * cy + p[2] * sy
  const y1 = p[1]
  const z1 = -p[0] * sy + p[2] * cy
  return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp]
}

/** Orthographic projection of a 3D point centered at board `(cx, cy)` with depth `rz` toward camera. */
export function project3d(p: Vec3, center: Vec2, yaw: number, pitch: number): { pos: Vec2; depth: number } {
  const r = rotate3d(p, yaw, pitch)
  return { pos: [center[0] + r[0], center[1] - r[1]], depth: r[2] }
}

/** Inverse rotation R_y(-yaw) * R_x(-pitch): maps a 2D screen delta (dx, -dy, 0) into 3D space. */
export function unprojectDelta3d(dx: number, dy: number, yaw: number, pitch: number): Vec3 {
  const rx = dx
  const ry = -dy
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const x1 = rx
  const y1 = ry * cp
  const z1 = -ry * sp
  return [x1 * cy - z1 * sy, y1, x1 * sy + z1 * cy]
}

interface MeshEdgeDef {
  id: string
  from: string
  to: string
  role: 'base' | 'lateral' | 'top'
  faces: number[]
}

/** Area-weighted Newell normal for any 3D polygon (accurate for flat faces AND warped quads). */
function newellNormal3(pts: readonly Vec3[]): Vec3 {
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    nx += (a[1] - b[1]) * (a[2] + b[2])
    ny += (a[2] - b[2]) * (a[0] + b[0])
    nz += (a[0] - b[0]) * (a[1] + b[1])
  }
  return unit3([nx, ny, nz])
}

/** Build a convex polyhedron with exact outward face normals and automatic back-face edge visibility. */
function buildPolyhedron(
  verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[],
  faceVertexIds: string[][],
  edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[],
  center: Vec2,
  rot: Mat3
): { vertices: EvalVertex[]; edges: EvalEdge[]; byId3: Map<string, Vec3>; faceDepths: number[] } {
  const byId3 = new Map(verts3.map((v) => [v.id, v.pos3]))
  // Compute centroid of all vertices so outward face normals are guaranteed even for inverted/oblique solids.
  let gx = 0, gy = 0, gz = 0
  for (const v of verts3) { gx += v.pos3[0]; gy += v.pos3[1]; gz += v.pos3[2] }
  const centroid: Vec3 = [gx / verts3.length, gy / verts3.length, gz / verts3.length]

  const faceDepths: number[] = faceVertexIds.map((f) => {
    if (f.length < 3) return 1
    const pts = f.map((id) => byId3.get(id)!)
    let n = newellNormal3(pts)
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) {
      n = unit3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])))
    }
    let fx = 0, fy = 0, fz = 0
    for (const p of pts) { fx += p[0]; fy += p[1]; fz += p[2] }
    const fc: Vec3 = [fx / pts.length, fy / pts.length, fz / pts.length]
    if (dot3(n, sub3(fc, centroid)) < 0) n = scale3(n, -1)
    return rotate3dMat(n, rot)[2]
  })
  const faceVisible: boolean[] = faceDepths.map((z) => z > 1e-5)

  // Map undirected vertex pairs to adjacent face indices.
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const edgeFaces = new Map<string, number[]>()
  faceVertexIds.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const k = pairKey(f[i], f[(i + 1) % f.length])
      const list = edgeFaces.get(k)
      if (list) list.push(fi)
      else edgeFaces.set(k, [fi])
    }
  })

  const fullEdges: MeshEdgeDef[] = edgeDefs.map((e) => ({ ...e, faces: edgeFaces.get(pairKey(e.from, e.to)) ?? [] }))
  const visibleVerts = new Set<string>()
  const edges: EvalEdge[] = fullEdges.map((e) => {
    const pA = byId3.get(e.from)!
    const pB = byId3.get(e.to)!
    const visible = e.faces.length === 0 || e.faces.some((fi) => faceVisible[fi])
    if (visible) {
      visibleVerts.add(e.from)
      visibleVerts.add(e.to)
    }
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      a: project3dMat(pA, center, rot).pos,
      b: project3dMat(pB, center, rot).pos,
      length: dist3(pA, pB),
      hidden: !visible,
      role: e.role
    }
  })

  const vertices: EvalVertex[] = verts3.map((v) => {
    const pr = project3dMat(v.pos3, center, rot)
    return {
      id: v.id,
      pos: pr.pos,
      pos3: v.pos3,
      depth: pr.depth,
      defaultLabel: v.defaultLabel,
      role: v.role,
      visible: v.role === 'center' ? true : visibleVerts.has(v.id)
    }
  })

  return { vertices, edges, byId3, faceDepths }
}

/** Split a closed 3D curve into contiguous visible (solid) and hidden (dashed) arcs based on predicate. */
function splitCurveByVisibility(
  id: string,
  samples: { pos: Vec2; visible: boolean }[],
  length?: number
): EvalCurve[] {
  if (samples.length < 2) return []
  const n = samples.length
  const allSame = samples.every((s) => s.visible === samples[0].visible)
  if (allSame) {
    const pts = samples.map((s) => s.pos)
    pts.push(samples[0].pos)
    return [{ id, pts, closed: true, dash: samples[0].visible ? undefined : 'dashed', length }]
  }
  // Find first transition index so each run is a single clean polyline without seam split.
  let start = 0
  for (let i = 0; i < n; i++) {
    if (samples[i].visible !== samples[(i - 1 + n) % n].visible) {
      start = i
      break
    }
  }
  const curves: EvalCurve[] = []
  let runPts: Vec2[] = [samples[start].pos]
  let runVis = samples[start].visible
  for (let step = 1; step <= n; step++) {
    const idx = (start + step) % n
    const s = samples[idx]
    runPts.push(s.pos)
    if (s.visible !== runVis || step === n) {
      curves.push({
        id: curves.length === 0 ? id : `${id}_${curves.length}`,
        pts: runPts,
        dash: runVis ? undefined : 'dashed',
        ...(curves.length === 0 && length !== undefined ? { length } : {})
      })
      runPts = [s.pos]
      runVis = s.visible
    }
  }
  return curves
}

/** 3D-projected right-angle L-mark at `foot` along unit directions `u1` and `u2` of length `m`. */
function rightAngleMark3d(foot: Vec3, u1: Vec3, u2: Vec3, m: number, center: Vec2, rot: Mat3): Vec2[] {
  const p1 = project3dMat(add3(foot, scale3(u1, m)), center, rot).pos
  const pc = project3dMat(add3(add3(foot, scale3(u1, m)), scale3(u2, m)), center, rot).pos
  const p2 = project3dMat(add3(foot, scale3(u2, m)), center, rot).pos
  return [p1, pc, p2]
}

/** Build a true 3D-projected geometric angle mark (foreshortened 90 deg L-mark or planar 3D arc) at `origin3`. */
function angle3dFromRays(origin3: Vec3, pA3: Vec3, pB3: Vec3, center: Vec2, rot: Mat3): EvalAngle3d | null {
  const va = sub3(pA3, origin3)
  const vb = sub3(pB3, origin3)
  const la = dist3(origin3, pA3)
  const lb = dist3(origin3, pB3)
  const minLen = Math.min(la, lb)
  if (minLen < 1e-4) return null
  const u1 = scale3(va, 1 / la)
  const u2 = scale3(vb, 1 / lb)
  const cosA = Math.max(-1, Math.min(1, dot3(u1, u2)))
  const rad = Math.acos(cosA)
  const deg = rad * RAD_TO_DEG
  if (!Number.isFinite(deg) || deg < 1 || deg > 179) return null

  const o2 = project3dMat(origin3, center, rot).pos
  const a2 = project3dMat(add3(origin3, scale3(u1, 20)), center, rot).pos
  const b2 = project3dMat(add3(origin3, scale3(u2, 20)), center, rot).pos
  const d1x = a2[0] - o2[0], d1y = a2[1] - o2[1]
  const d2x = b2[0] - o2[0], d2y = b2[1] - o2[1]
  const projArea = Math.abs(d1x * d2y - d1y * d2x) / 400
  const bis3 = unit3(add3(u1, u2))

  if (Math.abs(deg - 90) <= 0.6) {
    const m = Math.min(18, Math.max(8, minLen * 0.18))
    const markPts = projArea >= 0.08 && m >= 4 && m < minLen * 0.45
      ? rightAngleMark3d(origin3, u1, u2, m, center, rot)
      : []
    const labelR = Math.min(minLen * 0.44, Math.max(m * 1.9, 24))
    const labelPos = project3dMat(add3(origin3, scale3(bis3, labelR)), center, rot).pos
    return { deg: 90, markPts, labelPos }
  }

  const e1 = u1
  const e2 = unit3(sub3(u2, scale3(u1, cosA)))
  const r = Math.min(24, Math.max(11, minLen * 0.22))
  const markPts: Vec2[] = []
  if (projArea >= 0.08 && r < minLen * 0.48) {
    const steps = Math.max(8, Math.ceil(deg / 8))
    for (let i = 0; i <= steps; i++) {
      const t = (rad * i) / steps
      const pt3 = add3(origin3, add3(scale3(e1, Math.cos(t) * r), scale3(e2, Math.sin(t) * r)))
      markPts.push(project3dMat(pt3, center, rot).pos)
    }
  }
  const labelR = Math.min(minLen * 0.5, r + 16)
  const labelPos = project3dMat(add3(origin3, scale3(bis3, labelR)), center, rot).pos
  return { deg, markPts, labelPos }
}

/** Pick the two neighbor vertex ids of `vId` inside `face` (returns null if `vId` is not in `face`). */
function faceNeighbors(face: readonly string[], vId: string): [string, string] | null {
  const idx = face.indexOf(vId)
  if (idx < 0 || face.length < 3) return null
  return [face[(idx - 1 + face.length) % face.length], face[(idx + 1) % face.length]]
}

/** Attach true 3D angle metadata to vertex `v` from neighbor vertex ids `aId` and `bId`. */
function attachVertexAngle3d(
  v: EvalVertex,
  a3: Vec3 | undefined,
  b3: Vec3 | undefined,
  center: Vec2,
  rot: Mat3
): void {
  if (!v.pos3 || !a3 || !b3) return
  const ang = angle3dFromRays(v.pos3, a3, b3, center, rot)
  if (!ang) return
  v.angleDeg = ang.deg
  v.angle3d = ang
}

function evaluate3dConstruction(
  c: ShapeConstruction,
  geo: ShapeGeometry,
  dim: [number, number, number],
  slant: [number, number],
  vertices: readonly EvalVertex[],
  edges: readonly EvalEdge[],
  byId3: Map<string, Vec3>,
  center: Vec2,
  rot: Mat3,
  size: number
): EvalConstruction | null {
  const [w, h, d] = dim
  const rx = w / 2, rz = d / 2
  const proj = (p: Vec3): Vec2 => project3dMat(p, center, rot).pos
  const point3 = (id: string): Vec3 | null => {
    const v = byId3.get(id)
    if (v) return v
    if (id.startsWith('mid:')) {
      const e = edges.find((x) => x.id === id.slice(4))
      if (!e) return null
      const ea = byId3.get(e.from)
      const eb = byId3.get(e.to)
      return ea && eb ? mid3(ea, eb) : null
    }
    return null
  }

  switch (c.kind) {
    case 'altitude': {
      const from3 = byId3.get(c.from) ?? byId3.get('apex')
      if (!from3) return null
      let foot3: Vec3 = [from3[0], -h / 2, from3[2]]
      let uUp: Vec3 = [0, from3[1] >= foot3[1] ? 1 : -1, 0]
      let altLen = Math.abs(from3[1] - foot3[1])
      let baseDir = unit3([foot3[0] === 0 && foot3[2] === 0 ? 1 : -foot3[0], 0, foot3[0] === 0 && foot3[2] === 0 ? 0 : -foot3[2]])
      if (geo.vertices3) {
        const basePts = vertices.filter((v) => v.id.startsWith('b') && v.pos3).map((v) => v.pos3!)
        if (basePts.length >= 3) {
          let bx = 0, by = 0, bz = 0
          for (const p of basePts) { bx += p[0]; by += p[1]; bz += p[2] }
          const cBase: Vec3 = [bx / basePts.length, by / basePts.length, bz / basePts.length]
          let nBase = newellNormal3(basePts)
          if (nBase[0] !== 0 || nBase[1] !== 0 || nBase[2] !== 0) {
            const signedH = dot3(sub3(from3, cBase), nBase)
            if (signedH < 0) nBase = scale3(nBase, -1)
            altLen = Math.abs(signedH)
            foot3 = sub3(from3, scale3(nBase, altLen))
            uUp = nBase
            // Pick a unit direction lying inside the tilted base plane for the 90 deg foot square.
            const toBase = sub3(basePts[0], foot3)
            const inPlane = sub3(toBase, scale3(nBase, dot3(toBase, nBase)))
            baseDir = unit3(inPlane)
            if (baseDir[0] === 0 && baseDir[1] === 0 && baseDir[2] === 0) {
              const altRef: Vec3 = Math.abs(nBase[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]
              baseDir = unit3(cross3(nBase, altRef))
            }
          }
        }
      }
      if (altLen < 1e-4) return null
      const pFrom = proj(from3)
      const pFoot = proj(foot3)
      const segments: EvalConstruction['segments'] = [{ pts: [pFrom, pFoot], dash: 'dashed' }]
      const m = Math.min(12, Math.max(size * 2.5, altLen * 0.1))
      segments.push({ pts: rightAngleMark3d(foot3, uUp, baseDir, m, center, rot), thin: true })
      return {
        id: c.id,
        kind: c.kind,
        segments,
        dots: [{ pos: pFoot }],
        length: altLen,
        lengthAnchor: [pFrom, pFoot]
      }
    }
    case 'apothem': {
      const apex3 = byId3.get('apex')
      const edge = edges.find((e) => e.id === c.edge)
      if (!apex3 || !edge) return null
      const a3 = byId3.get(edge.from)
      const b3 = byId3.get(edge.to)
      if (!a3 || !b3) return null
      const m3 = mid3(a3, b3)
      const len = dist3(apex3, m3)
      const pApex = proj(apex3)
      const pMid = proj(m3)
      const segments: EvalConstruction['segments'] = [{ pts: [pApex, pMid], dash: 'dashed' }]
      const uEdge = unit3(sub3(b3, a3))
      const uSlant = unit3(sub3(apex3, m3))
      const mk = Math.min(11, Math.max(size * 2.4, len * 0.1))
      segments.push({ pts: rightAngleMark3d(m3, uSlant, uEdge, mk, center, rot), thin: true })
      return {
        id: c.id,
        kind: c.kind,
        segments,
        dots: [{ pos: pMid }],
        length: len,
        lengthAnchor: [pApex, pMid]
      }
    }
    case 'diagonal': {
      const a3 = point3(c.from)
      const b3 = point3(c.to)
      if (!a3 || !b3) return null
      const pa = proj(a3), pb = proj(b3)
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [pa, pb], dash: 'dashed' }],
        length: dist3(a3, b3),
        lengthAnchor: [pa, pb]
      }
    }
    case 'midpoint': {
      const edge = edges.find((e) => e.id === c.edge)
      if (!edge) return null
      const a3 = byId3.get(edge.from)
      const b3 = byId3.get(edge.to)
      if (!a3 || !b3) return null
      return { id: c.id, kind: c.kind, segments: [], dots: [{ pos: proj(mid3(a3, b3)) }] }
    }
    case 'center': {
      const o3 = byId3.get('center') ?? [0, geo.kind === 'sphere' ? 0 : -h / 2, 0]
      const po = proj(o3)
      return {
        id: c.id,
        kind: c.kind,
        segments: [],
        dots: [{ pos: po }],
        label: { text: 'O', pos: po, awayFrom: [po[0], po[1] - 18] }
      }
    }
    case 'axis': {
      const oBot = byId3.get('center') ?? [0, -h / 2, 0]
      const oTop = byId3.get('topCenter') ?? byId3.get('apex') ?? [slant[0] * rx, h / 2, slant[1] * rz]
      const pBot = proj(oBot)
      const pTop = proj(oTop)
      const len = dist3(oBot, oTop)
      const segments: EvalConstruction['segments'] = [{ pts: [pBot, pTop], dash: 'dashed' }]
      const m = Math.min(11, Math.max(size * 2.4, h * 0.1))
      if (Math.abs(slant[0]) < 1e-3 && Math.abs(slant[1]) < 1e-3) {
        segments.push({ pts: rightAngleMark3d(oBot, [0, 1, 0], [1, 0, 0], m, center, rot), thin: true })
      }
      return {
        id: c.id,
        kind: c.kind,
        segments,
        dots: [{ pos: pBot }, ...(byId3.has('topCenter') ? [{ pos: pTop }] : [])],
        length: len,
        lengthAnchor: [pBot, pTop]
      }
    }
    case 'radius': {
      const o3 = byId3.get('center') ?? [0, geo.kind === 'sphere' ? 0 : -h / 2, 0]
      const ang = c.angle ?? 0
      const rim3: Vec3 =
        geo.kind === 'sphere'
          ? [rx * Math.cos(ang), 0, rz * Math.sin(ang)]
          : [rx * Math.cos(ang), -h / 2, rz * Math.sin(ang)]
      const po = proj(o3)
      const pr = proj(rim3)
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [po, pr], dash: 'dashed' }],
        dots: [{ pos: po }],
        length: dist3(o3, rim3),
        lengthAnchor: [po, pr]
      }
    }
    case 'section': {
      if (geo.kind === 'cone') {
        const apex3 = byId3.get('apex') ?? [slant[0] * rx, h / 2, slant[1] * rz]
        const pL = proj([-rx, -h / 2, 0])
        const pR = proj([rx, -h / 2, 0])
        const pS = proj(apex3)
        return {
          id: c.id,
          kind: c.kind,
          fills: [{ pts: [pL, pS, pR], opacity: 0.14 }],
          segments: [{ pts: [pL, pS, pR, pL], dash: 'dashed', thin: true }]
        }
      }
      if (geo.kind === 'cylinder') {
        const sx = slant[0] * rx, sz = slant[1] * rz
        const pBL = proj([-rx, -h / 2, 0])
        const pBR = proj([rx, -h / 2, 0])
        const pTR = proj([rx + sx, h / 2, sz])
        const pTL = proj([-rx + sx, h / 2, sz])
        return {
          id: c.id,
          kind: c.kind,
          fills: [{ pts: [pBL, pBR, pTR, pTL], opacity: 0.14 }],
          segments: [{ pts: [pBL, pBR, pTR, pTL, pBL], dash: 'dashed', thin: true }]
        }
      }
      return null
    }
    case 'meridian': {
      if (geo.kind !== 'sphere') return null
      const r = Math.min(rx, h / 2)
      const n = 72
      const samples = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2
        const p = project3dMat([r * Math.cos(a), r * Math.sin(a), 0], center, rot)
        return { pos: p.pos, visible: p.depth >= -1e-4 }
      })
      const curves = splitCurveByVisibility(c.id, samples)
      return {
        id: c.id,
        kind: c.kind,
        segments: curves.map((cr) => ({ pts: cr.pts, dash: cr.dash, thin: true }))
      }
    }
    default: {
      void vertices
      return null
    }
  }
}

export function evaluate3dShape(geo: ShapeGeometry, constructions: readonly ShapeConstruction[], size: number): EvaluatedShape {
  const center: Vec2 = [(geo.ax + geo.bx) / 2, (geo.ay + geo.by) / 2]
  const dim = effectiveDim3(geo)
  const [w, h, d] = dim
  const rx = w / 2, ry = h / 2, rz = d / 2
  const rot = effectiveRotMat3(geo)
  const slant = effectiveSlant3(geo)
  const proj = (p: Vec3): Vec2 => project3dMat(p, center, rot).pos
  const applyOverrides = (list: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[]): void => {
    if (!geo.vertices3) return
    for (const v of list) {
      const ov = geo.vertices3[v.id]
      if (ov) v.pos3 = [ov[0], ov[1], ov[2]]
    }
  }
  const avgPts = (pts: readonly Vec3[], fallback: Vec3): Vec3 => {
    if (!pts.length) return fallback
    let x = 0, y = 0, z = 0
    for (const p of pts) { x += p[0]; y += p[1]; z += p[2] }
    return [x / pts.length, y / pts.length, z / pts.length]
  }

  let vertices: EvalVertex[] = []
  let edges: EvalEdge[] = []
  let curves: EvalCurve[] = []
  let byId3 = new Map<string, Vec3>()

  if (geo.kind === 'cube') {
    const verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[] = [
      { id: 'b0', pos3: [-rx, -ry, rz], defaultLabel: 'A', role: 'corner' },
      { id: 'b1', pos3: [rx, -ry, rz], defaultLabel: 'B', role: 'corner' },
      { id: 'b2', pos3: [rx, -ry, -rz], defaultLabel: 'C', role: 'corner' },
      { id: 'b3', pos3: [-rx, -ry, -rz], defaultLabel: 'D', role: 'corner' },
      { id: 't0', pos3: [-rx, ry, rz], defaultLabel: 'A₁', role: 'corner' },
      { id: 't1', pos3: [rx, ry, rz], defaultLabel: 'B₁', role: 'corner' },
      { id: 't2', pos3: [rx, ry, -rz], defaultLabel: 'C₁', role: 'corner' },
      { id: 't3', pos3: [-rx, ry, -rz], defaultLabel: 'D₁', role: 'corner' }
    ]
    applyOverrides(verts3)
    const faces = [
      ['b0', 'b3', 'b2', 'b1'], // bottom
      ['t0', 't1', 't2', 't3'], // top
      ['b0', 'b1', 't1', 't0'], // front
      ['b2', 'b3', 't3', 't2'], // back
      ['b1', 'b2', 't2', 't1'], // right
      ['b3', 'b0', 't0', 't3'] // left
    ]
    const edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[] = [
      { id: 'eb0', from: 'b0', to: 'b1', role: 'base' },
      { id: 'eb1', from: 'b1', to: 'b2', role: 'base' },
      { id: 'eb2', from: 'b2', to: 'b3', role: 'base' },
      { id: 'eb3', from: 'b3', to: 'b0', role: 'base' },
      { id: 'et0', from: 't0', to: 't1', role: 'top' },
      { id: 'et1', from: 't1', to: 't2', role: 'top' },
      { id: 'et2', from: 't2', to: 't3', role: 'top' },
      { id: 'et3', from: 't3', to: 't0', role: 'top' },
      { id: 'el0', from: 'b0', to: 't0', role: 'lateral' },
      { id: 'el1', from: 'b1', to: 't1', role: 'lateral' },
      { id: 'el2', from: 'b2', to: 't2', role: 'lateral' },
      { id: 'el3', from: 'b3', to: 't3', role: 'lateral' }
    ]
    const mesh = buildPolyhedron(verts3, faces, edgeDefs, center, rot)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', avgPts(verts3.slice(0, 4).map((v) => v.pos3), [0, -ry, 0]))
    byId3.set('topCenter', avgPts(verts3.slice(4, 8).map((v) => v.pos3), [0, ry, 0]))
    // Cube corners: pick the most front-facing face meeting each corner so its angle mark never collapses edge-on.
    for (const v of vertices) {
      let bestFi = -1
      let bestDepth = -Infinity
      for (let fi = 0; fi < faces.length; fi++) {
        if (!faces[fi].includes(v.id)) continue
        if (mesh.faceDepths[fi] > bestDepth) {
          bestDepth = mesh.faceDepths[fi]
          bestFi = fi
        }
      }
      if (bestFi >= 0) {
        const pair = faceNeighbors(faces[bestFi], v.id)
        if (pair) attachVertexAngle3d(v, byId3.get(pair[0]), byId3.get(pair[1]), center, rot)
      }
    }
  } else if (geo.kind === 'prism') {
    const n = clampSides(geo.sides, SHAPE_BASES.prism!.def)
    const sx = slant[0] * rx, sz = slant[1] * rz
    const off = Math.PI / 2 - 0.15
    const verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[] = []
    for (let i = 0; i < n; i++) {
      const a = off - (i / n) * Math.PI * 2
      verts3.push({ id: `b${i}`, pos3: [Math.cos(a) * rx, -ry, Math.sin(a) * rz], defaultLabel: vertexLetter(i), role: 'corner' })
    }
    for (let i = 0; i < n; i++) {
      const b = verts3[i].pos3
      verts3.push({ id: `t${i}`, pos3: [b[0] + sx, ry, b[2] + sz], defaultLabel: vertexLetter(i, '₁'), role: 'corner' })
    }
    applyOverrides(verts3)
    const bottomFace = Array.from({ length: n }, (_, i) => `b${n - 1 - i}`)
    const topFace = Array.from({ length: n }, (_, i) => `t${i}`)
    const sideFaces = Array.from({ length: n }, (_, i) => [`b${i}`, `b${(i + 1) % n}`, `t${(i + 1) % n}`, `t${i}`])
    const edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[] = [
      ...Array.from({ length: n }, (_, i) => ({ id: `eb${i}`, from: `b${i}`, to: `b${(i + 1) % n}`, role: 'base' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `et${i}`, from: `t${i}`, to: `t${(i + 1) % n}`, role: 'top' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `el${i}`, from: `b${i}`, to: `t${i}`, role: 'lateral' as const }))
    ]
    const mesh = buildPolyhedron(verts3, [bottomFace, topFace, ...sideFaces], edgeDefs, center, rot)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', avgPts(verts3.slice(0, n).map((v) => v.pos3), [0, -ry, 0]))
    byId3.set('topCenter', avgPts(verts3.slice(n, 2 * n).map((v) => v.pos3), [sx, ry, sz]))
    // Prism base & top vertices carry the true interior angle of the base/top n-gon.
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n
      const next = (i + 1) % n
      attachVertexAngle3d(vertices[i], byId3.get(`b${prev}`), byId3.get(`b${next}`), center, rot)
      attachVertexAngle3d(vertices[n + i], byId3.get(`t${prev}`), byId3.get(`t${next}`), center, rot)
    }
  } else if (geo.kind === 'pyramid' || geo.kind === 'obliquePyramid') {
    const n = clampSides(geo.sides, SHAPE_BASES[geo.kind]!.def)
    const off = Math.PI / 2 - 0.15
    const verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[] = []
    for (let i = 0; i < n; i++) {
      const a = off - (i / n) * Math.PI * 2
      verts3.push({ id: `b${i}`, pos3: [Math.cos(a) * rx, -ry, Math.sin(a) * rz], defaultLabel: vertexLetter(i), role: 'corner' })
    }
    verts3.push({ id: 'apex', pos3: [slant[0] * rx, ry, slant[1] * rz], defaultLabel: 'S', role: 'apex' })
    applyOverrides(verts3)
    const bottomFace = Array.from({ length: n }, (_, i) => `b${n - 1 - i}`)
    const sideFaces = Array.from({ length: n }, (_, i) => [`b${i}`, `b${(i + 1) % n}`, 'apex'])
    const edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[] = [
      ...Array.from({ length: n }, (_, i) => ({ id: `eb${i}`, from: `b${i}`, to: `b${(i + 1) % n}`, role: 'base' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `el${i}`, from: 'apex', to: `b${i}`, role: 'lateral' as const }))
    ]
    const mesh = buildPolyhedron(verts3, [bottomFace, ...sideFaces], edgeDefs, center, rot)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', avgPts(verts3.slice(0, n).map((v) => v.pos3), [0, -ry, 0]))
    // Pyramid base corners show base polygon interior angles; apex S shows the front-most lateral face apex angle.
    for (let i = 0; i < n; i++) {
      attachVertexAngle3d(vertices[i], byId3.get(`b${(i - 1 + n) % n}`), byId3.get(`b${(i + 1) % n}`), center, rot)
    }
    let bestSide = 0
    let bestDepth = -Infinity
    for (let i = 0; i < n; i++) {
      const dSide = mesh.faceDepths[1 + i]
      if (dSide > bestDepth) {
        bestDepth = dSide
        bestSide = i
      }
    }
    attachVertexAngle3d(vertices[n], byId3.get(`b${bestSide}`), byId3.get(`b${(bestSide + 1) % n}`), center, rot)
  } else if (geo.kind === 'cylinder') {
    const sx = slant[0] * rx, sz = slant[1] * rz
    const botC3: Vec3 = [0, -ry, 0]
    const topC3: Vec3 = [sx, ry, sz]
    const botC = proj(botC3)
    const topC = proj(topC3)
    const u2: Vec2 = [proj([rx, 0, 0])[0] - center[0], proj([rx, 0, 0])[1] - center[1]]
    const v2: Vec2 = [proj([0, 0, rz])[0] - center[0], proj([0, 0, rz])[1] - center[1]]
    const ax2: Vec2 = [topC[0] - botC[0], topC[1] - botC[1]]
    const axLen = Math.hypot(ax2[0], ax2[1])
    const headOn = axLen < 1e-2
    const nx = -ax2[1], ny = ax2[0]
    const du = u2[0] * nx + u2[1] * ny
    const dv = v2[0] * nx + v2[1] * ny
    const t1 = headOn || Math.hypot(du, dv) < 1e-6 ? 0 : Math.atan2(dv, du)
    const t2 = t1 + Math.PI
    const ptBot = (t: number): Vec3 => [rx * Math.cos(t), -ry, rz * Math.sin(t)]
    const ptTop = (t: number): Vec3 => [rx * Math.cos(t) + sx, ry, rz * Math.sin(t) + sz]
    const topFront = rotate3dMat([0, 1, 0], rot)[2] >= 0
    const n = 72
    const botSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3dMat(ptBot(t), center, rot)
      if (!topFront) return { pos: p.pos, visible: true }
      if (headOn) return { pos: p.pos, visible: false }
      const c1 = project3dMat(ptBot(t1), center, rot)
      const c2 = project3dMat(ptBot(t2), center, rot)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const ref = project3dMat(ptBot(t1 + Math.PI / 2), center, rot)
      const refCross = (c2.pos[0] - c1.pos[0]) * (ref.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (ref.pos[0] - c1.pos[0])
      const frontHalf = (cross * refCross >= 0) === (ref.depth >= (c1.depth + c2.depth) / 2)
      return { pos: p.pos, visible: frontHalf }
    })
    const topSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3dMat(ptTop(t), center, rot)
      if (topFront) return { pos: p.pos, visible: true }
      if (headOn) return { pos: p.pos, visible: false }
      const c1 = project3dMat(ptTop(t1), center, rot)
      const c2 = project3dMat(ptTop(t2), center, rot)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const ref = project3dMat(ptTop(t1 + Math.PI / 2), center, rot)
      const refCross = (c2.pos[0] - c1.pos[0]) * (ref.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (ref.pos[0] - c1.pos[0])
      const frontHalf = (cross * refCross >= 0) === (ref.depth >= (c1.depth + c2.depth) / 2)
      return { pos: p.pos, visible: frontHalf }
    })
    curves = [
      ...splitCurveByVisibility('base', botSamples, rx),
      ...splitCurveByVisibility('top', topSamples, rx)
    ]
    const b1 = ptBot(t1), b2 = ptBot(t2), u1 = ptTop(t1), u2p = ptTop(t2)
    byId3 = new Map<string, Vec3>([
      ['center', botC3],
      ['topCenter', topC3],
      ['b0', b1],
      ['b1', b2],
      ['t0', u1],
      ['t1', u2p]
    ])
    const pVert = (id: string, pos3: Vec3, defaultLabel: string, role: EvalVertex['role']): EvalVertex => {
      const pr = project3dMat(pos3, center, rot)
      return { id, pos: pr.pos, pos3, depth: pr.depth, defaultLabel, role, visible: true }
    }
    vertices = [
      pVert('center', botC3, 'O', 'center'),
      pVert('topCenter', topC3, 'O₁', 'apex'),
      pVert('b0', b1, 'A', 'cardinal'),
      pVert('b1', b2, 'B', 'cardinal'),
      pVert('t0', u1, 'A₁', 'cardinal'),
      pVert('t1', u2p, 'B₁', 'cardinal')
    ]
    if (!headOn) {
      edges = [
        { id: 'el0', from: 'b0', to: 't0', a: proj(b1), b: proj(u1), length: dist3(b1, u1), role: 'lateral' },
        { id: 'el1', from: 'b1', to: 't1', a: proj(b2), b: proj(u2p), length: dist3(b2, u2p), role: 'lateral' }
      ]
    }
  } else if (geo.kind === 'cone') {
    const botC3: Vec3 = [0, -ry, 0]
    const apex3: Vec3 = [slant[0] * rx, ry, slant[1] * rz]
    const botC = proj(botC3)
    const apex2 = proj(apex3)
    const u2: Vec2 = [proj([rx, 0, 0])[0] - center[0], proj([rx, 0, 0])[1] - center[1]]
    const v2: Vec2 = [proj([0, 0, rz])[0] - center[0], proj([0, 0, rz])[1] - center[1]]
    const ptBot = (t: number): Vec3 => [rx * Math.cos(t), -ry, rz * Math.sin(t)]
    // Express (apex2 - botC) in the projected ellipse's (u2, v2) basis to get exact tangent angles.
    const det = u2[0] * v2[1] - u2[1] * v2[0]
    const dx = apex2[0] - botC[0], dy = apex2[1] - botC[1]
    const baseVisible = rotate3dMat([0, -1, 0], rot)[2] > 1e-5
    const n = 72
    let t1 = 0, t2 = Math.PI
    let hasTangents = false
    if (Math.abs(det) > 1e-4) {
      const au = (dx * v2[1] - dy * v2[0]) / det
      const av = (u2[0] * dy - u2[1] * dx) / det
      const dist = Math.hypot(au, av)
      if (dist > 1.005) {
        hasTangents = true
        const theta = Math.atan2(av, au)
        const alpha = Math.acos(1 / dist)
        t1 = theta + alpha
        t2 = theta - alpha
      }
    } else {
      // Edge-on base circle at any roll angle: find the two extreme endpoints along the collapsed base line.
      hasTangents = true
      const uLen = Math.hypot(u2[0], u2[1])
      const vLen = Math.hypot(v2[0], v2[1])
      const dir: Vec2 = uLen >= vLen
        ? (uLen > 1e-6 ? [u2[0] / uLen, u2[1] / uLen] : [1, 0])
        : (vLen > 1e-6 ? [v2[0] / vLen, v2[1] / vLen] : [1, 0])
      const a0 = Math.atan2(v2[0] * dir[0] + v2[1] * dir[1], u2[0] * dir[0] + u2[1] * dir[1])
      t1 = a0
      t2 = a0 + Math.PI
    }
    const botSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3dMat(ptBot(t), center, rot)
      if (baseVisible || !hasTangents) return { pos: p.pos, visible: true }
      const c1 = project3dMat(ptBot(t1), center, rot)
      const c2 = project3dMat(ptBot(t2), center, rot)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const midT = (t1 + t2) / 2
      const ref = project3dMat(ptBot(midT), center, rot)
      const refCross = (c2.pos[0] - c1.pos[0]) * (ref.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (ref.pos[0] - c1.pos[0])
      const frontHalf = (cross * refCross >= 0) === (ref.depth >= (c1.depth + c2.depth) / 2)
      return { pos: p.pos, visible: frontHalf }
    })
    curves = splitCurveByVisibility('base', botSamples, rx)
    const b1 = ptBot(t1), b2 = ptBot(t2)
    byId3 = new Map<string, Vec3>([
      ['center', botC3],
      ['apex', apex3],
      ['b0', b1],
      ['b1', b2]
    ])
    const pVert = (id: string, pos3: Vec3, defaultLabel: string, role: EvalVertex['role']): EvalVertex => {
      const pr = project3dMat(pos3, center, rot)
      return { id, pos: pr.pos, pos3, depth: pr.depth, defaultLabel, role, visible: true }
    }
    vertices = [
      pVert('center', botC3, 'O', 'center'),
      pVert('apex', apex3, 'S', 'apex'),
      pVert('b0', b1, 'A', 'cardinal'),
      pVert('b1', b2, 'B', 'cardinal')
    ]
    // Cone apex opening angle between the two silhouette generatrices (or diametric rim points when viewed from above).
    attachVertexAngle3d(
      vertices[1],
      hasTangents ? b1 : [-rx, -ry, 0],
      hasTangents ? b2 : [rx, -ry, 0],
      center,
      rot
    )
    if (hasTangents) {
      edges = [
        { id: 'el0', from: 'apex', to: 'b0', a: apex2, b: proj(b1), length: dist3(apex3, b1), role: 'lateral' },
        { id: 'el1', from: 'apex', to: 'b1', a: apex2, b: proj(b2), length: dist3(apex3, b2), role: 'lateral' }
      ]
    }
  } else if (geo.kind === 'sphere') {
    const r = Math.min(rx, ry)
    const n = 96
    const outer: Vec2[] = Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]
    })
    const eqSamples = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2
      const p = project3dMat([r * Math.cos(a), 0, r * Math.sin(a)], center, rot)
      return { pos: p.pos, visible: p.depth >= -1e-4 }
    })
    curves = [{ id: 'outer', pts: outer, closed: true, length: r }, ...splitCurveByVisibility('equator', eqSamples)]
    const rim3: Vec3 = [r, 0, 0]
    const top3: Vec3 = [0, r, 0]
    byId3 = new Map<string, Vec3>([
      ['center', [0, 0, 0]],
      ['top', top3],
      ['rim0', rim3]
    ])
    const pTop = project3dMat(top3, center, rot)
    const pRim = project3dMat(rim3, center, rot)
    vertices = [
      { id: 'center', pos: center, pos3: [0, 0, 0], depth: 0, defaultLabel: 'O', role: 'center', visible: true },
      { id: 'top', pos: pTop.pos, pos3: top3, depth: pTop.depth, defaultLabel: 'N', role: 'cardinal', visible: true },
      { id: 'rim0', pos: pRim.pos, pos3: rim3, depth: pRim.depth, defaultLabel: 'A', role: 'cardinal', visible: true }
    ]
  }

  const evalCons = constructions
    .map((c) => evaluate3dConstruction(c, geo, dim, slant, vertices, edges, byId3, center, rot, size))
    .filter((x): x is EvalConstruction => !!x)

  const hitPaths: Vec2[][] = [
    ...edges.map((e): Vec2[] => [e.a, e.b]),
    ...curves.map((c) => c.pts),
    ...evalCons.flatMap((c) => c.segments.map((s) => s.pts))
  ]

  return {
    is3D: true,
    center,
    vertices,
    edges,
    curves,
    constructions: evalCons,
    decorations: [],
    hitPaths,
    bounds: boundsOfPaths(hitPaths, center)
  }
}
