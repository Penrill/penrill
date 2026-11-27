import { validateRows, type Row } from '@penrill/math/formula'
import { isEquation } from './formulaexpr'
import { formulaBBox } from './formulatype'
import { graphBBox, sanitizeGraph } from './graph'
import { shapeBBox } from '@penrill/core/shapeEval'
import { quatNormalize } from '@penrill/core/shapeEval3d'
import { isShapeKind, MAX_BASE, MIN_BASE } from '@penrill/core/shapes'
import { turnedBBox } from '@penrill/core/geometry'
import { bgPattern, isBackgroundKind, isChalk, SCHOOL_PATTERNS } from './surface'
import { textBBox } from './text'
import type { TextRun } from '@penrill/core/types'
import type {
  BackgroundKind,
  Camera,
  FormulaItem,
  GraphItem,
  GraphParams,
  Item,
  LineCap,
  LineDash,
  Point,
  ShapeConstruction,
  TangentMarks,
  ShapeGeometry,
  ShapeItem,
  ShapeSpec,
  TextItem,
  Vec2,
  Vec3
} from '@penrill/core/types'

/**
 * Board document format (`.penrill` files, formerly `.inkboard`): plain UTF-8 JSON (legacy gzip-compressed files are still accepted on read).
 * Ink stays vector (flattened point lists). Images are referenced by key in `assets`.
 */
/** The format id inside every board file. Keeps the app's former name so older versions can still read boards. */
export const FORMAT = 'inkboard'
/**
 * 2 = straight-line strokes (`geom`), coordinate graphs, groups.
 * 3 = line patterns (`dash`) and line ends (`startCap` / `endCap`).
 * 4 = editable shapes (`shape` spec on shape strokes), locked items (`locked`), text items.
 * 5 = formatted text (`runs` on text items), any number of sides for a solid's base.
 * 6 = functions plotted on coordinate planes (`fns` on graphs).
 * 7 = formula items (built on the math keypad); functions drawn on a range only (`from` / `to`, `yFrom` / `yTo`),
 *     named functions and other variables (`name`, `arg`; older versions show them as y and x).
 * 8 = chalkboard surface (`chalk-<pattern>` backgrounds).
 * 9 = school paper patterns (`math`, `hand`, `slant` backgrounds, on paper or chalkboard).
 * 10 = turned images, texts and formulas (`rot`; turned ink needs nothing new, its points turn).
 * 11 = triangle incircles and circumcircles, oblique pyramids (editable shape specifications).
 * 12 = direct shape editor: arbitrary triangle/polygon vertices, triangle constructions (altitudes,
 *      medians, bisectors, right-angle mark), rotated editable shapes, parameterized 2D/3D shapes.
 * 13 = special points marked on coordinate planes (`points`: extrema, roots, intersections).
 * 14 = tangents to circles (`tangent` constructions) and their marks (`tangentMarks`).
 * 15 = filled flat shapes (`fill` on shape items).
 * Readers accept ≤ this; older apps refuse newer files instead of silently dropping data.
 * A file is stamped with the lowest version that can show it.
 */
export const FORMAT_VERSION = 15

function needsV12Shape(spec: ShapeSpec | undefined): boolean {
  if (!spec) return false
  return Boolean(
    spec.kind === 'polygon' ||
    spec.rot ||
    spec.vertices ||
    spec.altitudeAt?.length ||
    spec.medianAt?.length ||
    spec.bisectorAt?.length ||
    spec.angleAt?.length ||
    spec.lengthAt?.length ||
    spec.skew !== undefined ||
    spec.topLeft !== undefined ||
    spec.topRight !== undefined ||
    spec.innerRatio !== undefined ||
    spec.apex ||
    spec.depth !== undefined ||
    (spec.kind === 'star' && spec.base !== undefined)
  )
}

