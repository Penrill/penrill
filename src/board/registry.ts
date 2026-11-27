import type { Row } from '@penrill/math/formula'
import type { ShapeKind } from '@penrill/core/shapes'
import type { Camera, Item, Point, ShapeGeometry, ShapeItem, ShapeSpec, StrokeItem, Vec2 } from '@penrill/core/types'
import type { Gizmo3dModel, GizmoActiveArc, GizmoSpace, ViewPreset3d } from '@penrill/shape-editor/gizmo3d'
import { paint } from '@penrill/render-canvas/paint'
import { toSvg, type Prim } from '@penrill/render/display'
import type { NumericResult } from './engine/formulaexpr'
import { inkColors } from './engine/surface'
import { itemTurn } from './engine/transform'

/**
 * Feature modules (docs/ARCHITECTURE.md). The board's core knows item types and hooks only through
 * this registry: a module brings how its items are drawn and the behaviour it adds (recognising
 * shapes in strokes, working out formulas). The app picks the modules when it creates an editor
 * (`createEditor({ modules })`); src/board/modules has the built-in ones.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type ItemOf<K extends Item['type']> = Extract<Item, { type: K }>

/** How one kind of board item is drawn: as a display list, or (not converted yet) by its own code. */
export interface ItemKind<T extends Item = Item> {
  /** Wait for resources needed to draw this item offscreen. */
  prepare?: (item: T) => Promise<void>
  display?: (item: T) => Prim
  draw?: (ctx: Ctx, item: T) => void
  svg?: (item: T) => string
}

/** A clean shape found in a stroke: its outline, and the board shape it is (if it is one). */
export interface RecognizedShape {
  points: Point[]
  spec?: ShapeSpec
  /** The level, tidier version it becomes when the pen stays still for another hold. */
  next?: RecognizedShape
}

/** Hold-to-snap: turns a stroke held still at its end into the clean shape it resembles. */
export interface StrokeRecognizer {
  /** null when the stroke looks like no known shape (or is smaller than `minSize` board units). */
  recognize(points: readonly Point[], minSize: number): RecognizedShape | null
  /** The recognised shape stretched so that `from` follows the pen to `to`; `perfect` = square, circle… */
  reshape(base: RecognizedShape, from: readonly [number, number], to: readonly [number, number], perfect: boolean): RecognizedShape
}

/** Works out the value of a formula as it is typed (shown as "= 1.25" next to it). */
export interface FormulaEvaluator {
  result(rows: Row, comma: boolean): NumericResult | null
}

/** One interactive handle exposed on a selected shape by the shape-editor module. */
export interface ShapeEditorHandle {
  id: string
  kind: 'vertex' | 'control' | 'addVertex' | 'orbit' | 'gizmoRing' | 'gizmoPole'
  x: number
  y: number
  hint: string
  cursor: 'crosshair' | 'grab' | 'ew-resize' | 'ns-resize' | 'pointer'
  index?: number
  vertexId?: string
  draggable?: boolean
  /** Camera-space depth for 3D handles (larger = closer to viewer). */
  depth?: number
}

/** Subtle geometric snap guide drawn while dragging a shape handle. */
export interface ShapeEditorGuide {
  kind: 'line' | 'rightAngle'
  points: Vec2[]
}

export interface ShapeEditorDragOptions {
  shift: boolean
  ctrl: boolean
  alt: boolean
  snapTol: number
  gridStep: readonly [number, number]
}

export interface ShapeEditorDragResult {
  spec: ShapeSpec
  label: string | null
  guides: ShapeEditorGuide[]
  snapped: boolean
}

export interface ShapeEditorItemDragResult {
  item: ShapeItem
  label: string | null
  guides: ShapeEditorGuide[]
  snapped: boolean
  gizmoArc?: GizmoActiveArc | null
}

export interface ShapeEditorEdgeTarget {
  id?: string
  index: number
  a: Vec2
  b: Vec2
  mid: Vec2
  length: number
}

export interface ShapeEditorCornerTarget {
  index: number
  x: number
  y: number
}

