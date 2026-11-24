import type { ShapeConstruction, ShapeGeometry, ShapeItem, ShapeSpec } from './types'
import type { ShapeStyle } from './shapeItems'
import { is3D } from './shapes'
import { shapeBBox } from './shapeEval'
import { defaultDim3, DEFAULT_ORBIT } from './shapeEval3d'

export interface ShapeItemData {
  geo: ShapeGeometry
  labels?: Record<string, string>
  angles?: string[]
  lengths?: string[]
  constructions?: ShapeConstruction[]
}

/** Convert a legacy ShapeSpec (v4-v11 or shape recognition output) into first-class ShapeItem data. */
export function specToShapeData(spec: ShapeSpec): ShapeItemData {
  const geo: ShapeGeometry = {
    kind: spec.kind,
    ax: spec.ax,
    ay: spec.ay,
    bx: spec.bx,
    by: spec.by,
    ...(spec.rot ? { rot: spec.rot } : {}),
    ...(spec.vertices ? { vertices: spec.vertices.map(([x, y]) => [x, y]) } : {}),
    ...(spec.base !== undefined ? { sides: spec.base } : {}),
    ...(spec.skew !== undefined ? { skew: spec.skew } : {}),
    ...(spec.topLeft !== undefined ? { topLeft: spec.topLeft } : {}),
    ...(spec.topRight !== undefined ? { topRight: spec.topRight } : {}),
    ...(spec.innerRatio !== undefined ? { innerRatio: spec.innerRatio } : {})
  }
  if (is3D(spec.kind)) {
    geo.dim3 = defaultDim3(spec.kind, spec.bx - spec.ax, spec.by - spec.ay)
    geo.orbit = [DEFAULT_ORBIT[0], DEFAULT_ORBIT[1]]
    if (spec.kind === 'obliquePyramid') geo.slant3 = [0.85, 0]
  }
  const constructions: ShapeConstruction[] = []
  if (spec.incircle) constructions.push({ id: 'incircle', kind: 'incircle' })
  if (spec.circumcircle) constructions.push({ id: 'circumcircle', kind: 'circumcircle' })
  for (const idx of spec.altitudeAt ?? []) {
    constructions.push({ id: `alt:v${idx}`, kind: 'altitude', from: `v${idx}`, toEdge: `e${(idx + 1) % 3}` })
  }
  for (const idx of spec.medianAt ?? []) {
    constructions.push({ id: `med:v${idx}`, kind: 'median', from: `v${idx}`, toEdge: `e${(idx + 1) % 3}` })
  }
  for (const idx of spec.bisectorAt ?? []) {
    constructions.push({ id: `bis:v${idx}`, kind: 'bisector', from: `v${idx}` })
  }
  const angles = spec.angleAt?.length ? spec.angleAt.map((i) => `v${i}`) : undefined
  const lengths = spec.lengthAt?.length ? spec.lengthAt.map((i) => `e${i}`) : undefined
  return {
    geo,
    ...(angles ? { angles } : {}),
    ...(lengths ? { lengths } : {}),
    ...(constructions.length ? { constructions } : {})
  }
}

/** Build a complete first-class ShapeItem with an accurate precomputed bbox. */
export function createShapeItem(
  data: ShapeItemData,
  style: ShapeStyle,
  slot: { id: string; z: number },
  opts?: { groupId?: string; locked?: boolean; rot?: number }
): ShapeItem {
  const caps = data.geo.kind === 'line' ? { startCap: style.startCap, endCap: style.endCap } : {}
  const base: Omit<ShapeItem, 'bbox'> = {
    type: 'shape',
    id: slot.id,
    z: slot.z,
    tool: style.tool,
    color: style.color,
    size: style.size,
    geo: data.geo,
    ...(style.dash ? { dash: style.dash } : {}),
    ...(caps.startCap ? { startCap: caps.startCap } : {}),
    ...(caps.endCap ? { endCap: caps.endCap } : {}),
    ...(data.labels && Object.keys(data.labels).length ? { labels: data.labels } : {}),
    ...(data.angles?.length ? { angles: data.angles } : {}),
    ...(data.lengths?.length ? { lengths: data.lengths } : {}),
    ...(data.constructions?.length ? { constructions: data.constructions } : {}),
    ...(opts?.groupId ? { groupId: opts.groupId } : {}),
    ...(opts?.locked ? { locked: opts.locked } : {}),
    ...(opts?.rot ? { rot: opts.rot } : {})
  }
  return { ...base, bbox: shapeBBox(base) }
}
