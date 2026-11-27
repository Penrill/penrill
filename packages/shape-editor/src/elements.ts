import { evaluateShape, shapeBBox, type EvalEdge, type EvalVertex } from '@penrill/core/shapeEval'
import { defaultDim3, DEFAULT_ORBIT } from '@penrill/core/shapeEval3d'
import { boxOfVertices, is3D, isLinear, isTriangle, MAX_BASE, MIN_BASE, SHAPE_BASES, type ShapeKind } from '@penrill/core/shapes'
import type { ShapeConstruction, ShapeGeometry, ShapeItem, Vec2 } from '@penrill/core/types'

export interface ShapeItemDefaults {
  showAngles: boolean
  showLengths: boolean
  showLabels: boolean
}

export interface ConstructionAction {
  id: string
  labelKey: string
  vars?: Record<string, string>
  active: boolean
  construction: ShapeConstruction
}

export interface ConnectTarget {
  id: string
  targetId: string
  label: string
  active: boolean
  construction: ShapeConstruction
}

export interface VertexActionsModel {
  vertex: EvalVertex
  currentLabel: string | null
  hasAngle: boolean
  angleOn: boolean
  constructions: ConstructionAction[]
  /** All connectable non-adjacent vertices, centers and active edge midpoints (compact chip grid). */
  connectTargets: ConnectTarget[]
  canRemove: boolean
}

export interface EdgeActionsModel {
  edge: EvalEdge
  mid: Vec2
  lengthOn: boolean
  constructions: ConstructionAction[]
  canAddVertex: boolean
}

export interface WholeShapeAction {
  id: string
  labelKey: string
  active: boolean
  /** Toggle one or more constructions together (e.g. both rhombus diagonals at once). */
  constructions: ShapeConstruction[]
}

const CONSTRAINED_2D_POLYGONS: ReadonlySet<ShapeKind> = new Set([
  'rectangle',
  'rhombus',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'star'
])

const CONSTRAINED_3D_POLYHEDRA: ReadonlySet<ShapeKind> = new Set([
  'cube',
  'prism',
  'pyramid',
  'obliquePyramid'
])

/** True when a 2D polygonal shape is currently constrained and can be unlocked into free vertices. */
export function isConstrained2dPolygon(geo: ShapeGeometry): boolean {
  return CONSTRAINED_2D_POLYGONS.has(geo.kind) || (geo.kind === 'polygon' && !geo.vertices)
}

/** True when a 3D polyhedron is currently constrained and can be unlocked into free 3D vertices. */
export function isConstrained3dPolyhedron(geo: ShapeGeometry): boolean {
  return CONSTRAINED_3D_POLYHEDRA.has(geo.kind) && !geo.vertices3
}

/** True when any 2D polygon or 3D polyhedron can be unlocked into free vertex editing. */
export function canUnlockFreeVertices(geo: ShapeGeometry): boolean {
  return isConstrained2dPolygon(geo) || isConstrained3dPolyhedron(geo)
}

/** True when a ShapeItem has custom geometry overrides beyond its canonical bounding-box form. */
export function isCustomizedShapeItem(item: ShapeItem): boolean {
  const g = item.geo
  if (g.vertices || g.vertices3 || g.skew !== undefined || g.topLeft !== undefined || g.topRight !== undefined || g.innerRatio !== undefined) {
    return true
  }
  if (is3D(g.kind)) {
    if (g.rot3) return true
    const defOrbit = DEFAULT_ORBIT
    if (g.orbit && (Math.abs(g.orbit[0] - defOrbit[0]) > 1e-3 || Math.abs(g.orbit[1] - defOrbit[1]) > 1e-3)) return true
    const defSlant: [number, number] = g.kind === 'obliquePyramid' ? [0.85, 0] : [0, 0]
    if (g.slant3 && (Math.abs(g.slant3[0] - defSlant[0]) > 1e-3 || Math.abs(g.slant3[1] - defSlant[1]) > 1e-3)) return true
    if (g.dim3) {
      const defD = defaultDim3(g.kind, g.bx - g.ax, g.by - g.ay)
      if (Math.abs(g.dim3[0] - defD[0]) > 1 || Math.abs(g.dim3[1] - defD[1]) > 1 || Math.abs(g.dim3[2] - defD[2]) > 1) return true
    }
  }
  return false
}

/** Return an updated ShapeItem with freshly recomputed bbox and pruned empty optional fields. */
export function withShapeUpdate(
  item: ShapeItem,
  patch: Partial<Pick<ShapeItem, 'geo' | 'labels' | 'angles' | 'lengths' | 'constructions' | 'tangentMarks' | 'rot' | 'color' | 'size' | 'dash' | 'startCap' | 'endCap'>>
): ShapeItem {
  const next: ShapeItem = { ...item, ...patch }
  if (next.labels && Object.keys(next.labels).length === 0) delete next.labels
  if (next.angles && next.angles.length === 0) delete next.angles
  if (next.lengths && next.lengths.length === 0) delete next.lengths
  if (next.constructions && next.constructions.length === 0) delete next.constructions
  next.bbox = shapeBBox(next)
  return next
}