export interface ShapeEditorOverlayState {
  handles: readonly ShapeEditorHandle[]
  hotHandle?: string | null
  activeHandle?: string | null
  hotEdge?: { a: Vec2; b: Vec2 } | null
  activeEdge?: { a: Vec2; b: Vec2 } | null
  guides?: readonly ShapeEditorGuide[] | null
  gizmo3d?: Gizmo3dModel | null
  gizmoArc?: GizmoActiveArc | null
  gizmoActive?: boolean
}

/** Direct on-canvas shape editing feature (registered by the `shape-editor` module). */
export interface ShapeEditorFeature {
  // First-class ShapeItem API
  itemHandles(item: ShapeItem): ShapeEditorHandle[]
  isCustomizedItem(item: ShapeItem): boolean
  isConstrained2d(item: ShapeItem): boolean
  canUnlockFreeVertices(item: ShapeItem): boolean
  unlockFreeVertices(item: ShapeItem): ShapeItem
  resetItemGeometry(item: ShapeItem): ShapeItem
  resetItemOrbit(item: ShapeItem): ShapeItem
  applyViewPreset3d(item: ShapeItem, preset: ViewPreset3d): ShapeItem
  toggleAxisViewPreset3d(item: ShapeItem, axis: 'x' | 'y' | 'z'): { item: ShapeItem; preset: ViewPreset3d }
  setEulerDeg3d(item: ShapeItem, eulerDeg: readonly [number, number, number]): ShapeItem
  buildGizmo3d(item: ShapeItem, zoom: number, space: GizmoSpace): Gizmo3dModel | null
  hitGizmo3dRing(gizmo: Gizmo3dModel, sx: number, sy: number, cam: Camera, reach: number): ShapeEditorHandle | null
  switchItemKind(item: ShapeItem, nextKind: ShapeKind): ShapeItem
  setItemSides(item: ShapeItem, sides: number): ShapeItem
  hitItemEdge(item: ShapeItem, wx: number, wy: number, zoom: number): ShapeEditorEdgeTarget | null
  dragItemHandle(
    item: ShapeItem,
    handleId: string,
    pt: Vec2,
    opts: ShapeEditorDragOptions,
    dragStart?: {
      startWorld: Vec2
      startGeo: ShapeGeometry
      prevWorld?: Vec2
      prevGeo?: ShapeGeometry
      gizmoSpace?: GizmoSpace
      free3d?: boolean
    }
  ): ShapeEditorItemDragResult
  insertItemVertex(item: ShapeItem, edgeIndex: number, pt: Vec2): { item: ShapeItem; vertexId: string } | null
  removeItemVertex(item: ShapeItem, vertexId: string): ShapeItem | null
  applyItemDefaults(item: ShapeItem, defaults: { showAngles: boolean; showLengths: boolean; showLabels: boolean }): ShapeItem
  // Legacy v4-v11 StrokeItem.shape API
  handles(spec: ShapeSpec): ShapeEditorHandle[]
  usesVertexHandles(kind: ShapeKind): boolean
  isCustomized(spec: ShapeSpec): boolean
  resetGeometry(spec: ShapeSpec): ShapeSpec
  hitHandle(handles: readonly ShapeEditorHandle[], sx: number, sy: number, cam: Camera, reach: number): ShapeEditorHandle | null
  hitEdge(spec: ShapeSpec, wx: number, wy: number, zoom: number): ShapeEditorEdgeTarget | null
  hitCorner(spec: ShapeSpec, sx: number, sy: number, cam: Camera, reach: number): ShapeEditorCornerTarget | null
  dragHandle(spec: ShapeSpec, handleId: string, pt: Vec2, opts: ShapeEditorDragOptions): ShapeEditorDragResult
  insertVertex(spec: ShapeSpec, edgeIndex: number, pt: Vec2): { spec: ShapeSpec; vertexIndex: number } | null
  removeVertex(spec: ShapeSpec, vertexIndex: number): ShapeSpec | null
  toggleVertexFeature(spec: ShapeSpec, vertexIndex: number, feature: 'altitude' | 'median' | 'bisector' | 'angle'): ShapeSpec
  toggleEdgeFeature(spec: ShapeSpec, edgeIndex: number, feature: 'length' | 'altitude' | 'median'): ShapeSpec
  toggleAllAngles(spec: ShapeSpec, on: boolean): ShapeSpec
  toggleAllLengths(spec: ShapeSpec, on: boolean): ShapeSpec
  applyDefaults(spec: ShapeSpec, defaults: { showAngles: boolean; showLengths: boolean }): ShapeSpec
  formatLength(worldLen: number): string
  annotationsDisplay(item: StrokeItem): Prim | null
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, state: ShapeEditorOverlayState): void
}