/** Lowest format version that can represent these items without losing anything. */
export function requiredVersion({ items, background }: Pick<BoardData, 'items' | 'background'>): number {
  if (items.some((i) => i.type === 'shape' && !!i.fill)) return 15
  if (items.some((i) => i.type === 'shape' && (!!i.tangentMarks || !!i.constructions?.some((c) => c.kind === 'tangent')))) return 14
  if (items.some((i) => i.type === 'graph' && !!i.points)) return 13
  if (items.some((i) => i.type === 'shape' || (i.type === 'stroke' && needsV12Shape(i.shape)))) return 12
  if (items.some((i) => i.type === 'stroke' && (i.shape?.kind === 'obliquePyramid' || i.shape?.incircle || i.shape?.circumcircle))) return 11
  if (items.some((i) => (i.type === 'image' || i.type === 'text' || i.type === 'formula') && !!i.rot)) return 10
  if (SCHOOL_PATTERNS.includes(bgPattern(background))) return 9
  if (isChalk(background)) return 8
  // Version 7: formulas, functions drawn on a range only (older versions would draw them whole), and
  // equations in x and y (older versions can't read them).
  const v7 = (i: Item): boolean =>
    i.type === 'formula' ||
    (i.type === 'graph' && !!i.fns?.some((f) => f.from !== undefined || f.to !== undefined || f.yFrom !== undefined || f.yTo !== undefined || (!!f.rows && isEquation(f.rows))))
  return items.some(v7) ? 7 : 6
}

interface SerializedStroke {
  type: 'stroke'
  id: string
  z: number
  tool: 'pen' | 'highlighter'
  color: string
  size: number
  pressure: boolean
  /** Flattened [x, y, pressure, x, y, pressure, ...]. */
  pts: number[]
  geom?: 'line'
  groupId?: string
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
  shape?: ShapeSpec
  locked?: boolean
  /** How much the (already turned) points were turned; older versions simply drop it. */
  rot?: number
}

interface SerializedGraph extends GraphParams {
  groupId?: string
  locked?: boolean
  type: 'graph'
  id: string
  z: number
  ox: number
  oy: number
  color: string
}

interface SerializedImage {
  groupId?: string
  locked?: boolean
  type: 'image'
  id: string
  z: number
  asset: string
  x: number
  y: number
  w: number
  h: number
  rot?: number
}

interface SerializedText {
  type: 'text'
  id: string
  z: number
  x: number
  y: number
  text: string
  size: number
  color: string
  runs?: TextRun[]
  groupId?: string
  locked?: boolean
  rot?: number
}

interface SerializedFormula {
  type: 'formula'
  id: string
  z: number
  x: number
  y: number
  size: number
  color: string
  rows: Row
  groupId?: string
  locked?: boolean
  rot?: number
}

interface SerializedShape {
  type: 'shape'
  id: string
  z: number
  tool: 'pen' | 'highlighter'
  color: string
  fill?: string
  size: number
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
  geo: ShapeGeometry
  labels?: Record<string, string>
  angles?: string[]
  lengths?: string[]
  constructions?: ShapeConstruction[]
  tangentMarks?: TangentMarks
  groupId?: string
  locked?: boolean
  rot?: number
}

type SerializedItem = SerializedStroke | SerializedImage | SerializedGraph | SerializedText | SerializedFormula | SerializedShape

export interface BoardFile {
  format: typeof FORMAT
  version: number
  background: BackgroundKind
  camera: Camera
  assets: Record<string, string>
  items: SerializedItem[]
}

export interface BoardData {
  items: Item[]
  background: BackgroundKind
  camera: Camera
}

/**
 * White ink is no longer offered: on the chalkboard dark ink already shows as chalk white, and white
 * vanishes on paper. Whatever was drawn white before is kept, as black.
 */
/** A colour a shape fill can use: #rgb, #rrggbb or #rrggbbaa. */
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)

