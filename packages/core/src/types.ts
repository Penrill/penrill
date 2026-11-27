import type { Row } from '@penrill/math/formula'
import type { ShapeKind } from './shapes'

/** A sampled input point in world coordinates: x, y and pen pressure (0..1). */
export type Point = [x: number, y: number, pressure: number]

/** A 2D point in world coordinates. */
export type Vec2 = [x: number, y: number]

/** A 3D point in local right-handed shape coordinates (x right, y up, z toward viewer). */
export type Vec3 = [x: number, y: number, z: number]

/** Unit quaternion [x, y, z, w] representing arbitrary 3D orientation without gimbal lock. */
export type Quat = [x: number, y: number, z: number, w: number]

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface ItemBase {
  id: string
  /** Stacking order. Higher is drawn on top. Preserved across undo/redo. */
  z: number
  bbox: BBox
  /** Items sharing a groupId are selected, moved and scaled together (Ctrl+G). */
  groupId?: string
  /** Locked items can't be erased, deleted, moved, resized or restyled until unlocked. */
  locked?: boolean
}

/**
 * Ink is stored as vector data (the raw points), never as pixels.
 * The outline is rebuilt for the current zoom on every render, so strokes stay sharp at any scale.
 */
export interface StrokeItem extends ItemBase, Turnable {
  type: 'stroke'
  tool: 'pen' | 'highlighter'
  color: string
  /** Base width in world units. */
  size: number
  /** true when the points carry real pen pressure (stylus); false for mouse / touch. */
  pressure: boolean
  points: Point[]
  /**
   * 'line' = drawn exactly through the points with a uniform width and crisp corners
   * (Shift straight lines and shapes). Absent = freehand ink.
   */
  geom?: 'line'
  /** Line pattern (drawn along the centre line, uniform width). Absent = solid. */
  dash?: LineDash
  /** End decorations of straight lines. */
  startCap?: LineCap
  endCap?: LineCap
  /**
   * Set on strokes made by the shape tool (every part of a solid carries the same spec), so the shape
   * can be re-generated later: stretched, switched to another shape, or given another base.
   */
  shape?: ShapeSpec
}

/** Parameters a shape was generated from: kind, box (a -> b), optional rotation, vertices and geometry controls. */
export interface ShapeSpec {
  kind: ShapeKind
  ax: number
  ay: number
  bx: number
  by: number
  /** Clockwise rotation in radians around the unturned box centre (box-based shapes). */
  rot?: number
  /** Free world-space vertices for arbitrary triangles and polygons; ax..by mirror their bounds. */
  vertices?: Vec2[]
  /** Number of sides: base for pyramids/prisms, sides for polygon, points for star (3..24). */
  base?: number
  /** Triangle constructions: circles are whole-shape; lines are per-vertex indices (0..2). */
  incircle?: boolean
  circumcircle?: boolean
  altitudeAt?: number[]
  medianAt?: number[]
  bisectorAt?: number[]
  /** Vertex indices whose interior angle (arc + degree, or 90 deg square) is shown. */
  angleAt?: number[]
  /** Edge indices whose length (or circle/ellipse dimensions, index 0) is shown. */
  lengthAt?: number[]
  /** Parallelogram horizontal skew fraction of width, in [-0.75, 0.75]. Default 0.25. */
  skew?: number
  /** Trapezoid top-left and top-right horizontal inset fractions of width, in [0, 0.95]. Defaults 0.22. */
  topLeft?: number
  topRight?: number
  /** Star inner-to-outer radius ratio, in [0.15, 0.9]. Default 0.4. */
  innerRatio?: number
  /** Normalized apex / top-face position [ux, uy] relative to box (x0, y0, w, h) for pyramid, cone, prism, cylinder. */
  apex?: Vec2
  /** 3D depth / base foreshortening ratio for cube, prism, pyramid, obliquePyramid, cylinder, cone, sphere. */
  depth?: number
}

export type LineDash = 'dashed' | 'dotted'
export type LineCap = 'arrow' | 'dot' | 'circle' | 'bar'

/**
 * Turn of an item, in radians, clockwise on screen. Absent = not turned.
 * - Image, text, formula: the turn about the centre of the unturned box that x, y (and w, h)
 *   describe; `bbox` is the turned box's bounds.
 * - Ink: its points are already turned; `rot` only remembers by how much, so the turn can be undone
 *   later (double click on the ↻ handle).
 */