/** Drop labels, angles, lengths and constructions that reference missing vertex/edge ids after kind/sides change. */
function pruneAnnotations(item: ShapeItem): ShapeItem {
  const ev = evaluateShape(item)
  const vIds = new Set(ev.vertices.map((v) => v.id))
  const eIds = new Set(ev.edges.map((e) => e.id))
  const cIds = new Set(ev.curves.map((c) => c.id))
  const validPointId = (id: string): boolean =>
    vIds.has(id) || id === 'center' || (id.startsWith('mid:') && eIds.has(id.slice(4)))
  const cons = (item.constructions ?? []).filter((c) => {
    switch (c.kind) {
      case 'altitude': return vIds.has(c.from) && (!c.toEdge || eIds.has(c.toEdge))
      case 'median': return vIds.has(c.from) && eIds.has(c.toEdge)
      case 'bisector': return vIds.has(c.from) && !ev.is3D
      case 'diagonal': return validPointId(c.from) && validPointId(c.to)
      case 'midpoint': return eIds.has(c.edge)
      case 'midline': return eIds.has(c.edgeA) && eIds.has(c.edgeB)
      case 'apothem': return vIds.has('apex') && eIds.has(c.edge)
      case 'incircle':
      case 'circumcircle':
        return !ev.is3D && (isTriangle(item.geo.kind) || item.geo.kind === 'rhombus' || item.geo.kind === 'rectangle' || item.geo.kind === 'pentagon' || item.geo.kind === 'hexagon' || (item.geo.kind === 'polygon' && !item.geo.vertices))
      case 'radius':
      case 'diameter':
        return item.geo.kind === 'ellipse' || (c.kind === 'radius' && (item.geo.kind === 'cylinder' || item.geo.kind === 'cone' || item.geo.kind === 'sphere'))
      case 'axis':
        return item.geo.kind === 'cylinder' || item.geo.kind === 'cone' || item.geo.kind === 'prism' || item.geo.kind === 'cube'
      case 'section':
        return item.geo.kind === 'cylinder' || item.geo.kind === 'cone'
      case 'meridian':
        return item.geo.kind === 'sphere'
      case 'center':
        return true
      case 'tangent':
        return item.geo.kind === 'ellipse'
    }
  })
  const validConsIds = new Set(cons.map((c) => c.id))
  let labels: Record<string, string> | undefined
  if (item.labels) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(item.labels)) if (vIds.has(k) && v.trim()) out[k] = v
    if (Object.keys(out).length) labels = out
  }
  const angles = item.angles?.filter((id) => {
    const v = ev.vertices.find((x) => x.id === id)
    return !!v && v.angleDeg !== undefined
  })
  const lengths = item.lengths?.filter((id) => eIds.has(id) || cIds.has(id) || validConsIds.has(id))
  return withShapeUpdate(item, {
    labels: labels ?? undefined,
    angles: angles?.length ? angles : undefined,
    lengths: lengths?.length ? lengths : undefined,
    constructions: cons.length ? cons : undefined
  })
}

/**
 * Unlock any constrained 2D polygonal shape into a free 2D polygon OR any constrained 3D polyhedron
 * into free 3D vertices (`geo.vertices3`) while keeping all labels, angles, lengths and constructions.
 */
export function unlockFreeVertices(item: ShapeItem): ShapeItem {
  if (isConstrained3dPolyhedron(item.geo)) {
    const ev = evaluateShape(item)
    const vertices3: Record<string, [number, number, number]> = {}
    for (const v of ev.vertices) {
      if (v.pos3) vertices3[v.id] = [v.pos3[0], v.pos3[1], v.pos3[2]]
    }
    if (!Object.keys(vertices3).length) return item
    return withShapeUpdate(item, { geo: { ...item.geo, vertices3 } })
  }
  if (!isConstrained2dPolygon(item.geo)) return item
  const ev = evaluateShape(item)
  if (ev.vertices.length < MIN_BASE) return item
  const verts = ev.vertices.map((v): Vec2 => [v.pos[0], v.pos[1]])
  const geo: ShapeGeometry = {
    kind: 'polygon',
    ...boxOfVertices(verts),
    vertices: verts,
    sides: verts.length
  }
  return pruneAnnotations(withShapeUpdate(item, { geo, rot: undefined }))
}

