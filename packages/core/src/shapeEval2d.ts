import { turnPoint } from './geometry'
import { isLinear, isTriangle, MAX_BASE, MIN_BASE, SHAPE_BASES } from './shapes'
import { triangleCircles } from './triangleCircles'
import type { ShapeConstruction, ShapeGeometry, Vec2 } from './types'
import { boundsOfPaths, vertexLetter, type EvalConstruction, type EvalCurve, type EvalEdge, type EvaluatedShape, type EvalVertex } from './shapeEval'

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const clampSides = (n: number | undefined, def: number): number =>
  n !== undefined && Number.isFinite(n) ? Math.max(MIN_BASE, Math.min(MAX_BASE, Math.round(n))) : def

const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(b[0] - a[0], b[1] - a[1])
const mid2 = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

function sampleEllipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 96): Vec2[] {
  const pts: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = cx + Math.cos(a) * rx
    const y = cy + Math.sin(a) * ry
    pts.push(rot ? turnPoint(x, y, cx, cy, rot) : [x, y])
  }
  return pts
}

function arrowWings(ax: number, ay: number, bx: number, by: number, size: number): Vec2[] {
  const len = Math.hypot(bx - ax, by - ay) || 1
  const head = Math.min(len * 0.4, Math.max(12, size * 4.5))
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const w1: Vec2 = [bx - ux * head - uy * head * 0.55, by - uy * head + ux * head * 0.55]
  const w2: Vec2 = [bx - ux * head + uy * head * 0.55, by - uy * head - ux * head * 0.55]
  return [w1, [bx, by], w2]
}

/** Twice the signed area of a 2D polygon (positive = clockwise in canvas y-down coordinates). */
function signedArea2(verts: readonly Vec2[]): number {
  let s = 0
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const [x0, y0] = verts[i]
    const [x1, y1] = verts[(i + 1) % n]
    s += x0 * y1 - x1 * y0
  }
  return s
}

/** Compute interior corner angle (0..360) and clockwise interior [startRay, endRay] at vertex `i`. */
function polygonCornerAngle(verts: readonly Vec2[], i: number, areaSign: number): { deg: number; rays: [Vec2, Vec2] } | null {
  const n = verts.length
  const v = verts[i]
  const prev = verts[(i - 1 + n) % n]
  const next = verts[(i + 1) % n]
  const px = prev[0] - v[0], py = prev[1] - v[1]
  const nx = next[0] - v[0], ny = next[1] - v[1]
  const lp = Math.hypot(px, py)
  const ln = Math.hypot(nx, ny)
  if (lp < 1e-6 || ln < 1e-6) return null
  const up: Vec2 = [px / lp, py / lp]
  const un: Vec2 = [nx / ln, ny / ln]
  // In y-down coords: for CW polygon (areaSign >= 0), interior sweeps CW from `un` (next) to `up` (prev).
  // For CCW polygon (areaSign < 0), interior sweeps CW from `up` (prev) to `un` (next).
  const start = areaSign >= 0 ? un : up
  const end = areaSign >= 0 ? up : un
  let sweep = Math.atan2(end[1], end[0]) - Math.atan2(start[1], start[0])
  if (sweep < 0) sweep += Math.PI * 2
  const deg = (sweep * 180) / Math.PI
  return { deg, rays: [start, end] }
}

/** Ray-segment intersection for ray P + t*D (t > 1e-4) against segment A -> B (u in [0, 1]). */
function intersectRaySegment(p: Vec2, d: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2 } | null {
  const sx = b[0] - a[0], sy = b[1] - a[1]
  const denom = d[0] * sy - d[1] * sx
  if (Math.abs(denom) < 1e-9) return null
  const qx = a[0] - p[0], qy = a[1] - p[1]
  const t = (qx * sy - qy * sx) / denom
  const u = (qx * d[1] - qy * d[0]) / denom
  if (t <= 1e-4 || u < -1e-4 || u > 1 + 1e-4) return null
  return { t, point: [p[0] + t * d[0], p[1] + t * d[1]] }
}