export const noWhite = (c: string): string => (/^#(fff|ffffff)$/i.test(c) ? '#1e1e1e' : c)

const r2 = (v: number): number => Math.round(v * 100) / 100
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const r4 = (v: number): number => Math.round(v * 10000) / 10000

export function serializeBoard(data: BoardData): BoardFile {
  const assetKeys = new Map<string, string>()
  const assets: Record<string, string> = {}
  const items = data.items.map((it): SerializedItem => {
    if (it.type === 'stroke') {
      const pts: number[] = new Array(it.points.length * 3)
      it.points.forEach(([x, y, p], i) => {
        pts[i * 3] = r2(x)
        pts[i * 3 + 1] = r2(y)
        pts[i * 3 + 2] = r3(p)
      })
      const { id, z, tool, color, size, pressure, geom, groupId, dash, startCap, endCap, shape, locked, rot } = it
      return {
        type: 'stroke', id, z, tool, color, size, pressure, pts,
        ...(geom ? { geom } : {}),
        ...(groupId ? { groupId } : {}),
        ...(dash ? { dash } : {}),
        ...(startCap ? { startCap } : {}),
        ...(endCap ? { endCap } : {}),
        ...(shape ? { shape: serializeSpec(shape) } : {}),
        ...(locked ? { locked } : {}),
        ...(rot ? { rot } : {})
      }
    }
    if (it.type === 'shape') {
      const { id, z, tool, color, fill, size, dash, startCap, endCap, geo, labels, angles, lengths, constructions, tangentMarks, groupId, locked, rot } = it
      return {
        type: 'shape',
        id,
        z,
        tool,
        color,
        size,
        geo: serializeGeo(geo),
        ...(fill ? { fill } : {}),
        ...(dash ? { dash } : {}),
        ...(startCap ? { startCap } : {}),
        ...(endCap ? { endCap } : {}),
        ...(labels && Object.keys(labels).length ? { labels } : {}),
        ...(angles?.length ? { angles } : {}),
        ...(lengths?.length ? { lengths } : {}),
        ...(constructions?.length ? { constructions } : {}),
        ...(tangentMarks ? { tangentMarks } : {}),
        ...(groupId ? { groupId } : {}),
        ...(locked ? { locked } : {}),
        ...(rot ? { rot } : {})
      }
    }
    if (it.type === 'graph' || it.type === 'text' || it.type === 'formula') {
      const { bbox: _bbox, ...rest } = it
      return rest
    }
    let key = assetKeys.get(it.src)
    if (!key) {
      key = `img${assetKeys.size + 1}`
      assetKeys.set(it.src, key)
      assets[key] = it.src
    }
    return {
      type: 'image', id: it.id, z: it.z, asset: key, x: it.x, y: it.y, w: it.w, h: it.h,
      ...(it.groupId ? { groupId: it.groupId } : {}),
      ...(it.locked ? { locked: true } : {}),
      ...(it.rot ? { rot: it.rot } : {})
    }
  })
  return { format: FORMAT, version: requiredVersion(data), background: data.background, camera: data.camera, assets, items }
}

/** A turn read from a file: a finite, non-zero number of radians, or nothing. */
const readRot = (v: unknown): { rot?: number } => (typeof v === 'number' && Number.isFinite(v) && v !== 0 ? { rot: v } : {})

export function deserializeBoard(file: BoardFile): BoardData {
  if (file?.format !== FORMAT) throw new Error('Not a Penrill board')
  if (file.version > FORMAT_VERSION) throw new Error('This board was made with a newer version of Penrill')
  const items: Item[] = []
  for (const s of file.items) {
    if (s.type === 'stroke') {
      const points: Point[] = []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i + 2 < s.pts.length; i += 3) {
        const x = s.pts[i], y = s.pts[i + 1]
        points.push([x, y, s.pts[i + 2]])
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      if (points.length === 0) continue
      const pad = s.size
      items.push({
        type: 'stroke', id: s.id, z: s.z, tool: s.tool, color: noWhite(s.color), size: s.size, pressure: s.pressure, points,
        ...(s.geom === 'line' ? { geom: 'line' as const } : {}),
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.dash ? { dash: s.dash } : {}),
        ...(s.startCap ? { startCap: s.startCap } : {}),
        ...(s.endCap ? { endCap: s.endCap } : {}),
        ...(readSpec(s.shape) ? { shape: readSpec(s.shape)! } : {}),
        ...(s.locked ? { locked: true } : {}),
        ...readRot(s.rot),
        bbox: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
      })
    } else if (s.type === 'graph') {
      const g: GraphItem = { ...sanitizeGraph(s), type: 'graph', id: s.id, z: s.z, ox: s.ox, oy: s.oy, color: noWhite(s.color), bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
      if (s.groupId) g.groupId = s.groupId
      if (s.locked) g.locked = true
      g.bbox = graphBBox(g)
      items.push(g)
    } else if (s.type === 'text') {
      if (typeof s.text !== 'string' || !s.text || !(s.size > 0)) continue
      const t: TextItem = {
        type: 'text', id: s.id, z: s.z, x: s.x, y: s.y, text: s.text, size: s.size, color: noWhite(s.color),
        ...(readRuns(s.runs, s.text) ? { runs: readRuns(s.runs, s.text)! } : {}),
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        ...readRot(s.rot),
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      }
      t.bbox = textBBox(t)
      items.push(t)
    } else if (s.type === 'formula') {
      const rows = validateRows(s.rows)
      if (!rows || !rows.length || !(s.size > 0) || typeof s.color !== 'string') continue
      const f: FormulaItem = {
        type: 'formula', id: s.id, z: s.z, x: s.x, y: s.y, size: s.size, color: noWhite(s.color), rows,
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        ...readRot(s.rot),
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      }
      f.bbox = formulaBBox(f)
      items.push(f)
    } else if (s.type === 'shape') {
      const geo = readShapeGeo(s.geo)
      if (!geo || !(s.size > 0) || typeof s.color !== 'string') continue
      const tool = s.tool === 'highlighter' ? 'highlighter' : 'pen'
      const labels = readLabels(s.labels)
      const angles = readIdList(s.angles)
      const lengths = readIdList(s.lengths)
      const constructions = readConstructions(s.constructions)
      const tangentMarks = readTangentMarks(s.tangentMarks)
      const item: ShapeItem = {
        type: 'shape',
        id: s.id,
        z: s.z,
        tool,
        color: noWhite(s.color),
        ...(isColor(s.fill) ? { fill: s.fill } : {}),
        size: s.size,
        geo,
        ...(s.dash === 'dashed' || s.dash === 'dotted' ? { dash: s.dash } : {}),
        ...(s.startCap ? { startCap: s.startCap } : {}),
        ...(s.endCap ? { endCap: s.endCap } : {}),
        ...(labels ? { labels } : {}),
        ...(angles ? { angles } : {}),
        ...(lengths ? { lengths } : {}),
        ...(constructions ? { constructions } : {}),
        ...(tangentMarks ? { tangentMarks } : {}),
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        ...readRot(s.rot),
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      }
      item.bbox = shapeBBox(item)
      items.push(item)
    } else if (s.type === 'image') {
      const src = file.assets[s.asset]
      if (!src) continue
      items.push({
        type: 'image', id: s.id, z: s.z, src, x: s.x, y: s.y, w: s.w, h: s.h,
        ...(s.groupId ? { groupId: s.groupId } : {}),
        ...(s.locked ? { locked: true } : {}),
        ...readRot(s.rot),
        bbox: turnedBBox({ minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h }, readRot(s.rot).rot)
      })
    }
  }
  return {
    items,
    background: isBackgroundKind(file.background) ? file.background : 'dots',
    camera: file.camera ?? { x: 0, y: 0, zoom: 1 }
  }
}

async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeBoard(data: BoardData): Promise<Uint8Array> {
  const json = JSON.stringify(serializeBoard(data))
  return new TextEncoder().encode(json)
}

export async function decodeBoard(bytes: Uint8Array): Promise<BoardData> {
  // Accept both plain JSON and legacy gzip-compressed board files.
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const raw = isGzip ? await decompressGzip(bytes) : bytes
  return deserializeBoard(JSON.parse(new TextDecoder().decode(raw)) as BoardFile)
}

function serializeSpec(spec: ShapeSpec): ShapeSpec {
  if (!spec.vertices) return spec
  return { ...spec, vertices: spec.vertices.map(([x, y]): Vec2 => [r2(x), r2(y)]) }
}

function serializeGeo(geo: ShapeGeometry): ShapeGeometry {
  return {
    ...geo,
    ax: r2(geo.ax),
    ay: r2(geo.ay),
    bx: r2(geo.bx),
    by: r2(geo.by),
    ...(geo.vertices ? { vertices: geo.vertices.map(([x, y]): Vec2 => [r2(x), r2(y)]) } : {}),
    ...(geo.vertices3 && Object.keys(geo.vertices3).length
      ? {
          vertices3: Object.fromEntries(
            Object.entries(geo.vertices3).map(([k, [x, y, z]]): [string, Vec3] => [k, [r2(x), r2(y), r2(z)]])
          )
        }
      : {}),
    ...(geo.dim3 ? { dim3: [r2(geo.dim3[0]), r2(geo.dim3[1]), r2(geo.dim3[2])] } : {}),
    ...(geo.orbit ? { orbit: [r3(geo.orbit[0]), r3(geo.orbit[1])] } : {}),
    ...(geo.rot3 ? { rot3: [r4(geo.rot3[0]), r4(geo.rot3[1]), r4(geo.rot3[2]), r4(geo.rot3[3])] } : {}),
    ...(geo.slant3 ? { slant3: [r3(geo.slant3[0]), r3(geo.slant3[1])] } : {})
  }
}

function readShapeGeo(v: unknown): ShapeGeometry | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isShapeKind(o.kind)) return null
  if (![o.ax, o.ay, o.bx, o.by].every(isFiniteNum)) return null
  const geo: ShapeGeometry = { kind: o.kind, ax: o.ax as number, ay: o.ay as number, bx: o.bx as number, by: o.by as number }
  if (isFiniteNum(o.rot) && o.rot !== 0) geo.rot = o.rot
  if (Array.isArray(o.vertices) && o.vertices.length >= MIN_BASE && o.vertices.length <= 64) {
    const verts: Vec2[] = []
    let ok = true
    for (const pt of o.vertices) {
      if (Array.isArray(pt) && pt.length >= 2 && isFiniteNum(pt[0]) && isFiniteNum(pt[1])) verts.push([pt[0], pt[1]])
      else { ok = false; break }
    }
    if (ok) geo.vertices = verts
  }
  if (o.vertices3 && typeof o.vertices3 === 'object' && !Array.isArray(o.vertices3)) {
    const entries = Object.entries(o.vertices3 as Record<string, unknown>)
    if (entries.length > 0 && entries.length <= 64) {
      const verts3: Record<string, Vec3> = {}
      let ok = true
      for (const [k, pt] of entries) {
        if (k.length > 0 && k.length <= 32 && Array.isArray(pt) && pt.length === 3 && pt.every(isFiniteNum)) {
          verts3[k] = [pt[0], pt[1], pt[2]]
        } else {
          ok = false
          break
        }
      }
      if (ok && Object.keys(verts3).length) geo.vertices3 = verts3
    }
  }
  if (typeof o.sides === 'number' && Number.isInteger(o.sides) && o.sides >= MIN_BASE && o.sides <= MAX_BASE) geo.sides = o.sides
  if (isFiniteNum(o.skew) && o.skew >= -0.75 && o.skew <= 0.75) geo.skew = o.skew
  if (isFiniteNum(o.topLeft) && o.topLeft >= 0 && o.topLeft <= 0.95) geo.topLeft = o.topLeft
  if (isFiniteNum(o.topRight) && o.topRight >= 0 && o.topRight <= 0.95) geo.topRight = o.topRight
  if (isFiniteNum(o.innerRatio) && o.innerRatio >= 0.15 && o.innerRatio <= 0.9) geo.innerRatio = o.innerRatio
  if (Array.isArray(o.dim3) && o.dim3.length === 3 && o.dim3.every((n) => isFiniteNum(n) && n > 0)) {
    geo.dim3 = [o.dim3[0], o.dim3[1], o.dim3[2]]
  }
  if (Array.isArray(o.orbit) && o.orbit.length === 2 && isFiniteNum(o.orbit[0]) && isFiniteNum(o.orbit[1])) {
    geo.orbit = [o.orbit[0], o.orbit[1]]
  }
  if (Array.isArray(o.rot3) && o.rot3.length === 4 && o.rot3.every(isFiniteNum)) {
    const len = Math.hypot(o.rot3[0], o.rot3[1], o.rot3[2], o.rot3[3])
    if (len > 1e-6) geo.rot3 = quatNormalize([o.rot3[0], o.rot3[1], o.rot3[2], o.rot3[3]])
  }
  if (Array.isArray(o.slant3) && o.slant3.length === 2 && isFiniteNum(o.slant3[0]) && isFiniteNum(o.slant3[1])) {
    geo.slant3 = [o.slant3[0], o.slant3[1]]
  }
  return geo
}