export interface FeatureModule {
  id: string
  /** Notify this editor when an external resource changes the drawing. */
  subscribeRedraw?: (redraw: () => void) => () => void
  items?: { [K in Item['type']]?: ItemKind<ItemOf<K>> }
  strokeRecognizer?: StrokeRecognizer
  formulaEvaluator?: FormulaEvaluator
  shapeEditor?: ShapeEditorFeature
}

export class FeatureRegistry {
  readonly strokeRecognizer: StrokeRecognizer | null = null
  readonly formulaEvaluator: FormulaEvaluator | null = null
  readonly shapeEditor: ShapeEditorFeature | null = null
  readonly modules: readonly FeatureModule[]
  private readonly kinds = new Map<string, ItemKind>()

  constructor(modules: readonly FeatureModule[]) {
    this.modules = modules
    for (const m of modules) {
      for (const [type, kind] of Object.entries(m.items ?? {})) {
        if (this.kinds.has(type)) throw new Error(`Item type "${type}" is registered twice (module ${m.id})`)
        this.kinds.set(type, kind as ItemKind)
      }
      if (m.strokeRecognizer) this.strokeRecognizer = m.strokeRecognizer
      if (m.formulaEvaluator) this.formulaEvaluator = m.formulaEvaluator
      if (m.shapeEditor) this.shapeEditor = m.shapeEditor
    }
  }

  has(id: string): boolean {
    return this.modules.some((m) => m.id === id)
  }

  async prepare(items: readonly Item[]): Promise<void> {
    const pending: Promise<void>[] = []
    for (const item of items) {
      const prepare = this.kinds.get(item.type)?.prepare
      if (prepare) pending.push(prepare(item))
    }
    await Promise.all(pending)
  }

  /** Draws one item in board coordinates, in the colours of the current surface (withInkSurface). */
  draw(ctx: Ctx, item: Item): void {
    const kind = this.kinds.get(item.type)
    // A turned image, text or formula is drawn upright in its own box, turned about the box's centre.
    const turn = itemTurn(item)
    if (turn) {
      ctx.save()
      ctx.translate(turn.cx, turn.cy)
      ctx.rotate(turn.rot)
      ctx.translate(-turn.cx, -turn.cy)
    }
    if (kind?.display) paint(ctx, kind.display(item), inkColors)
    else kind?.draw?.(ctx, item)
    if (item.type === 'stroke' && item.shape && this.shapeEditor) {
      const ann = this.shapeEditor.annotationsDisplay(item)
      if (ann) paint(ctx, ann, inkColors)
    }
    if (turn) ctx.restore()
  }

  /** One item as SVG markup (for SVG and PDF exports); empty when no module draws its type. */
  svg(item: Item): string {
    const kind = this.kinds.get(item.type)
    let out = kind?.display ? toSvg(kind.display(item), inkColors) : (kind?.svg?.(item) ?? '')
    if (item.type === 'stroke' && item.shape && this.shapeEditor) {
      const ann = this.shapeEditor.annotationsDisplay(item)
      if (ann) out += toSvg(ann, inkColors)
    }
    const turn = itemTurn(item)
    if (!turn || !out) return out
    const r2 = (v: number): number => Math.round(v * 100) / 100
    return `<g transform="rotate(${r2((turn.rot * 180) / Math.PI)} ${r2(turn.cx)} ${r2(turn.cy)})">${out}</g>`
  }
}