function buildPolygonVerts(geo: ShapeGeometry): { verts: Vec2[]; roles?: EvalVertex['role'][]; center: Vec2 } {
  if ((isTriangle(geo.kind) && geo.vertices?.length === 3) || (geo.kind === 'polygon' && geo.vertices && geo.vertices.length >= MIN_BASE)) {
    const verts = geo.vertices.map(([x, y]): Vec2 => [x, y])
    let sx = 0, sy = 0
    for (const [x, y] of verts) { sx += x; sy += y }
    return { verts, center: [sx / verts.length, sy / verts.length] }
  }
  const x0 = Math.min(geo.ax, geo.bx)
  const y0 = Math.min(geo.ay, geo.by)
  const x1 = Math.max(geo.ax, geo.bx)
  const y1 = Math.max(geo.ay, geo.by)
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rot = geo.rot ?? 0
  const turn = (pts: Vec2[]): Vec2[] => (rot ? pts.map(([x, y]) => turnPoint(x, y, cx, cy, rot)) : pts)

  switch (geo.kind) {
    case 'rectangle':
      return { verts: turn([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), center: [cx, cy] }
    case 'triangle':
      return { verts: turn([[cx, y0], [x1, y1], [x0, y1]]), center: [cx, (y0 + y1 + y1) / 3] }
    case 'rightTriangle':
      return { verts: turn([[x0, y0], [x0, y1], [x1, y1]]), center: [(x0 + x0 + x1) / 3, (y0 + y1 + y1) / 3] }
    case 'rhombus':
      return { verts: turn([[cx, y0], [x1, cy], [cx, y1], [x0, cy]]), center: [cx, cy] }
    case 'parallelogram': {
      const skew = clamp(geo.skew ?? 0.25, -0.75, 0.75)
      const raw: Vec2[] = skew >= 0
        ? [[x0 + w * skew, y0], [x1, y0], [x1 - w * skew, y1], [x0, y1]]
        : [[x0, y0], [x1 - w * -skew, y0], [x1, y1], [x0 + w * -skew, y1]]
      return { verts: turn(raw), center: [cx, cy] }
    }
    case 'trapezoid': {
      let tl = clamp(geo.topLeft ?? 0.22, 0, 0.95)
      let tr = clamp(geo.topRight ?? 0.22, 0, 0.95)
      if (tl + tr > 0.96) {
        const k = 0.96 / (tl + tr)
        tl *= k
        tr *= k
      }
      return { verts: turn([[x0 + w * tl, y0], [x1 - w * tr, y0], [x1, y1], [x0, y1]]), center: [cx, cy] }
    }
    case 'pentagon':
    case 'hexagon':
    case 'polygon': {
      const n = geo.kind === 'pentagon' ? 5 : geo.kind === 'hexagon' ? 6 : clampSides(geo.sides, SHAPE_BASES.polygon!.def)
      const start = geo.kind === 'hexagon' ? 0 : -Math.PI / 2 + (n === 4 ? Math.PI / 4 : 0)
      const rx = w / 2, ry = h / 2
      const raw: Vec2[] = []
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * Math.PI * 2
        raw.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
      }
      return { verts: turn(raw), center: [cx, cy] }
    }
    case 'star': {
      const n = clampSides(geo.sides, SHAPE_BASES.star!.def)
      const inner = clamp(geo.innerRatio ?? 0.4, 0.15, 0.9)
      const rx = w / 2, ry = h / 2
      const total = n * 2
      const raw: Vec2[] = []
      const roles: EvalVertex['role'][] = []
      for (let i = 0; i < total; i++) {
        const a = -Math.PI / 2 + (i / total) * Math.PI * 2
        const r = i % 2 === 0 ? 1 : inner
        raw.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r])
        roles.push(i % 2 === 0 ? 'corner' : 'inner')
      }
      return { verts: turn(raw), roles, center: [cx, cy] }
    }
    default:
      return { verts: [], center: [cx, cy] }
  }
}