/** Reset custom vertices, skew, insets, 3D orbit, slant and non-equal dimensions back to defaults. */
export function resetShapeItemGeometry(item: ShapeItem): ShapeItem {
  const g = item.geo
  const nextGeo: ShapeGeometry = {
    kind: g.kind,
    ax: g.ax,
    ay: g.ay,
    bx: g.bx,
    by: g.by,
    ...(g.rot ? { rot: g.rot } : {}),
    ...(g.sides !== undefined ? { sides: g.sides } : {})
  }
  if (is3D(g.kind)) {
    nextGeo.dim3 = defaultDim3(g.kind, g.bx - g.ax, g.by - g.ay)
    nextGeo.orbit = [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]]
    if (g.kind === 'obliquePyramid') nextGeo.slant3 = [0.85, 0]
  }
  return pruneAnnotations(withShapeUpdate(item, { geo: nextGeo }))
}

/** Reset only the 3D orientation back to classic textbook axonometry (keeping dimensions and constructions). */
export function resetShapeItemOrbit(item: ShapeItem): ShapeItem {
  if (!is3D(item.geo.kind)) return item
  const nextGeo: ShapeGeometry = { ...item.geo, orbit: [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]] }
  delete nextGeo.rot3
  return withShapeUpdate(item, { geo: nextGeo })
}

/** Natural polygon side count of a shape kind, used when converting between 2D and 3D (e.g. triangle -> triangular prism). */
function naturalSidesOf(g: ShapeGeometry): number | undefined {
  if (g.kind === 'triangle' || g.kind === 'rightTriangle') return 3
  if (g.kind === 'rectangle' || g.kind === 'rhombus' || g.kind === 'parallelogram' || g.kind === 'trapezoid' || g.kind === 'cube') return 4
  if (g.kind === 'pentagon') return 5
  if (g.kind === 'hexagon') return 6
  if (g.kind === 'polygon' && g.vertices?.length) return Math.max(MIN_BASE, Math.min(MAX_BASE, g.vertices.length))
  if (SHAPE_BASES[g.kind]) return g.sides ?? SHAPE_BASES[g.kind]!.def
  return undefined
}

/** Switch a ShapeItem to a new ShapeKind (including 2D <-> 3D) while preserving bounds, natural sides and compatible annotations. */
export function switchShapeItemKind(item: ShapeItem, nextKind: ShapeKind): ShapeItem {
  const g = item.geo
  if (g.kind === nextKind) return item
  const box = g.vertices?.length ? boxOfVertices(g.vertices) : { ax: g.ax, ay: g.ay, bx: g.bx, by: g.by }
  const nextGeo: ShapeGeometry = {
    kind: nextKind,
    ax: box.ax,
    ay: box.ay,
    bx: box.bx,
    by: box.by,
    ...(g.rot && !is3D(nextKind) && !isLinear(nextKind) ? { rot: g.rot } : {})
  }
  if (SHAPE_BASES[nextKind]) {
    const inferred = naturalSidesOf(g)
    nextGeo.sides = inferred !== undefined ? Math.max(MIN_BASE, Math.min(MAX_BASE, inferred)) : SHAPE_BASES[nextKind]!.def
  }
  if (is3D(nextKind)) {
    const w = Math.abs(box.bx - box.ax)
    const h = Math.abs(box.by - box.ay)
    nextGeo.dim3 = is3D(g.kind) && g.dim3 ? [...g.dim3] : defaultDim3(nextKind, w, h)
    if (is3D(g.kind) && g.rot3) nextGeo.rot3 = [...g.rot3]
    else nextGeo.orbit = is3D(g.kind) && g.orbit ? [...g.orbit] : [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]]
    if (nextKind === 'obliquePyramid') nextGeo.slant3 = [0.85, 0]
  }
  return carryLabels(item, pruneAnnotations(withShapeUpdate(item, { geo: nextGeo })))
}

/** Change side/base/point count on polygon, star, prism or pyramid (3..24). */
export function setShapeItemSides(item: ShapeItem, sides: number): ShapeItem {
  if (!SHAPE_BASES[item.geo.kind]) return item
  const clamped = Math.max(MIN_BASE, Math.min(MAX_BASE, Math.round(sides)))
  const nextGeo: ShapeGeometry = { ...item.geo, sides: clamped }
  if (nextGeo.kind === 'polygon') delete nextGeo.vertices
  delete nextGeo.vertices3
  return carryLabels(item, pruneAnnotations(withShapeUpdate(item, { geo: nextGeo })))
}

export function toggleLabel(item: ShapeItem, vertexId: string): ShapeItem {
  const ev = evaluateShape(item)
  const v = ev.vertices.find((x) => x.id === vertexId)
  if (!v) return item
  const next = { ...(item.labels ?? {}) }
  if (next[vertexId]) delete next[vertexId]
  else next[vertexId] = v.defaultLabel
  return withShapeUpdate(item, { labels: next })
}

