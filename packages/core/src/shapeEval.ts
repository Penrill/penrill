import type { BBox, LineDash, ShapeConstruction, ShapeGeometry, ShapeItem, TangentMarks, Vec2, Vec3 } from './types'
import { is3D } from './shapes'
import { evaluate2dShape } from './shapeEval2d'
import { evaluate3dShape } from './shapeEval3d'

export interface EvalAngle3d {
  /** Exact true 3D geometric angle in degrees. */
  deg: number
  /** Projected 2D polyline of the 3D angle mark (foreshortened 90 deg L-mark or planar 3D arc). */
  markPts: Vec2[]
  /** Projected 2D label position inside the 3D angle wedge. */
  labelPos: Vec2
}

export interface EvalVertex {
  id: string
  pos: Vec2
  pos3?: Vec3
  /** Camera-space depth toward viewer (higher = closer to camera, 3D solids only). */
  depth?: number
  defaultLabel: string
  angleDeg?: number
  /** Ordered [startUnitRay, endUnitRay] sweeping clockwise (y-down) through the interior angle (2D shapes). */
  angleRays?: [Vec2, Vec2]
  /** Pre-projected true 3D geometric angle mark and label anchor (3D solids). */
  angle3d?: EvalAngle3d
  role: 'corner' | 'apex' | 'center' | 'cardinal' | 'inner'
  visible: boolean
}

export interface EvalEdge {
  id: string
  from: string
  to: string
  a: Vec2
  b: Vec2
  /** Exact geometric length (2D Euclidean for 2D shapes, true 3D length for 3D solids). */
  length: number
  hidden?: boolean
  role?: 'base' | 'lateral' | 'top' | 'main'
}

export interface EvalCurve {
  id: string
  pts: Vec2[]
  closed?: boolean
  dash?: LineDash
  length?: number
}

export interface EvalConstruction {
  id: string
  kind: ShapeConstruction['kind']
  segments: { pts: Vec2[]; dash?: LineDash; thin?: boolean }[]
  fills?: { pts: Vec2[]; opacity: number }[]
  dots?: { pos: Vec2; r?: number }[]
  length?: number
  lengthAnchor?: [Vec2, Vec2]
  label?: { text: string; pos: Vec2; awayFrom: Vec2 }
  /**
   * More texts (tangents and their marks): a letter set off from `pos` away from `awayFrom`, or an
   * angle in degrees written at `pos`.
   */
  texts?: ({ letter: string; pos: Vec2; awayFrom: Vec2 } | { deg: number; pos: Vec2 })[]
}

export interface EvaluatedShape {
  is3D: boolean
  center: Vec2
  vertices: EvalVertex[]
  edges: EvalEdge[]
  curves: EvalCurve[]
  constructions: EvalConstruction[]
  /** Extra main-width strokes such as arrow wings. */
  decorations: Vec2[][]
  /** All hit-testable polylines (visible/hidden edges, curves, construction segments). */
  hitPaths: Vec2[][]
  /** Tight geometric bounds of all visible geometry before stroke and label padding. */
  bounds: BBox
}

export interface ShapeEvalInput {
  geo: ShapeGeometry
  size?: number
  constructions?: readonly ShapeConstruction[]
  tangentMarks?: TangentMarks
}

const DEFAULT_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/** A, B, C … Z (no O: that is the centre), then A₁, B₁ … Z₁, A₂ and so on. */
export function vertexLetter(index: number, subscript?: string): string {
  const round = Math.floor(index / DEFAULT_LETTERS.length)
  const letter = DEFAULT_LETTERS[index % DEFAULT_LETTERS.length]
  const base = round ? `${letter}${[...String(round)].map((d) => SUBSCRIPT_DIGITS[+d]).join('')}` : letter
  return subscript ? `${base}${subscript}` : base
}

export function boundsOfPaths(paths: readonly (readonly Vec2[])[], fallback: Vec2): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const path of paths) {
    for (const [x, y] of path) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (!Number.isFinite(minX)) return { minX: fallback[0], minY: fallback[1], maxX: fallback[0], maxY: fallback[1] }
  return { minX, minY, maxX, maxY }
}

/** Compile any 2D or 3D ShapeItem (or geometry + constructions) into unified evaluated primitives. */
export function evaluateShape(input: ShapeItem | ShapeEvalInput): EvaluatedShape {
  const size = input.size ?? 2
  const constructions = input.constructions ?? []
  return is3D(input.geo.kind)
    ? evaluate3dShape(input.geo, constructions, size)
    : evaluate2dShape(input.geo, constructions, size, input.tangentMarks)
}

/** Accurate board bounding box for a ShapeItem (padded for stroke width and active labels/measurements). */
export function shapeBBox(item: Pick<ShapeItem, 'geo' | 'size' | 'labels' | 'angles' | 'lengths' | 'constructions' | 'tangentMarks'>): BBox {
  const ev = evaluateShape(item)
  const hasAnnotations = Boolean(
    (item.labels && Object.keys(item.labels).length > 0) ||
    item.angles?.length ||
    item.lengths?.length ||
    ev.constructions.some((c) => c.label || c.texts?.length)
  )
  const pad = hasAnnotations ? Math.max(item.size * 3, 46) : Math.max(item.size * 3, 8)
  return {
    minX: ev.bounds.minX - pad,
    minY: ev.bounds.minY - pad,
    maxX: ev.bounds.maxX + pad,
    maxY: ev.bounds.maxY + pad
  }
}