function evaluate2dConstruction(
  c: ShapeConstruction,
  geo: ShapeGeometry,
  vertices: readonly EvalVertex[],
  edges: readonly EvalEdge[],
  center: Vec2,
  size: number
): EvalConstruction | null {
  const byV = new Map(vertices.map((v) => [v.id, v]))
  const byE = new Map(edges.map((e) => [e.id, e]))

  switch (c.kind) {
    case 'altitude': {
      const v = byV.get(c.from)
      if (!v) return null
      // Default to opposite edge for triangles if toEdge is omitted.
      let edge = c.toEdge ? byE.get(c.toEdge) : undefined
      if (!edge && vertices.length === 3 && edges.length === 3) {
        const idx = vertices.findIndex((x) => x.id === c.from)
        if (idx >= 0) edge = edges[(idx + 1) % 3]
      }
      if (!edge) return null
      const dx = edge.b[0] - edge.a[0]
      const dy = edge.b[1] - edge.a[1]
      const len2 = dx * dx + dy * dy
      if (len2 < 1e-6) return null
      const baseLen = Math.sqrt(len2)
      const t = ((v.pos[0] - edge.a[0]) * dx + (v.pos[1] - edge.a[1]) * dy) / len2
      const foot: Vec2 = [edge.a[0] + t * dx, edge.a[1] + t * dy]
      const hLen = dist2(v.pos, foot)
      const segments: EvalConstruction['segments'] = [{ pts: [v.pos, foot], dash: 'dashed' }]
      if (t < -1e-4) segments.push({ pts: [edge.a, foot], dash: 'dotted', thin: true })
      else if (t > 1 + 1e-4) segments.push({ pts: [edge.b, foot], dash: 'dotted', thin: true })
      // Crisp 90 deg foot square at perpendicular foot H.
      if (hLen > 6) {
        const avx = (v.pos[0] - foot[0]) / hLen
        const avy = (v.pos[1] - foot[1]) / hLen
        const dirSign = t > 0.5 ? -1 : 1
        const bvx = (dx / baseLen) * dirSign
        const bvy = (dy / baseLen) * dirSign
        const m = Math.min(12, Math.max(Math.min(hLen * 0.25, size * 2.8), Math.min(hLen, baseLen) * 0.12))
        if (m >= 2.5) {
          segments.push({
            pts: [
              [foot[0] + avx * m, foot[1] + avy * m],
              [foot[0] + (avx + bvx) * m, foot[1] + (avy + bvy) * m],
              [foot[0] + bvx * m, foot[1] + bvy * m]
            ],
            thin: true
          })
        }
      }
      return { id: c.id, kind: c.kind, segments, length: hLen, lengthAnchor: [v.pos, foot] }
    }
    case 'median': {
      const v = byV.get(c.from)
      const edge = byE.get(c.toEdge)
      if (!v || !edge) return null
      const m = mid2(edge.a, edge.b)
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [v.pos, m], dash: 'dashed' }],
        dots: [{ pos: m }],
        length: dist2(v.pos, m),
        lengthAnchor: [v.pos, m]
      }
    }
    case 'bisector': {
      const v = byV.get(c.from)
      if (!v || !v.angleRays) return null
      const [r1, r2] = v.angleRays
      // Mid-angle along the interior clockwise sweep from r1 to r2.
      const a1 = Math.atan2(r1[1], r1[0])
      let sweep = Math.atan2(r2[1], r2[0]) - a1
      if (sweep < 0) sweep += Math.PI * 2
      const midAng = a1 + sweep / 2
      const dir: Vec2 = [Math.cos(midAng), Math.sin(midAng)]
      let best: { t: number; point: Vec2 } | null = null
      for (const e of edges) {
        if (e.from === c.from || e.to === c.from) continue
        const hit = intersectRaySegment(v.pos, dir, e.a, e.b)
        if (hit && (!best || hit.t < best.t)) best = hit
      }
      if (!best) return null
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [v.pos, best.point], dash: 'dashed' }],
        length: dist2(v.pos, best.point),
        lengthAnchor: [v.pos, best.point]
      }
    }
    case 'diagonal': {
      const point2 = (id: string): Vec2 | null => {
        const v = byV.get(id)
        if (v) return v.pos
        if (id === 'center') return center
        if (id.startsWith('mid:')) {
          const e = byE.get(id.slice(4))
          return e ? mid2(e.a, e.b) : null
        }
        return null
      }
      const pa = point2(c.from)
      const pb = point2(c.to)
      if (!pa || !pb) return null
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [pa, pb], dash: 'dashed' }],
        length: dist2(pa, pb),
        lengthAnchor: [pa, pb]
      }
    }
    case 'midpoint': {
      const edge = byE.get(c.edge)
      if (!edge) return null
      return { id: c.id, kind: c.kind, segments: [], dots: [{ pos: mid2(edge.a, edge.b) }] }
    }
    case 'midline': {
      const eA = byE.get(c.edgeA)
      const eB = byE.get(c.edgeB)
      if (!eA || !eB) return null
      const mA = mid2(eA.a, eA.b)
      const mB = mid2(eB.a, eB.b)
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [mA, mB], dash: 'dashed' }],
        dots: [{ pos: mA }, { pos: mB }],
        length: dist2(mA, mB),
        lengthAnchor: [mA, mB]
      }
    }
    case 'incircle':
    case 'circumcircle': {
      if (vertices.length === 3) {
        const circles = triangleCircles(
          [vertices[0].pos[0], vertices[0].pos[1], 0.5],
          [vertices[1].pos[0], vertices[1].pos[1], 0.5],
          [vertices[2].pos[0], vertices[2].pos[1], 0.5]
        )
        if (!circles) return null
        const target = c.kind === 'incircle' ? circles.incircle : circles.circumcircle
        return {
          id: c.id,
          kind: c.kind,
          segments: [{ pts: sampleEllipse(target.x, target.y, target.radius, target.radius, 0, 128) }]
        }
      }
      const x0 = Math.min(geo.ax, geo.bx), x1 = Math.max(geo.ax, geo.bx)
      const y0 = Math.min(geo.ay, geo.by), y1 = Math.max(geo.ay, geo.by)
      const w = x1 - x0, h = y1 - y0
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const rot = geo.rot ?? 0
      if (geo.kind === 'rhombus' && c.kind === 'incircle') {
        const diag = Math.hypot(w, h)
        if (diag < 1e-4) return null
        const r = (w * h) / (2 * diag)
        return { id: c.id, kind: c.kind, segments: [{ pts: sampleEllipse(cx, cy, r, r, 0, 128) }] }
      }
      if (geo.kind === 'rectangle') {
        if (c.kind === 'circumcircle') {
          const r = Math.hypot(w, h) / 2
          return { id: c.id, kind: c.kind, segments: [{ pts: sampleEllipse(cx, cy, r, r, 0, 128) }] }
        }
        // Incircle fits inside a square (or inscribed ellipse for non-square rectangle).
        return { id: c.id, kind: c.kind, segments: [{ pts: sampleEllipse(cx, cy, w / 2, h / 2, rot, 128) }] }
      }
      if (geo.kind === 'pentagon' || geo.kind === 'hexagon' || (geo.kind === 'polygon' && !geo.vertices)) {
        const n = geo.kind === 'pentagon' ? 5 : geo.kind === 'hexagon' ? 6 : clampSides(geo.sides, SHAPE_BASES.polygon!.def)
        const k = c.kind === 'incircle' ? Math.cos(Math.PI / n) : 1
        return { id: c.id, kind: c.kind, segments: [{ pts: sampleEllipse(cx, cy, (w / 2) * k, (h / 2) * k, rot, 128) }] }
      }
      return null
    }
    case 'center':
      return {
        id: c.id,
        kind: c.kind,
        segments: [],
        dots: [{ pos: center }],
        label: { text: 'O', pos: center, awayFrom: [center[0], center[1] - 20] }
      }
    case 'radius':
    case 'diameter': {
      if (geo.kind !== 'ellipse') return null
      const x0 = Math.min(geo.ax, geo.bx), x1 = Math.max(geo.ax, geo.bx)
      const y0 = Math.min(geo.ay, geo.by), y1 = Math.max(geo.ay, geo.by)
      const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const rot = geo.rot ?? 0
      const ang = c.angle ?? 0
      const p1Raw: Vec2 = [cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry]
      const p1 = rot ? turnPoint(p1Raw[0], p1Raw[1], cx, cy, rot) : p1Raw
      if (c.kind === 'radius') {
        return {
          id: c.id,
          kind: c.kind,
          segments: [{ pts: [center, p1], dash: 'dashed' }],
          dots: [{ pos: center }],
          length: dist2(center, p1),
          lengthAnchor: [center, p1]
        }
      }
      const p2Raw: Vec2 = [cx - Math.cos(ang) * rx, cy - Math.sin(ang) * ry]
      const p2 = rot ? turnPoint(p2Raw[0], p2Raw[1], cx, cy, rot) : p2Raw
      return {
        id: c.id,
        kind: c.kind,
        segments: [{ pts: [p2, p1], dash: 'dashed' }],
        dots: [{ pos: center }],
        length: dist2(p2, p1),
        lengthAnchor: [p2, p1]
      }
    }
    default:
      return null
  }
}

