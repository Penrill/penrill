import { isLinear, isTriangle, shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import type { ShapeSpec, StrokeItem, Vec2 } from '@penrill/core/types'

export interface ShapeEdgeTarget {
  index: number
  a: Vec2
  b: Vec2
  mid: Vec2
  length: number
}

export interface ShapeMeasurementDefaults {
  showAngles: boolean
  showLengths: boolean
}

export type VertexFeature = 'altitude' | 'median' | 'bisector' | 'angle'
export type EdgeFeature = 'length' | 'altitude' | 'median'

/** Triangle edge `e` (connecting vertex `e` and `(e+1)%3`) is opposite vertex `(e+2)%3`. */
export const triangleOppositeVertex = (edgeIndex: number): number => (edgeIndex + 2) % 3

function toggleInList(list: readonly number[] | undefined, index: number): number[] | undefined {
  const set = new Set(list ?? [])
  if (set.has(index)) set.delete(index)
  else set.add(index)
  const out = [...set].sort((a, b) => a - b)
  return out.length ? out : undefined
}

/** All clickable edges for 2D polygonal and linear shapes (plus a single synthetic edge on ellipse). */
export function shapeEdgeTargets(spec: ShapeSpec): ShapeEdgeTarget[] {
  const edges = shapeEdges(spec)
  if (edges.length) {
    return edges.map(({ index, a, b }) => ({
      index,
      a,
      b,
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      length: Math.hypot(b[0] - a[0], b[1] - a[1])
    }))
  }
  return []
}

/** Toggle a per-vertex construction or angle display on a specific vertex index. */
export function toggleVertexFeature(spec: ShapeSpec, vertexIndex: number, feature: VertexFeature): ShapeSpec {
  const next: ShapeSpec = { ...spec }
  if (feature === 'angle') {
    const count = shapePolygonVertices(spec).length
    if (vertexIndex < 0 || vertexIndex >= count) return spec
    const list = toggleInList(spec.angleAt, vertexIndex)
    if (list) next.angleAt = list
    else delete next.angleAt
    return next
  }
  if (!isTriangle(spec.kind) || vertexIndex < 0 || vertexIndex > 2) return spec
  const key = feature === 'altitude' ? 'altitudeAt' : feature === 'median' ? 'medianAt' : 'bisectorAt'
  const list = toggleInList(spec[key], vertexIndex)
  if (list) next[key] = list
  else delete next[key]
  return next
}

/** Toggle a per-edge length display, or (on a triangle) the altitude / median to that side. */
export function toggleEdgeFeature(spec: ShapeSpec, edgeIndex: number, feature: EdgeFeature): ShapeSpec {
  if (feature === 'length') {
    const maxCount = spec.kind === 'ellipse' ? 1 : shapeEdges(spec).length
    if (edgeIndex < 0 || edgeIndex >= maxCount) return spec
    const next: ShapeSpec = { ...spec }
    const list = toggleInList(spec.lengthAt, edgeIndex)
    if (list) next.lengthAt = list
    else delete next.lengthAt
    return next
  }
  if (!isTriangle(spec.kind) || edgeIndex < 0 || edgeIndex > 2) return spec
  return toggleVertexFeature(spec, triangleOppositeVertex(edgeIndex), feature)
}

/** Turn angle display on or off for every corner of a polygonal 2D shape. */
export function toggleAllAngles(spec: ShapeSpec, on: boolean): ShapeSpec {
  const count = shapePolygonVertices(spec).length
  if (!count) return spec
  const next: ShapeSpec = { ...spec }
  if (on) next.angleAt = Array.from({ length: count }, (_, i) => i)
  else delete next.angleAt
  return next
}

/** Turn length / dimension display on or off for every edge (or ellipse/line) of a 2D shape. */
export function toggleAllLengths(spec: ShapeSpec, on: boolean): ShapeSpec {
  const count = spec.kind === 'ellipse' ? 1 : shapeEdges(spec).length
  if (!count) return spec
  const next: ShapeSpec = { ...spec }
  if (on) next.lengthAt = Array.from({ length: count }, (_, i) => i)
  else delete next.lengthAt
  return next
}

/** Apply user Settings defaults (both off by default) to a newly inserted shape spec. */
export function applyDefaultMeasurements(spec: ShapeSpec, defaults: ShapeMeasurementDefaults): ShapeSpec {
  let out = spec
  if (defaults.showAngles) out = toggleAllAngles(out, true)
  if (defaults.showLengths) out = toggleAllLengths(out, true)
  return out
}

/** Shift stored vertex/edge indices when a new vertex is inserted at `insertAt`. */
export function remapIndicesOnInsert(list: readonly number[] | undefined, insertAt: number): number[] | undefined {
  if (!list?.length) return undefined
  return list.map((i) => (i >= insertAt ? i + 1 : i)).sort((a, b) => a - b)
}

/** Drop `removeAt` and shift higher indices down when a vertex is removed from a polygon. */
export function remapIndicesOnRemove(list: readonly number[] | undefined, removeAt: number): number[] | undefined {
  if (!list?.length) return undefined
  const out = list.filter((i) => i !== removeAt).map((i) => (i > removeAt ? i - 1 : i))
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : undefined
}

/**
 * True when `item` is the primary outline stroke of a shape (part 0), so vector annotations are
 * drawn exactly once per shape even for multi-part triangles with circles and altitudes.
 */
export function isPrimaryShapeStroke(item: StrokeItem): boolean {
  const spec = item.shape
  if (!spec || item.dash) return false
  if (isLinear(spec.kind) || spec.kind === 'ellipse') return true
  const polyCount = shapePolygonVertices(spec).length
  if (polyCount >= 3) return item.points.length === polyCount + 1
  return false
}