export function setLabel(item: ShapeItem, vertexId: string, text: string): ShapeItem {
  const next = { ...(item.labels ?? {}) }
  const cleaned = text.trim().slice(0, 4)
  if (cleaned) next[vertexId] = cleaned
  else delete next[vertexId]
  return withShapeUpdate(item, { labels: next })
}

/** The vertices that "show letters" labels: not a star's inner points or a round shape's quarter points. */
export function labelVertices(item: ShapeItem): EvalVertex[] {
  const round = item.geo.kind === 'ellipse' || item.geo.kind === 'cylinder' || item.geo.kind === 'cone' || item.geo.kind === 'sphere'
  return evaluateShape(item).vertices.filter((v) => v.role !== 'inner' && !(round && v.role === 'cardinal'))
}

export function toggleAllLabels(item: ShapeItem, on: boolean): ShapeItem {
  if (!on) return withShapeUpdate(item, { labels: undefined })
  const next: Record<string, string> = { ...(item.labels ?? {}) }
  for (const v of labelVertices(item)) next[v.id] = next[v.id] ?? v.defaultLabel
  return withShapeUpdate(item, { labels: next })
}

/**
 * Carry the letters over when the shape's vertices change (side count, kind): letters the user typed
 * stay on their vertex, default letters are given out again in order (A, B, C, not what the old
 * shape had there), and when every vertex had a letter, the new ones get one too.
 */
function carryLabels(before: ShapeItem, after: ShapeItem): ShapeItem {
  if (!before.labels) return after
  const old = labelVertices(before)
  const all = old.length > 0 && old.every((v) => !!before.labels![v.id])
  const auto = new Set(old.filter((v) => before.labels![v.id] === v.defaultLabel).map((v) => v.id))
  const next: Record<string, string> = {}
  for (const v of labelVertices(after)) {
    const had = before.labels[v.id]
    if (had && !auto.has(v.id)) next[v.id] = had
    else if (all || (had && auto.has(v.id))) next[v.id] = v.defaultLabel
  }
  return withShapeUpdate(after, { labels: Object.keys(next).length ? next : undefined })
}

export function toggleAngle(item: ShapeItem, vertexId: string): ShapeItem {
  const ev = evaluateShape(item)
  const v = ev.vertices.find((x) => x.id === vertexId)
  if (!v || v.angleDeg === undefined) return item
  const set = new Set(item.angles ?? [])
  if (set.has(vertexId)) set.delete(vertexId)
  else set.add(vertexId)
  return withShapeUpdate(item, { angles: [...set] })
}

export function toggleAllAngles(item: ShapeItem, on: boolean): ShapeItem {
  if (!on) return withShapeUpdate(item, { angles: undefined })
  const ev = evaluateShape(item)
  const ids = ev.vertices.filter((v) => v.angleDeg !== undefined && v.role !== 'inner').map((v) => v.id)
  if (!ids.length) return item
  return withShapeUpdate(item, { angles: ids })
}

export function toggleLength(item: ShapeItem, targetId: string): ShapeItem {
  const set = new Set(item.lengths ?? [])
  if (set.has(targetId)) set.delete(targetId)
  else set.add(targetId)
  return withShapeUpdate(item, { lengths: [...set] })
}

export function toggleAllLengths(item: ShapeItem, on: boolean): ShapeItem {
  if (!on) return withShapeUpdate(item, { lengths: undefined })
  const ev = evaluateShape(item)
  if (item.geo.kind === 'ellipse') return withShapeUpdate(item, { lengths: ['e0'] })
  if (item.geo.kind === 'sphere') return withShapeUpdate(item, { lengths: ['outer'] })
  const ids = ev.edges.map((e) => e.id)
  if (!ids.length) return item
  return withShapeUpdate(item, { lengths: ids })
}

export function hasConstruction(item: ShapeItem, id: string): boolean {
  return Boolean(item.constructions?.some((c) => c.id === id))
}

export function toggleConstruction(item: ShapeItem, construction: ShapeConstruction): ShapeItem {
  const list = item.constructions ?? []
  const exists = list.some((c) => c.id === construction.id)
  const next = exists ? list.filter((c) => c.id !== construction.id) : [...list, construction]
  const lengths = exists ? item.lengths?.filter((id) => id !== construction.id) : item.lengths
  return withShapeUpdate(item, { constructions: next, lengths })
}

export function toggleConstructionBatch(item: ShapeItem, batch: readonly ShapeConstruction[]): ShapeItem {
  const allOn = batch.every((c) => hasConstruction(item, c.id))
  let out = item
  if (allOn) {
    const drop = new Set(batch.map((c) => c.id))
    out = withShapeUpdate(out, {
      constructions: (out.constructions ?? []).filter((c) => !drop.has(c.id)),
      lengths: out.lengths?.filter((id) => !drop.has(id))
    })
  } else {
    const existing = new Set((out.constructions ?? []).map((c) => c.id))
    const add = batch.filter((c) => !existing.has(c.id))
    out = withShapeUpdate(out, { constructions: [...(out.constructions ?? []), ...add] })
  }
  return out
}