const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

function readLabels(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (isNonEmptyStr(k) && typeof val === 'string' && val.trim().length > 0 && val.length <= 8) out[k] = val
  }
  return Object.keys(out).length ? out : undefined
}

function readIdList(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined
  const out = [...new Set(v.filter(isNonEmptyStr))]
  return out.length ? out : undefined
}

function readConstructions(v: unknown): ShapeConstruction[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined
  const out: ShapeConstruction[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    if (!isNonEmptyStr(c.id) || seen.has(c.id) || typeof c.kind !== 'string') continue
    let parsed: ShapeConstruction | null = null
    switch (c.kind) {
      case 'altitude':
        if (isNonEmptyStr(c.from)) parsed = { id: c.id, kind: 'altitude', from: c.from, ...(isNonEmptyStr(c.toEdge) ? { toEdge: c.toEdge } : {}) }
        break
      case 'median':
        if (isNonEmptyStr(c.from) && isNonEmptyStr(c.toEdge)) parsed = { id: c.id, kind: 'median', from: c.from, toEdge: c.toEdge }
        break
      case 'bisector':
        if (isNonEmptyStr(c.from)) parsed = { id: c.id, kind: 'bisector', from: c.from }
        break
      case 'diagonal':
        if (isNonEmptyStr(c.from) && isNonEmptyStr(c.to)) parsed = { id: c.id, kind: 'diagonal', from: c.from, to: c.to }
        break
      case 'midpoint':
        if (isNonEmptyStr(c.edge)) parsed = { id: c.id, kind: 'midpoint', edge: c.edge }
        break
      case 'midline':
        if (isNonEmptyStr(c.edgeA) && isNonEmptyStr(c.edgeB)) parsed = { id: c.id, kind: 'midline', edgeA: c.edgeA, edgeB: c.edgeB }
        break
      case 'incircle':
      case 'circumcircle':
      case 'center':
      case 'axis':
      case 'section':
      case 'meridian':
        parsed = { id: c.id, kind: c.kind }
        break
      case 'radius':
      case 'diameter':
        parsed = { id: c.id, kind: c.kind, ...(isFiniteNum(c.angle) ? { angle: c.angle } : {}) }
        break
      case 'apothem':
        if (isNonEmptyStr(c.edge)) parsed = { id: c.id, kind: 'apothem', edge: c.edge }
        break
      case 'tangent':
        if (isFiniteNum(c.angle) && isFiniteNum(c.back) && isFiniteNum(c.fwd) && c.back > 0 && c.fwd > 0) {
          parsed = { id: c.id, kind: 'tangent', angle: c.angle, back: c.back, fwd: c.fwd }
        }
        break
    }
    if (parsed) {
      seen.add(parsed.id)
      out.push(parsed)
    }
  }
  return out.length ? out : undefined
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Only the switched-off marks are kept; anything else means "shown". */
function readTangentMarks(v: unknown): TangentMarks | undefined {
  if (!v || typeof v !== 'object') return undefined
  const m = v as Record<string, unknown>
  const out: TangentMarks = {}
  for (const k of ['radius', 'angle', 'equal', 'chord'] as const) if (m[k] === false) out[k] = false
  return Object.keys(out).length ? out : undefined
}

function readIndexList(v: unknown, max: number): number[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined
  const out = [...new Set(v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < max))].sort((a, b) => a - b)
  return out.length ? out : undefined
}

