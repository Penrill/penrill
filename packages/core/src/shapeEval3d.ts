import { MAX_BASE, MIN_BASE, SHAPE_BASES, type ShapeKind } from './shapes'
import type { ShapeConstruction, ShapeGeometry, Vec2, Vec3 } from './types'
import { boundsOfPaths, vertexLetter, type EvalConstruction, type EvalCurve, type EvalEdge, type EvaluatedShape, type EvalVertex } from './shapeEval'

/** Classic textbook axonometry: ~-30 deg yaw, ~21 deg pitch (front, top and right faces visible). */
export const DEFAULT_ORBIT: readonly [number, number] = [-0.52, 0.36]

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

export function effectiveSlant3(geo: ShapeGeometry): [number, number] {
  if (geo.slant3 && Number.isFinite(geo.slant3[0]) && Number.isFinite(geo.slant3[1])) return geo.slant3
  return geo.kind === 'obliquePyramid' ? [0.85, 0] : [0, 0]
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

/** Build a convex polyhedron with exact outward face normals and automatic back-face edge visibility. */
function buildPolyhedron(
  verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[],
  faceVertexIds: string[][],
  edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[],
  center: Vec2,
  yaw: number,
  pitch: number
): { vertices: EvalVertex[]; edges: EvalEdge[]; byId3: Map<string, Vec3> } {
  const byId3 = new Map(verts3.map((v) => [v.id, v.pos3]))
  // Compute centroid of all vertices so outward face normals are guaranteed even for inverted/oblique solids.
  let gx = 0, gy = 0, gz = 0
  for (const v of verts3) { gx += v.pos3[0]; gy += v.pos3[1]; gz += v.pos3[2] }
  const centroid: Vec3 = [gx / verts3.length, gy / verts3.length, gz / verts3.length]

  const faceVisible: boolean[] = faceVertexIds.map((f) => {
    if (f.length < 3) return true
    const p0 = byId3.get(f[0])!
    const p1 = byId3.get(f[1])!
    const p2 = byId3.get(f[2])!
    let n = cross3(sub3(p1, p0), sub3(p2, p0))
    let fx = 0, fy = 0, fz = 0
    for (const id of f) { const p = byId3.get(id)!; fx += p[0]; fy += p[1]; fz += p[2] }
    const fc: Vec3 = [fx / f.length, fy / f.length, fz / f.length]
    if (dot3(n, sub3(fc, centroid)) < 0) n = scale3(n, -1)
    return rotate3d(n, yaw, pitch)[2] > 1e-5
  })

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
      a: project3d(pA, center, yaw, pitch).pos,
      b: project3d(pB, center, yaw, pitch).pos,
      length: dist3(pA, pB),
      hidden: !visible,
      role: e.role
    }
  })

  const vertices: EvalVertex[] = verts3.map((v) => ({
    id: v.id,
    pos: project3d(v.pos3, center, yaw, pitch).pos,
    pos3: v.pos3,
    defaultLabel: v.defaultLabel,
    role: v.role,
    visible: v.role === 'center' ? true : visibleVerts.has(v.id)
  }))

  return { vertices, edges, byId3 }
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
function rightAngleMark3d(foot: Vec3, u1: Vec3, u2: Vec3, m: number, center: Vec2, yaw: number, pitch: number): Vec2[] {
  const p1 = project3d(add3(foot, scale3(u1, m)), center, yaw, pitch).pos
  const pc = project3d(add3(add3(foot, scale3(u1, m)), scale3(u2, m)), center, yaw, pitch).pos
  const p2 = project3d(add3(foot, scale3(u2, m)), center, yaw, pitch).pos
  return [p1, pc, p2]
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
  yaw: number,
  pitch: number,
  size: number
): EvalConstruction | null {
  const [w, h, d] = dim
  const rx = w / 2, rz = d / 2
  const proj = (p: Vec3): Vec2 => project3d(p, center, yaw, pitch).pos

  switch (c.kind) {
    case 'altitude': {
      const from3 = byId3.get(c.from) ?? byId3.get('apex')
      if (!from3) return null
      const foot3: Vec3 = [from3[0], -h / 2, from3[2]]
      const altLen = Math.abs(from3[1] - foot3[1])
      if (altLen < 1e-4) return null
      const pFrom = proj(from3)
      const pFoot = proj(foot3)
      const segments: EvalConstruction['segments'] = [{ pts: [pFrom, pFoot], dash: 'dashed' }]
      const m = Math.min(12, Math.max(size * 2.5, altLen * 0.1))
      const uUp: Vec3 = [0, from3[1] >= foot3[1] ? 1 : -1, 0]
      const baseDir = unit3([foot3[0] === 0 && foot3[2] === 0 ? 1 : -foot3[0], 0, foot3[0] === 0 && foot3[2] === 0 ? 0 : -foot3[2]])
      segments.push({ pts: rightAngleMark3d(foot3, uUp, baseDir, m, center, yaw, pitch), thin: true })
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
      segments.push({ pts: rightAngleMark3d(m3, uSlant, uEdge, mk, center, yaw, pitch), thin: true })
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
      const a3 = byId3.get(c.from)
      const b3 = byId3.get(c.to)
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
        segments.push({ pts: rightAngleMark3d(oBot, [0, 1, 0], [1, 0, 0], m, center, yaw, pitch), thin: true })
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
        const p = project3d([r * Math.cos(a), r * Math.sin(a), 0], center, yaw, pitch)
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
      // Unused vertex/edge guard
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
  const [yaw, pitch] = effectiveOrbit(geo)
  const slant = effectiveSlant3(geo)
  const proj = (p: Vec3): Vec2 => project3d(p, center, yaw, pitch).pos

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
    const mesh = buildPolyhedron(verts3, faces, edgeDefs, center, yaw, pitch)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', [0, -ry, 0])
    byId3.set('topCenter', [0, ry, 0])
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
    const bottomFace = Array.from({ length: n }, (_, i) => `b${n - 1 - i}`)
    const topFace = Array.from({ length: n }, (_, i) => `t${i}`)
    const sideFaces = Array.from({ length: n }, (_, i) => [`b${i}`, `b${(i + 1) % n}`, `t${(i + 1) % n}`, `t${i}`])
    const edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[] = [
      ...Array.from({ length: n }, (_, i) => ({ id: `eb${i}`, from: `b${i}`, to: `b${(i + 1) % n}`, role: 'base' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `et${i}`, from: `t${i}`, to: `t${(i + 1) % n}`, role: 'top' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `el${i}`, from: `b${i}`, to: `t${i}`, role: 'lateral' as const }))
    ]
    const mesh = buildPolyhedron(verts3, [bottomFace, topFace, ...sideFaces], edgeDefs, center, yaw, pitch)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', [0, -ry, 0])
    byId3.set('topCenter', [sx, ry, sz])
  } else if (geo.kind === 'pyramid' || geo.kind === 'obliquePyramid') {
    const n = clampSides(geo.sides, SHAPE_BASES[geo.kind]!.def)
    const off = Math.PI / 2 - 0.15
    const verts3: { id: string; pos3: Vec3; defaultLabel: string; role: EvalVertex['role'] }[] = []
    for (let i = 0; i < n; i++) {
      const a = off - (i / n) * Math.PI * 2
      verts3.push({ id: `b${i}`, pos3: [Math.cos(a) * rx, -ry, Math.sin(a) * rz], defaultLabel: vertexLetter(i), role: 'corner' })
    }
    verts3.push({ id: 'apex', pos3: [slant[0] * rx, ry, slant[1] * rz], defaultLabel: 'S', role: 'apex' })
    const bottomFace = Array.from({ length: n }, (_, i) => `b${n - 1 - i}`)
    const sideFaces = Array.from({ length: n }, (_, i) => [`b${i}`, `b${(i + 1) % n}`, 'apex'])
    const edgeDefs: { id: string; from: string; to: string; role: 'base' | 'lateral' | 'top' }[] = [
      ...Array.from({ length: n }, (_, i) => ({ id: `eb${i}`, from: `b${i}`, to: `b${(i + 1) % n}`, role: 'base' as const })),
      ...Array.from({ length: n }, (_, i) => ({ id: `el${i}`, from: 'apex', to: `b${i}`, role: 'lateral' as const }))
    ]
    const mesh = buildPolyhedron(verts3, [bottomFace, ...sideFaces], edgeDefs, center, yaw, pitch)
    vertices = mesh.vertices
    edges = mesh.edges
    byId3 = mesh.byId3
    byId3.set('center', [0, -ry, 0])
  } else if (geo.kind === 'cylinder') {
    const sx = slant[0] * rx, sz = slant[1] * rz
    const botC3: Vec3 = [0, -ry, 0]
    const topC3: Vec3 = [sx, ry, sz]
    const botC = proj(botC3)
    const topC = proj(topC3)
    // Projected basis of the horizontal base circle: u = proj(rx,0,0) - center, v = proj(0,0,rz) - center.
    const u2: Vec2 = [proj([rx, 0, 0])[0] - center[0], proj([rx, 0, 0])[1] - center[1]]
    const v2: Vec2 = [proj([0, 0, rz])[0] - center[0], proj([0, 0, rz])[1] - center[1]]
    const ax2: Vec2 = [topC[0] - botC[0], topC[1] - botC[1]]
    // Normal to projected axis in 2D: (-ax2[1], ax2[0]). Tangent dP/dt = -u2*sin(t) + v2*cos(t) is parallel to ax2 when dot(dP/dt, n) = 0.
    const nx = -ax2[1], ny = ax2[0]
    const du = u2[0] * nx + u2[1] * ny
    const dv = v2[0] * nx + v2[1] * ny
    const t1 = Math.hypot(du, dv) < 1e-6 ? 0 : Math.atan2(dv, du)
    const t2 = t1 + Math.PI
    const ptBot = (t: number): Vec3 => [rx * Math.cos(t), -ry, rz * Math.sin(t)]
    const ptTop = (t: number): Vec3 => [rx * Math.cos(t) + sx, ry, rz * Math.sin(t) + sz]
    const topFront = rotate3d([0, 1, 0], yaw, pitch)[2] >= 0
    const n = 72
    const sideSign = (t: number): number => {
      const p = project3d(ptBot(t), center, yaw, pitch)
      const pOpp = project3d(ptBot(t + Math.PI), center, yaw, pitch)
      return p.depth - pOpp.depth
    }
    const botSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3d(ptBot(t), center, yaw, pitch)
      // On the back cap, the half facing camera (closer than opposite side along silhouette split) is solid.
      const s = (u2[0] * Math.cos(t) + v2[0] * Math.sin(t)) * nx + (u2[1] * Math.cos(t) + v2[1] * Math.sin(t)) * ny
      const vis = !topFront ? true : s * sideSign(t1 + Math.PI / 2) * (Math.sin(Math.PI / 2) > 0 ? 1 : -1) >= 0
      void vis
      // Cleanest exact test: compare depth against the line through the two tangent points!
      const c1 = project3d(ptBot(t1), center, yaw, pitch)
      const c2 = project3d(ptBot(t2), center, yaw, pitch)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const ref = project3d(ptBot(t1 + Math.PI / 2), center, yaw, pitch)
      const refCross = (c2.pos[0] - c1.pos[0]) * (ref.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (ref.pos[0] - c1.pos[0])
      const frontHalf = (cross * refCross >= 0) === (ref.depth >= (c1.depth + c2.depth) / 2)
      return { pos: p.pos, visible: !topFront || frontHalf }
    })
    const topSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3d(ptTop(t), center, yaw, pitch)
      const c1 = project3d(ptTop(t1), center, yaw, pitch)
      const c2 = project3d(ptTop(t2), center, yaw, pitch)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const ref = project3d(ptTop(t1 + Math.PI / 2), center, yaw, pitch)
      const refCross = (c2.pos[0] - c1.pos[0]) * (ref.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (ref.pos[0] - c1.pos[0])
      const frontHalf = (cross * refCross >= 0) === (ref.depth >= (c1.depth + c2.depth) / 2)
      return { pos: p.pos, visible: topFront || frontHalf }
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
    vertices = [
      { id: 'center', pos: botC, pos3: botC3, defaultLabel: 'O', role: 'center', visible: true },
      { id: 'topCenter', pos: topC, pos3: topC3, defaultLabel: 'O₁', role: 'apex', visible: true },
      { id: 'b0', pos: proj(b1), pos3: b1, defaultLabel: 'A', role: 'cardinal', visible: true },
      { id: 'b1', pos: proj(b2), pos3: b2, defaultLabel: 'B', role: 'cardinal', visible: true },
      { id: 't0', pos: proj(u1), pos3: u1, defaultLabel: 'A₁', role: 'cardinal', visible: true },
      { id: 't1', pos: proj(u2p), pos3: u2p, defaultLabel: 'B₁', role: 'cardinal', visible: true }
    ]
    edges = [
      { id: 'el0', from: 'b0', to: 't0', a: proj(b1), b: proj(u1), length: dist3(b1, u1), role: 'lateral' },
      { id: 'el1', from: 'b1', to: 't1', a: proj(b2), b: proj(u2p), length: dist3(b2, u2p), role: 'lateral' }
    ]
  } else if (geo.kind === 'cone') {
    const botC3: Vec3 = [0, -ry, 0]
    const apex3: Vec3 = [slant[0] * rx, ry, slant[1] * rz]
    const botC = proj(botC3)
    const apex2 = proj(apex3)
    const u2: Vec2 = [proj([rx, 0, 0])[0] - center[0], proj([rx, 0, 0])[1] - center[1]]
    const v2: Vec2 = [proj([0, 0, rz])[0] - center[0], proj([0, 0, rz])[1] - center[1]]
    const ptBot = (t: number): Vec3 => [rx * Math.cos(t), -ry, rz * Math.sin(t)]
    // Express (apex2 - botC) in the projected ellipse's (u2, v2) basis to get exact tangent angles!
    const det = u2[0] * v2[1] - u2[1] * v2[0]
    const dx = apex2[0] - botC[0], dy = apex2[1] - botC[1]
    const baseVisible = rotate3d([0, -1, 0], yaw, pitch)[2] > 1e-5
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
      // Edge-on base circle: pick the two extreme points along projected u2/v2.
      hasTangents = true
      const a0 = Math.atan2(v2[0] * dx + v2[1] * dy, u2[0] * dx + u2[1] * dy) + Math.PI / 2
      t1 = a0
      t2 = a0 + Math.PI
    }
    const botSamples = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2
      const p = project3d(ptBot(t), center, yaw, pitch)
      if (baseVisible || !hasTangents) return { pos: p.pos, visible: true }
      const c1 = project3d(ptBot(t1), center, yaw, pitch)
      const c2 = project3d(ptBot(t2), center, yaw, pitch)
      const cross = (c2.pos[0] - c1.pos[0]) * (p.pos[1] - c1.pos[1]) - (c2.pos[1] - c1.pos[1]) * (p.pos[0] - c1.pos[0])
      const midT = (t1 + t2) / 2
      const ref = project3d(ptBot(midT), center, yaw, pitch)
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
    vertices = [
      { id: 'center', pos: botC, pos3: botC3, defaultLabel: 'O', role: 'center', visible: true },
      { id: 'apex', pos: apex2, pos3: apex3, defaultLabel: 'S', role: 'apex', visible: true },
      { id: 'b0', pos: proj(b1), pos3: b1, defaultLabel: 'A', role: 'cardinal', visible: true },
      { id: 'b1', pos: proj(b2), pos3: b2, defaultLabel: 'B', role: 'cardinal', visible: true }
    ]
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
      const p = project3d([r * Math.cos(a), 0, r * Math.sin(a)], center, yaw, pitch)
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
    vertices = [
      { id: 'center', pos: center, pos3: [0, 0, 0], defaultLabel: 'O', role: 'center', visible: true },
      { id: 'top', pos: proj(top3), pos3: top3, defaultLabel: 'N', role: 'cardinal', visible: true },
      { id: 'rim0', pos: proj(rim3), pos3: rim3, defaultLabel: 'A', role: 'cardinal', visible: true }
    ]
  }

  const evalCons = constructions
    .map((c) => evaluate3dConstruction(c, geo, dim, slant, vertices, edges, byId3, center, yaw, pitch, size))
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