export function applyShapeItemDefaults(item: ShapeItem, defaults: ShapeItemDefaults): ShapeItem {
  let out = item
  if (defaults.showLabels) out = toggleAllLabels(out, true)
  if (defaults.showAngles) out = toggleAllAngles(out, true)
  if (defaults.showLengths) out = toggleAllLengths(out, true)
  return out
}

/** Opposite edge for an altitude from vertex `vIdx` of an n-gon (default opposite or bottom base). */
function defaultAltitudeEdgeForVertex(geo: ShapeGeometry, vIdx: number, n: number): number {
  if (n === 3) return (vIdx + 1) % 3
  if (geo.kind === 'trapezoid' || geo.kind === 'parallelogram') {
    // Top corners v0/v1 drop to bottom base e2; bottom corners v2/v3 drop to top base e0.
    return vIdx < 2 ? 2 : 0
  }
  // General polygon / rhombus / rectangle: edge opposite vertex.
  return (vIdx + Math.floor(n / 2)) % n
}

/**
 * Universal connectable target points from vertex `v` across ANY 2D or 3D shape:
 * every non-adjacent vertex (no artificial 3-target cap, including all cube/prism face & space
 * diagonals, all n-gon/star diagonals, and ellipse/cylinder/cone/sphere chords & radii),
 * plus active center `O` and active edge midpoints (`mid:<edgeId>`) for stereometric sections.
 */
function connectTargetsForVertex(
  item: ShapeItem,
  v: EvalVertex,
  vertices: readonly EvalVertex[],
  edges: readonly EvalEdge[]
): ConnectTarget[] {
  const adjacent = new Set<string>([v.id])
  for (const e of edges) {
    if (e.from === v.id) adjacent.add(e.to)
    if (e.to === v.id) adjacent.add(e.from)
  }

  const ordered: { targetId: string; label: string }[] = []
  const seen = new Set<string>()
  const pushVertex = (u: EvalVertex | undefined): void => {
    if (!u || adjacent.has(u.id) || seen.has(u.id)) return
    seen.add(u.id)
    ordered.push({ targetId: u.id, label: item.labels?.[u.id] ?? u.defaultLabel })
  }

  if (!is3D(item.geo.kind)) {
    const n = vertices.length
    const idx = vertices.findIndex((x) => x.id === v.id)
    if (n >= 4 && idx >= 0 && item.geo.kind !== 'ellipse') {
      // Opposite vertex first, then every remaining non-adjacent vertex in order.
      pushVertex(vertices[(idx + Math.floor(n / 2)) % n])
    }
    for (const u of vertices) pushVertex(u)
  } else {
    // Prioritize space/base diagonals first on cube & prism, then every other non-adjacent vertex (including face diagonals!).
    if (item.geo.kind === 'cube' || item.geo.kind === 'prism') {
      const isBottom = v.id.startsWith('b')
      const isTop = v.id.startsWith('t')
      if (isBottom || isTop) {
        const idx = Number(v.id.slice(1))
        const half = vertices.length / 2
        if (half >= 4) {
          const oppIdx = (idx + Math.floor(half / 2)) % half
          pushVertex(vertices.find((u) => u.id === `${isBottom ? 't' : 'b'}${oppIdx}`))
          pushVertex(vertices.find((u) => u.id === `${isBottom ? 'b' : 't'}${oppIdx}`))
        }
      }
    } else if ((item.geo.kind === 'pyramid' || item.geo.kind === 'obliquePyramid') && v.id.startsWith('b')) {
      const baseVerts = vertices.filter((u) => u.id.startsWith('b'))
      if (baseVerts.length >= 4) {
        const idx = Number(v.id.slice(1))
        pushVertex(baseVerts[(idx + Math.floor(baseVerts.length / 2)) % baseVerts.length])
      }
    }
    for (const u of vertices) pushVertex(u)
  }

  // Also include active center O (when not already in `vertices`) and active edge midpoints for cross-sections!
  if (hasConstruction(item, 'center') && !seen.has('center') && v.id !== 'center') {
    seen.add('center')
    ordered.push({ targetId: 'center', label: item.labels?.center ?? 'O' })
  }
  const byV = new Map(vertices.map((u) => [u.id, u]))
  for (const c of item.constructions ?? []) {
    if (c.kind !== 'midpoint') continue
    const e = edges.find((x) => x.id === c.edge)
    if (!e || e.from === v.id || e.to === v.id) continue
    const midTarget = `mid:${e.id}`
    if (seen.has(midTarget)) continue
    seen.add(midTarget)
    const aL = item.labels?.[e.from] ?? byV.get(e.from)?.defaultLabel ?? ''
    const bL = item.labels?.[e.to] ?? byV.get(e.to)?.defaultLabel ?? ''
    ordered.push({ targetId: midTarget, label: aL && bL ? `M(${aL}${bL})` : 'M' })
  }

  return ordered.map(({ targetId, label }) => {
    const id = canonicalDiagId(v.id, targetId)
    return {
      id,
      targetId,
      label,
      active: hasConstruction(item, id),
      construction: { id, kind: 'diagonal', from: v.id, to: targetId }
    }
  })
}