interface Turnable {
  rot?: number
}

/** A raster image placed on the board. Kept at its original resolution. */
export interface ImageItem extends ItemBase, Turnable {
  type: 'image'
  src: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * A coordinate line (number line) or coordinate plane. Stored as parameters, drawn procedurally,
 * so it stays vector-sharp and can be re-configured after insertion.
 */
export interface GraphParams {
  /** 'space' = 3D axes (x towards the viewer, y to the right, z up), drawn in oblique projection. */
  kind: 'line' | 'plane' | 'space'
  xMin: number
  xMax: number
  /** Plane only. */
  yMin: number
  yMax: number
  /** 3D axes only. */
  zMin?: number
  zMax?: number
  /** Board units per 1 on the axis (24 = one dot-paper cell). */
  unit: number
  /** Number labels every N units. */
  labelStep: number
  /** Kept for file compatibility; always false (the paper background is the grid). */
  grid: boolean
  /** Functions y = f(x) plotted on a coordinate plane (drawn only when kind is 'plane'). */
  fns?: PlotFn[]
  /** true = don't write the formulas next to the curves (shown by default). */
  hideFormulas?: boolean
  /** Special points marked on the plane's curves (absent = none). */
  points?: GraphPoints
}

/** Which special points a coordinate plane marks on its curves. */
export interface GraphPoints {
  /** Maxima and minima of the functions. */
  extrema?: true
  /** Zeros: where the curves meet the horizontal axis. */
  roots?: true
  /** Where two curves cross. */
  cross?: true
  /** Coordinates written the Ukrainian way, (1,5; −2), instead of (1.5, −2). */
  comma?: true
}

/** One plotted function: the formula as the teacher typed it (see engine/mathexpr.ts) and its colour. */
export interface PlotFn {
  expr: string
  color: string
  /**
   * The formula as built on the math keypad (engine/formula.ts), when it was. It is what gets
   * plotted and written next to the curve; `expr` then holds the same function as plain text for
   * versions without the keypad.
   */
  rows?: Row
  /** Name of the function as written next to it: f for f(x) = …; absent = y = …. */
  name?: string
  /** Its variable (t, a, φ…); absent = x. `expr` is always written in x. */
  arg?: string
  /** Drawn only for values of the variable from `from` to `to` (each optional). */
  from?: number
  to?: number
  /** Drawn only where its value (the vertical axis) is from `yFrom` to `yTo` (each optional). */
  yFrom?: number
  yTo?: number
}

export interface GraphItem extends ItemBase, GraphParams {
  type: 'graph'
  /** World position of the origin (0, 0). */
  ox: number
  oy: number
  color: string
}

/** Formatting of a piece of text; unset fields fall back to the text item's own colour / size. */
export interface TextFormat {
  color?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/** A piece of text with one formatting (may contain line breaks). */
export interface TextRun extends TextFormat {
  text: string
}

/**
 * Typed text. Position is the top-left corner; `size` is the font size in board units.
 * `runs` (optional) splits `text` into differently formatted pieces; their texts joined equal `text`.
 */
export interface TextItem extends ItemBase, Turnable {
  type: 'text'
  x: number
  y: number
  text: string
  size: number
  color: string
  runs?: TextRun[]
}

/**
 * A formula built on the math keypad: fractions, roots, powers, integrals. Stored as its tree
 * (engine/formula.ts) and typeset when drawn, so it stays vector and can be edited again.
 * Position is the top-left corner; `size` is the font size in board units.
 */
export interface FormulaItem extends ItemBase, Turnable {
  type: 'formula'
  x: number
  y: number
  size: number
  color: string
  rows: Row
}

/** Compositional geometric construction attached to a first-class ShapeItem. */
export type ShapeConstruction =
  | { id: string; kind: 'altitude'; from: string; toEdge?: string }
  | { id: string; kind: 'median'; from: string; toEdge: string }
  | { id: string; kind: 'bisector'; from: string }
  | { id: string; kind: 'diagonal'; from: string; to: string }
  | { id: string; kind: 'midpoint'; edge: string }
  | { id: string; kind: 'midline'; edgeA: string; edgeB: string }
  | { id: string; kind: 'incircle' | 'circumcircle' }
  | { id: string; kind: 'center' }
  | { id: string; kind: 'radius' | 'diameter'; angle?: number }
  | { id: string; kind: 'apothem'; edge: string }
  | { id: string; kind: 'axis' | 'section' | 'meridian' }
  /**
   * A tangent to a circle (or an ellipse) at parameter `angle`, the same angle a radius uses. `back`
   * and `fwd` are the lengths of its two sides from the touch point, in radii, so the tangent scales
   * with the circle; they start equal and are then changed one at a time by dragging an end.
   */
  | { id: string; kind: 'tangent'; angle: number; back: number; fwd: number }

/** Pure geometric definition of a 2D or 3D ShapeItem (independent of annotations and style). */
export interface ShapeGeometry {
  kind: ShapeKind
  ax: number
  ay: number
  bx: number
  by: number
  /** Clockwise rotation in radians around the unturned box centre (2D shapes). */
  rot?: number
  /** Explicit world-space vertices for free triangles and unlocked polygons. */
  vertices?: Vec2[]
  /** Side / base / point count for polygon, star, prism, pyramid, obliquePyramid (3..24). */
  sides?: number
  /** Parallelogram horizontal skew fraction of width, in [-0.75, 0.75]. Default 0.25. */
  skew?: number
  /** Trapezoid top-left and top-right horizontal inset fractions of width, in [0, 0.95]. Defaults 0.22. */
  topLeft?: number
  topRight?: number
  /** Star inner-to-outer radius ratio, in [0.15, 0.9]. Default 0.4. */
  innerRatio?: number
  /** Real 3D dimensions [width, height, depth] in board units (3D solids). */
  dim3?: [w: number, h: number, d: number]
  /** 3D camera orbit angles [yaw, pitch] in radians (3D solids, default upright turntable). */
  orbit?: [yaw: number, pitch: number]
  /** Optional unit quaternion [x, y, z, w] for arbitrary 3-axis 3D orientation (supersedes `orbit`). */
  rot3?: Quat
  /** Optional local 3D vertex coordinate overrides keyed by vertex id for free 3D polyhedron editing. */
  vertices3?: Record<string, Vec3>
  /** 3D horizontal shift [sx, sz] of apex or top face in normalized base-radius units. */
  slant3?: [sx: number, sz: number]
}

/**
 * A first-class parametric 2D or 3D geometric shape.
 * Geometry (`geo`), constructions, labels, angles and lengths sit at the top level so
 * field-level sync merges concurrent edits (such as dragging a vertex while adding a label).
 */
export interface ShapeItem extends ItemBase, Turnable {
  type: 'shape'
  tool: 'pen' | 'highlighter'
  color: string
  size: number
  dash?: LineDash
  startCap?: LineCap
  endCap?: LineCap
  geo: ShapeGeometry
  /** Optional custom vertex or centre letter labels keyed by vertex id. */
  labels?: Record<string, string>
  /** Vertex ids whose interior angle arc / degree or 90 deg mark is shown. */
  angles?: string[]
  /** Edge or construction ids whose true length / dimension is shown. */
  lengths?: string[]
  /** Compositional geometric constructions attached to this shape. */
  constructions?: ShapeConstruction[]
  /** Which marks the circle's tangents get (absent = all of them). */
  tangentMarks?: TangentMarks
}

/** Marks drawn with a circle's tangents; each one is on unless set to false. */
export interface TangentMarks {
  /** The radius to each touch point with its 90° square. */
  radius?: boolean
  /** The angle between two tangents at their crossing point P and the central angle AOB. */
  angle?: boolean
  /** Equal tangent segments PA = PB (ticks) and PO, which halves the angle at P. */
  equal?: boolean
  /** The chord AB between the touch points and the angle between it and the tangent. */
  chord?: boolean
}

export type Item = StrokeItem | ImageItem | GraphItem | TextItem | FormulaItem | ShapeItem

/** Pattern printed on the board surface. */
/**
 * 'math' = grid with a darker line every 5 cells; 'hand' = handwriting rows (top, dashed middle and
 * base line); 'slant' = copybook rows with slanted guide lines (Ukrainian "коса лінія").
 */
export type PaperPattern = 'blank' | 'dots' | 'grid' | 'lines' | 'math' | 'hand' | 'slant'
/** Pattern on white paper, or `chalk-<pattern>` on the green chalkboard (see engine/surface.ts). */
export type BackgroundKind = PaperPattern | `chalk-${PaperPattern}`

export interface Camera {
  /** World coordinate at the top-left corner of the viewport. */
  x: number
  y: number
  zoom: number
}