/** Validate a stored shape spec (ignored if malformed, the strokes themselves still load). */
function readSpec(v: unknown): ShapeSpec | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isShapeKind(o.kind)) return null
  const nums = [o.ax, o.ay, o.bx, o.by]
  if (!nums.every(isFiniteNum)) return null
  const spec: ShapeSpec = { kind: o.kind, ax: o.ax as number, ay: o.ay as number, bx: o.bx as number, by: o.by as number }
  if (isFiniteNum(o.rot) && o.rot !== 0) spec.rot = o.rot
  if (Array.isArray(o.vertices) && o.vertices.length >= MIN_BASE && o.vertices.length <= 64) {
    const verts: Vec2[] = []
    let ok = true
    for (const pt of o.vertices) {
      if (Array.isArray(pt) && pt.length >= 2 && isFiniteNum(pt[0]) && isFiniteNum(pt[1])) verts.push([pt[0], pt[1]])
      else {
        ok = false
        break
      }
    }
    if (ok) spec.vertices = verts
  }
  if (typeof o.base === 'number' && Number.isInteger(o.base) && o.base >= MIN_BASE && o.base <= MAX_BASE) spec.base = o.base
  if (o.incircle === true) spec.incircle = true
  if (o.circumcircle === true) spec.circumcircle = true
  const altAt = readIndexList(o.altitudeAt, 3)
  if (altAt) spec.altitudeAt = altAt
  const medAt = readIndexList(o.medianAt, 3)
  if (medAt) spec.medianAt = medAt
  const bisAt = readIndexList(o.bisectorAt, 3)
  if (bisAt) spec.bisectorAt = bisAt
  const angAt = readIndexList(o.angleAt, 64)
  if (angAt) spec.angleAt = angAt
  const lenAt = readIndexList(o.lengthAt, 64)
  if (lenAt) spec.lengthAt = lenAt
  if (isFiniteNum(o.skew) && o.skew >= -0.75 && o.skew <= 0.75) spec.skew = o.skew
  if (isFiniteNum(o.topLeft) && o.topLeft >= 0 && o.topLeft <= 0.95) spec.topLeft = o.topLeft
  if (isFiniteNum(o.topRight) && o.topRight >= 0 && o.topRight <= 0.95) spec.topRight = o.topRight
  if (isFiniteNum(o.innerRatio) && o.innerRatio >= 0.15 && o.innerRatio <= 0.9) spec.innerRatio = o.innerRatio
  if (
    Array.isArray(o.apex) &&
    o.apex.length >= 2 &&
    isFiniteNum(o.apex[0]) &&
    isFiniteNum(o.apex[1]) &&
    o.apex[0] >= -2 &&
    o.apex[0] <= 3 &&
    o.apex[1] >= -2 &&
    o.apex[1] <= 3
  ) {
    spec.apex = [o.apex[0], o.apex[1]]
  }
  if (isFiniteNum(o.depth) && o.depth >= 0.05 && o.depth <= 0.5) spec.depth = o.depth
  return spec
}

/** Validated text runs: only known fields, and their texts must add up to the item's text. */
function readRuns(v: unknown, text: string): TextRun[] | null {
  if (!Array.isArray(v) || !v.length) return null
  const out: TextRun[] = []
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r.text !== 'string') return null
    const o: TextRun = { text: r.text }
    if (typeof r.color === 'string') o.color = noWhite(r.color)
    if (typeof r.size === 'number' && r.size > 0 && Number.isFinite(r.size)) o.size = r.size
    if (r.bold === true) o.bold = true
    if (r.italic === true) o.italic = true
    if (r.underline === true) o.underline = true
    out.push(o)
  }
  return out.map((r) => r.text).join('') === text ? out : null
}