function canonicalDiagId(a: string, b: string): string {
  return a < b ? `diag:${a}-${b}` : `diag:${b}-${a}`
}

/** Data-driven popover action list for ANY 2D or 3D vertex (no shape-kind branching in React!). */
export function availableVertexActions(item: ShapeItem, vertexId: string): VertexActionsModel | null {
  const ev = evaluateShape(item)
  const vertex = ev.vertices.find((v) => v.id === vertexId)
  if (!vertex) return null
  const constructions: ConstructionAction[] = []

  if (!ev.is3D) {
    const n = ev.vertices.length
    const vIdx = ev.vertices.findIndex((v) => v.id === vertexId)
    if (isTriangle(item.geo.kind) && vIdx >= 0) {
      const oppEdge = `e${(vIdx + 1) % 3}`
      const altId = `alt:${vertexId}`
      const medId = `med:${vertexId}`
      const bisId = `bis:${vertexId}`
      constructions.push(
        { id: altId, labelKey: 'shape.altitude', active: hasConstruction(item, altId), construction: { id: altId, kind: 'altitude', from: vertexId, toEdge: oppEdge } },
        { id: medId, labelKey: 'shape.median', active: hasConstruction(item, medId), construction: { id: medId, kind: 'median', from: vertexId, toEdge: oppEdge } },
        { id: bisId, labelKey: 'shape.bisector', active: hasConstruction(item, bisId), construction: { id: bisId, kind: 'bisector', from: vertexId } }
      )
    } else if (n >= 4 && ev.edges.length === n && vertex.role === 'corner') {
      const toEdge = `e${defaultAltitudeEdgeForVertex(item.geo, vIdx, n)}`
      const altId = `alt:${vertexId}`
      constructions.push({
        id: altId,
        labelKey: 'shape.altitude',
        active: hasConstruction(item, altId),
        construction: { id: altId, kind: 'altitude', from: vertexId, toEdge }
      })
      const bisId = `bis:${vertexId}`
      constructions.push({
        id: bisId,
        labelKey: 'shape.bisector',
        active: hasConstruction(item, bisId),
        construction: { id: bisId, kind: 'bisector', from: vertexId }
      })
    } else if (item.geo.kind === 'ellipse' && vertexId === 'center') {
      constructions.push(
        { id: 'center', labelKey: 'shape.center', active: hasConstruction(item, 'center'), construction: { id: 'center', kind: 'center' } },
        { id: 'radius', labelKey: 'shape.radius', active: hasConstruction(item, 'radius'), construction: { id: 'radius', kind: 'radius' } },
        { id: 'diameter', labelKey: 'shape.diameter', active: hasConstruction(item, 'diameter'), construction: { id: 'diameter', kind: 'diameter' } }
      )
    }
  } else {
    // 3D vertex actions!
    if (vertexId === 'apex' && (item.geo.kind === 'pyramid' || item.geo.kind === 'obliquePyramid' || item.geo.kind === 'cone')) {
      constructions.push({
        id: 'alt:apex',
        labelKey: 'shape.height3d',
        active: hasConstruction(item, 'alt:apex'),
        construction: { id: 'alt:apex', kind: 'altitude', from: 'apex' }
      })
    }
    if (vertexId === 'topCenter' && item.geo.kind === 'cylinder') {
      constructions.push({
        id: 'axis',
        labelKey: 'shape.axis',
        active: hasConstruction(item, 'axis'),
        construction: { id: 'axis', kind: 'axis' }
      })
    }
    if (vertexId === 'center') {
      constructions.push({
        id: 'center',
        labelKey: 'shape.center',
        active: hasConstruction(item, 'center'),
        construction: { id: 'center', kind: 'center' }
      })
      if (item.geo.kind === 'cylinder' || item.geo.kind === 'cone' || item.geo.kind === 'sphere') {
        constructions.push({
          id: 'radius',
          labelKey: 'shape.radius',
          active: hasConstruction(item, 'radius'),
          construction: { id: 'radius', kind: 'radius' }
        })
      }
    }
  }

  const connectTargets = connectTargetsForVertex(item, vertex, ev.vertices, ev.edges)

  return {
    vertex,
    currentLabel: item.labels?.[vertexId] ?? null,
    hasAngle: vertex.angleDeg !== undefined && vertex.role !== 'inner',
    angleOn: Boolean(item.angles?.includes(vertexId)),
    constructions,
    connectTargets,
    canRemove: item.geo.kind === 'polygon' && ev.vertices.length > MIN_BASE
  }
}