export function evaluate2dShape(geo: ShapeGeometry, constructions: readonly ShapeConstruction[], size: number): EvaluatedShape {
  if (isLinear(geo.kind)) {
    const a: Vec2 = [geo.ax, geo.ay]
    const b: Vec2 = [geo.bx, geo.by]
    const center = mid2(a, b)
    const vertices: EvalVertex[] = [
      { id: 'v0', pos: a, defaultLabel: 'A', role: 'corner', visible: true },
      { id: 'v1', pos: b, defaultLabel: 'B', role: 'corner', visible: true }
    ]
    const edges: EvalEdge[] = [{ id: 'e0', from: 'v0', to: 'v1', a, b, length: dist2(a, b), role: 'main' }]
    const decorations: Vec2[][] = []
    if (geo.kind === 'arrow' || geo.kind === 'doubleArrow') decorations.push(arrowWings(a[0], a[1], b[0], b[1], size))
    if (geo.kind === 'doubleArrow') decorations.push(arrowWings(b[0], b[1], a[0], a[1], size))
    const evalCons = constructions
      .map((c) => evaluate2dConstruction(c, geo, vertices, edges, center, size))
      .filter((x): x is EvalConstruction => !!x)
    const hitPaths: Vec2[][] = [[a, b], ...decorations, ...evalCons.flatMap((c) => c.segments.map((s) => s.pts))]
    return {
      is3D: false,
      center,
      vertices,
      edges,
      curves: [],
      constructions: evalCons,
      decorations,
      hitPaths,
      bounds: boundsOfPaths(hitPaths, center)
    }
  }

  if (geo.kind === 'ellipse') {
    const x0 = Math.min(geo.ax, geo.bx), x1 = Math.max(geo.ax, geo.bx)
    const y0 = Math.min(geo.ay, geo.by), y1 = Math.max(geo.ay, geo.by)
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const rot = geo.rot ?? 0
    const center: Vec2 = [cx, cy]
    const turn = (x: number, y: number): Vec2 => (rot ? turnPoint(x, y, cx, cy, rot) : [x, y])
    const vertices: EvalVertex[] = [
      { id: 'center', pos: center, defaultLabel: 'O', role: 'center', visible: true },
      { id: 'v0', pos: turn(cx, y0), defaultLabel: 'A', role: 'cardinal', visible: true },
      { id: 'v1', pos: turn(x1, cy), defaultLabel: 'B', role: 'cardinal', visible: true },
      { id: 'v2', pos: turn(cx, y1), defaultLabel: 'C', role: 'cardinal', visible: true },
      { id: 'v3', pos: turn(x0, cy), defaultLabel: 'D', role: 'cardinal', visible: true }
    ]
    const pts = sampleEllipse(cx, cy, rx, ry, rot, 96)
    const curves: EvalCurve[] = [{ id: 'e0', pts, closed: true, length: rx }]
    const evalCons = constructions
      .map((c) => evaluate2dConstruction(c, geo, vertices, [], center, size))
      .filter((x): x is EvalConstruction => !!x)
    const hitPaths: Vec2[][] = [pts, ...evalCons.flatMap((c) => c.segments.map((s) => s.pts))]
    return {
      is3D: false,
      center,
      vertices,
      edges: [],
      curves,
      constructions: evalCons,
      decorations: [],
      hitPaths,
      bounds: boundsOfPaths(hitPaths, center)
    }
  }

  const { verts, roles, center } = buildPolygonVerts(geo)
  const areaSign = signedArea2(verts) >= 0 ? 1 : -1
  // Letters go to the corners in order, so a star's tips read A, B, C; its inner points come after them.
  let lettered = 0
  let innerLettered = verts.filter((_, i) => roles?.[i] !== 'inner').length
  const vertices: EvalVertex[] = verts.map((pos, i) => {
    const corner = polygonCornerAngle(verts, i, areaSign)
    const role = roles?.[i] ?? 'corner'
    return {
      id: `v${i}`,
      pos,
      defaultLabel: vertexLetter(role === 'inner' ? innerLettered++ : lettered++),
      angleDeg: corner?.deg,
      angleRays: corner?.rays,
      role,
      visible: true
    }
  })
  const edges: EvalEdge[] = verts.map((a, i) => {
    const j = (i + 1) % verts.length
    const b = verts[j]
    return { id: `e${i}`, from: `v${i}`, to: `v${j}`, a, b, length: dist2(a, b), role: 'main' }
  })
  const evalCons = constructions
    .map((c) => evaluate2dConstruction(c, geo, vertices, edges, center, size))
    .filter((x): x is EvalConstruction => !!x)
  const hitPaths: Vec2[][] = [
    ...edges.map((e): Vec2[] => [e.a, e.b]),
    ...evalCons.flatMap((c) => c.segments.map((s) => s.pts))
  ]
  return {
    is3D: false,
    center,
    vertices,
    edges,
    curves: [],
    constructions: evalCons,
    decorations: [],
    hitPaths,
    bounds: boundsOfPaths(hitPaths, center)
  }
}