/** Data-driven popover action list for ANY 2D or 3D edge (no shape-kind branching in React!). */
export function availableEdgeActions(item: ShapeItem, edgeId: string): EdgeActionsModel | null {
  const ev = evaluateShape(item)
  const edge = ev.edges.find((e) => e.id === edgeId)
  if (!edge) return null
  const mid: Vec2 = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2]
  const constructions: ConstructionAction[] = []

  // Universal midpoint marker on ANY edge (2D or 3D)!
  const midId = `mid:${edgeId}`
  constructions.push({
    id: midId,
    labelKey: 'shape.midpoint',
    active: hasConstruction(item, midId),
    construction: { id: midId, kind: 'midpoint', edge: edgeId }
  })

  if (!ev.is3D) {
    const eIdx = ev.edges.findIndex((e) => e.id === edgeId)
    if (isTriangle(item.geo.kind) && eIdx >= 0) {
      const oppV = `v${(eIdx + 2) % 3}`
      const altId = `alt:${oppV}`
      const medId = `med:${oppV}`
      constructions.push(
        { id: altId, labelKey: 'shape.altitudeToEdge', active: hasConstruction(item, altId), construction: { id: altId, kind: 'altitude', from: oppV, toEdge: edgeId } },
        { id: medId, labelKey: 'shape.medianToEdge', active: hasConstruction(item, medId), construction: { id: medId, kind: 'median', from: oppV, toEdge: edgeId } }
      )
    } else if (item.geo.kind === 'trapezoid' && (edgeId === 'e1' || edgeId === 'e3')) {
      constructions.push({
        id: 'midline:e3-e1',
        labelKey: 'shape.midline',
        active: hasConstruction(item, 'midline:e3-e1'),
        construction: { id: 'midline:e3-e1', kind: 'midline', edgeA: 'e3', edgeB: 'e1' }
      })
    } else if (ev.edges.length === 4 && eIdx >= 0) {
      const oppEdge = `e${(eIdx + 2) % 4}`
      const mlId = eIdx < (eIdx + 2) % 4 ? `midline:${edgeId}-${oppEdge}` : `midline:${oppEdge}-${edgeId}`
      constructions.push({
        id: mlId,
        labelKey: 'shape.midline',
        active: hasConstruction(item, mlId),
        construction: { id: mlId, kind: 'midline', edgeA: edgeId, edgeB: oppEdge }
      })
    }
  } else {
    // 3D pyramid base edge -> Apothem (slant height from apex S to edge midpoint)!
    if ((item.geo.kind === 'pyramid' || item.geo.kind === 'obliquePyramid') && edge.role === 'base') {
      const apoId = `apo:${edgeId}`
      constructions.push({
        id: apoId,
        labelKey: 'shape.apothem',
        active: hasConstruction(item, apoId),
        construction: { id: apoId, kind: 'apothem', edge: edgeId }
      })
    }
  }

  return {
    edge,
    mid,
    lengthOn: Boolean(item.lengths?.includes(edgeId)),
    constructions,
    canAddVertex: item.geo.kind === 'polygon' && ev.vertices.length < MAX_BASE
  }
}

/** Whole-shape geometric element toggles shown cleanly in the SelectionToolbar shape popover. */
export function availableWholeShapeActions(item: ShapeItem): WholeShapeAction[] {
  const k = item.geo.kind
  const mk = (id: string, labelKey: string, constructions: ShapeConstruction[]): WholeShapeAction => ({
    id,
    labelKey,
    active: constructions.every((c) => hasConstruction(item, c.id)),
    constructions
  })

  if (isTriangle(k)) {
    return [
      mk('incircle', 'shape.incircle', [{ id: 'incircle', kind: 'incircle' }]),
      mk('circumcircle', 'shape.circumcircle', [{ id: 'circumcircle', kind: 'circumcircle' }])
    ]
  }
  switch (k) {
    case 'rhombus':
      return [
        mk('diagonals', 'shape.diagonals', [
          { id: 'diag:v0-v2', kind: 'diagonal', from: 'v0', to: 'v2' },
          { id: 'diag:v1-v3', kind: 'diagonal', from: 'v1', to: 'v3' }
        ]),
        mk('incircle', 'shape.incircle', [{ id: 'incircle', kind: 'incircle' }])
      ]
    case 'rectangle':
      return [
        mk('diagonals', 'shape.diagonals', [
          { id: 'diag:v0-v2', kind: 'diagonal', from: 'v0', to: 'v2' },
          { id: 'diag:v1-v3', kind: 'diagonal', from: 'v1', to: 'v3' }
        ]),
        mk('circumcircle', 'shape.circumcircle', [{ id: 'circumcircle', kind: 'circumcircle' }])
      ]
    case 'parallelogram':
      return [
        mk('diagonals', 'shape.diagonals', [
          { id: 'diag:v0-v2', kind: 'diagonal', from: 'v0', to: 'v2' },
          { id: 'diag:v1-v3', kind: 'diagonal', from: 'v1', to: 'v3' }
        ]),
        mk('alt:v0', 'shape.altitude', [{ id: 'alt:v0', kind: 'altitude', from: 'v0', toEdge: 'e2' }])
      ]
    case 'trapezoid':
      return [
        mk('midline:e3-e1', 'shape.midline', [{ id: 'midline:e3-e1', kind: 'midline', edgeA: 'e3', edgeB: 'e1' }]),
        mk('diagonals', 'shape.diagonals', [
          { id: 'diag:v0-v2', kind: 'diagonal', from: 'v0', to: 'v2' },
          { id: 'diag:v1-v3', kind: 'diagonal', from: 'v1', to: 'v3' }
        ]),
        mk('alt:v0', 'shape.altitude', [{ id: 'alt:v0', kind: 'altitude', from: 'v0', toEdge: 'e2' }])
      ]
    case 'pentagon':
    case 'hexagon':
      return [
        mk('incircle', 'shape.incircle', [{ id: 'incircle', kind: 'incircle' }]),
        mk('circumcircle', 'shape.circumcircle', [{ id: 'circumcircle', kind: 'circumcircle' }]),
        mk('center', 'shape.center', [{ id: 'center', kind: 'center' }])
      ]
    case 'polygon':
      return item.geo.vertices
        ? [mk('center', 'shape.center', [{ id: 'center', kind: 'center' }])]
        : [
            mk('incircle', 'shape.incircle', [{ id: 'incircle', kind: 'incircle' }]),
            mk('circumcircle', 'shape.circumcircle', [{ id: 'circumcircle', kind: 'circumcircle' }]),
            mk('center', 'shape.center', [{ id: 'center', kind: 'center' }])
          ]
    case 'ellipse':
      return [
        mk('center', 'shape.center', [{ id: 'center', kind: 'center' }]),
        mk('radius', 'shape.radius', [{ id: 'radius', kind: 'radius' }]),
        mk('diameter', 'shape.diameter', [{ id: 'diameter', kind: 'diameter' }])
      ]
    case 'cube':
      return [
        mk('diag:b0-t2', 'shape.spaceDiagonal', [{ id: 'diag:b0-t2', kind: 'diagonal', from: 'b0', to: 't2' }]),
        mk('diag:b0-b2', 'shape.baseDiagonal', [{ id: 'diag:b0-b2', kind: 'diagonal', from: 'b0', to: 'b2' }]),
        mk('axis', 'shape.axis', [{ id: 'axis', kind: 'axis' }])
      ]
    case 'prism':
      return [
        mk('axis', 'shape.axis', [{ id: 'axis', kind: 'axis' }]),
        mk('center', 'shape.center', [{ id: 'center', kind: 'center' }])
      ]
    case 'pyramid':
    case 'obliquePyramid':
      return [
        mk('alt:apex', 'shape.height3d', [{ id: 'alt:apex', kind: 'altitude', from: 'apex' }]),
        mk('apo:eb0', 'shape.apothem', [{ id: 'apo:eb0', kind: 'apothem', edge: 'eb0' }]),
        mk('center', 'shape.center', [{ id: 'center', kind: 'center' }])
      ]
    case 'cylinder':
      return [
        mk('axis', 'shape.axis', [{ id: 'axis', kind: 'axis' }]),
        mk('radius', 'shape.radius', [{ id: 'radius', kind: 'radius' }]),
        mk('section', 'shape.axialSection', [{ id: 'section', kind: 'section' }])
      ]
    case 'cone':
      return [
        mk('alt:apex', 'shape.height3d', [{ id: 'alt:apex', kind: 'altitude', from: 'apex' }]),
        mk('radius', 'shape.radius', [{ id: 'radius', kind: 'radius' }]),
        mk('section', 'shape.axialSection', [{ id: 'section', kind: 'section' }])
      ]
    case 'sphere':
      return [
        mk('center', 'shape.center', [{ id: 'center', kind: 'center' }]),
        mk('radius', 'shape.radius', [{ id: 'radius', kind: 'radius' }]),
        mk('meridian', 'shape.meridian', [{ id: 'meridian', kind: 'meridian' }])
      ]
    default:
      return []
  }
}
