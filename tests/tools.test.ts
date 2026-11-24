// Tool controllers (src/board/tools): eraser, brush select, laser, lasso, shapes and pan, without a DOM.
// Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '@penrill/core/scene'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import type { ImageItem, Item, ShapeItem, StrokeItem } from '@penrill/core/types'
import { itemsTouched } from '../src/board/tools/brushSelect.ts'
import { beginErase, eraseAlong, eraseUnit, type EraseRecord } from '../src/board/tools/eraser.ts'
import { drawLaser } from '../src/board/engine/laser.ts'
import { beginLaser, LASER_FADE_MS, LaserTrail } from '../src/board/tools/laser.ts'
import { createSessionStore } from '../src/board/session.ts'
import { beginLasso } from '../src/board/tools/lasso.ts'
import { beginPan } from '../src/board/tools/pan.ts'
import { beginShape } from '../src/board/tools/shapeTool.ts'
import type { Sample, ToolContext } from '../src/board/tools/types.ts'

/** A straight horizontal stroke from (x0, y) to (x1, y), sampled every 5 units. */
function line(id: string, x0: number, x1: number, y: number, extra: Partial<StrokeItem> = {}): StrokeItem {
  const points: StrokeItem['points'] = []
  for (let x = x0; x <= x1; x += 5) points.push([x, y, 0.5])
  return {
    type: 'stroke', id, z: 1, tool: 'pen', color: '#000', size: 2, pressure: false, points,
    bbox: { minX: x0 - 1, minY: y - 1, maxX: x1 + 1, maxY: y + 1 }, ...extra
  }
}

const image = (id: string): ImageItem => ({
  type: 'image', id, z: 1, src: 'data:,', x: 0, y: -10, w: 100, h: 20, bbox: { minX: 0, minY: -10, maxX: 100, maxY: 10 }
})

const ids = (items: readonly Item[]) => items.map((i) => i.id).sort()
const record = (): EraseRecord => ({ removed: [], added: [] })

test('stroke eraser removes whole strokes it touches, never images or locked ink', () => {
  const sc = new Scene()
  sc.add([line('hit', 0, 100, 0), line('far', 0, 100, 200), line('locked', 0, 100, 0, { locked: true }), image('img')])
  const rec = record()
  eraseAlong(sc, 50, -20, 50, 20, 5, 'stroke', rec)
  assert.deepEqual(ids(sc.getItems()), ['far', 'img', 'locked'])
  assert.deepEqual(ids(rec.removed), ['hit'])
})

test('a fast swipe is sampled along its path and does not skip a stroke', () => {
  const sc = new Scene()
  sc.add([line('mid', 0, 100, 0)])
  const rec = record()
  // Starts and ends far from the line, crosses it in between.
  eraseAlong(sc, 50, -500, 50, 500, 5, 'stroke', rec)
  assert.equal(sc.getItems().length, 0)
})

test('point eraser cuts a stroke in two and records one undo step for the swipe', () => {
  const sc = new Scene()
  const orig = line('long', 0, 100, 0)
  sc.add([orig])
  const rec = record()
  eraseAlong(sc, 50, -20, 50, 20, 5, 'point', rec)
  const pieces = sc.getItems()
  assert.equal(pieces.length, 2)
  assert.deepEqual(ids(rec.removed), ['long'])
  assert.deepEqual(ids(rec.added), ids(pieces))
  // Cutting a piece made earlier in the same swipe replaces it in `added`, it isn't "removed".
  eraseAlong(sc, 20, -20, 20, 20, 5, 'point', rec)
  assert.deepEqual(ids(rec.removed), ['long'])
  assert.deepEqual(ids(rec.added), ids(sc.getItems()))
})

test('erasing one edge of a shape takes the whole shape, unless part of it is locked', () => {
  const spec = { kind: 'rectangle' as const, ax: 0, ay: 0, bx: 100, by: 100 }
  const a = line('a', 0, 100, 0, { shape: spec, groupId: 'g' })
  const b = line('b', 0, 100, 100, { shape: spec, groupId: 'g' })
  assert.deepEqual(ids(eraseUnit([a, b], a)), ['a', 'b'])
  assert.deepEqual(eraseUnit([a, { ...b, locked: true }], a), [])
})

test('an erase gesture becomes one undo step on release', () => {
  const sc = new Scene()
  sc.add([line('a', 0, 100, 0), line('b', 0, 100, 50)], false)
  const ctx = {
    scene: sc,
    editor: { camera: { x: 0, y: 0, zoom: 1 } },
    prefs: () => ({ eraserRadius: 5, eraserMode: 'stroke' }),
    invalidate: () => {}
  } as unknown as ToolContext
  const at = (x: number, y: number): Sample => ({ sx: x, sy: y, x, y, pressure: 0.5, time: 0 })
  const g = beginErase(ctx, at(50, -20))
  g.move([at(50, 10), at(50, 60)])
  assert.equal(sc.getItems().length, 0)
  assert.equal(sc.canUndo, false)
  g.end()
  assert.equal(sc.canUndo, true)
  sc.undo()
  assert.deepEqual(ids(sc.getItems()), ['a', 'b'])
})

test('brush select touches strokes along its path and images by their box', () => {
  const items = [line('near', 0, 100, 0), line('far', 0, 100, 300), image('img')]
  assert.deepEqual(ids(itemsTouched(items, -50, 3, 150, 3, 4)), ['img', 'near'])
  assert.deepEqual(ids(itemsTouched(items, -50, 290, 150, 290, 4)), [])
})

test('the laser trail fades out', () => {
  const trail = new LaserTrail()
  trail.add(0, 0, 0)
  trail.add(1, 1, 500)
  assert.equal(trail.prune(LASER_FADE_MS - 1), true)
  assert.equal(trail.points.length, 2)
  assert.equal(trail.prune(LASER_FADE_MS + 1), true)
  assert.equal(trail.points.length, 1)
  assert.equal(trail.prune(500 + LASER_FADE_MS), false)
})

// ---------------------------------------------------------------- lasso, shapes, pan


/** A tool context with a real scene and session and a stand-in editor that records the selection. */
function fakeContext(sc: Scene) {
  const editor = {
    camera: { x: 0, y: 0, zoom: 1 },
    selected: [] as string[],
    setSelection(items: Item[]) { this.selected = items.map((i) => i.id) },
    clearSelection() { this.selected = [] },
    setCamera(c: { x: number; y: number; zoom: number }) { this.camera = c }
  }
  const prefs = { background: 'grid', pens: [{ color: '#1e1e1e', size: 3 }], shapeBases: {} }
  const ctx = { scene: sc, editor, session: createSessionStore(), prefs: () => prefs, invalidate: () => {} } as unknown as ToolContext
  return { ctx, editor }
}
const pt = (x: number, y: number): Sample => ({ sx: x, sy: y, x, y, pressure: 0.5, time: 0 })
const keys = { shift: false, ctrl: false, alt: false }

test('lasso selects what it goes around; a tap selects the item under it or clears', () => {
  const sc = new Scene()
  sc.add([line('in', 40, 60, 50), line('out', 300, 320, 300)])
  const { ctx, editor } = fakeContext(sc)
  const loop = beginLasso(ctx, pt(0, 0))
  loop.move([pt(100, 0), pt(100, 100), pt(0, 100), pt(0, 0)], keys)
  assert.deepEqual(loop.overlay?.().lasso?.length, 5)
  loop.end()
  assert.deepEqual(editor.selected, ['in'])
  const tap = beginLasso(ctx, pt(310, 300))
  tap.end()
  assert.deepEqual(editor.selected, ['out'])
  const empty = beginLasso(ctx, pt(500, 500))
  empty.end()
  assert.deepEqual(editor.selected, [])
})

test('the shape tool drags out a first-class ShapeItem, Shift keeps it regular, a click drops the default size, and switches to select', () => {
  const sc = new Scene()
  const { ctx } = fakeContext(sc)
  ctx.session.setState({ tool: 'shape', shape: 'rectangle' })
  const drag = beginShape(ctx, pt(0, 0))
  drag.move([pt(100, 40)], { ...keys, shift: true })
  assert.ok(drag.overlay?.().live?.parts?.length, 'a preview is shown while dragging')
  drag.end()
  assert.equal(ctx.session.getState().tool, 'select')
  const item = sc.getItems()[0] as ShapeItem
  assert.equal(item.type, 'shape')
  assert.equal(item.geo.kind, 'rectangle')
  assert.equal(Math.abs(item.geo.bx - item.geo.ax), Math.abs(item.geo.by - item.geo.ay))
  ctx.session.setState({ tool: 'shape', shape: 'rectangle' })
  const click = beginShape(ctx, pt(500, 500))
  click.end()
  assert.equal(ctx.session.getState().tool, 'select')
  const dropped = sc.getItems().at(-1) as ShapeItem
  assert.equal(dropped.type, 'shape')
  assert.equal((dropped.geo.ax + dropped.geo.bx) / 2, 500)
  assert.equal(sc.canUndo, true)
})

test('holding Ctrl snaps created shapes (drag, Shift+Ctrl drag, and click-drop) to the 24-unit paper grid', () => {
  const sc = new Scene()
  const { ctx } = fakeContext(sc)
  ctx.session.setState({ tool: 'shape', shape: 'rectangle' })
  const drag = beginShape(ctx, pt(11, 25), { ...keys, ctrl: true })
  drag.move([pt(119, 97)], { ...keys, ctrl: true })
  drag.end()
  const r = sc.getItems()[0] as ShapeItem
  assert.equal(r.geo.ax % 24, 0)
  assert.equal(r.geo.ay % 24, 0)
  assert.equal(r.geo.bx % 24, 0)
  assert.equal(r.geo.by % 24, 0)
  assert.equal(r.geo.ax, 0)
  assert.equal(r.geo.ay, 24)
  assert.equal(r.geo.bx, 120)
  assert.equal(r.geo.by, 96)

  ctx.session.setState({ tool: 'shape', shape: 'rectangle' })
  const sq = beginShape(ctx, pt(13, 13), { ...keys, ctrl: true, shift: true })
  sq.move([pt(100, 50)], { ...keys, ctrl: true, shift: true })
  sq.end()
  const rSq = sc.getItems()[1] as ShapeItem
  assert.equal(rSq.geo.ax % 24, 0)
  assert.equal(rSq.geo.ay % 24, 0)
  assert.equal(rSq.geo.bx % 24, 0)
  assert.equal(rSq.geo.by % 24, 0)
  assert.equal(Math.abs(rSq.geo.bx - rSq.geo.ax), Math.abs(rSq.geo.by - rSq.geo.ay))

  ctx.session.setState({ tool: 'shape', shape: 'cube' })
  const tap = beginShape(ctx, pt(49, 71), { ...keys, ctrl: true })
  tap.end()
  const dropped = sc.getItems()[2] as ShapeItem
  assert.equal(Math.abs(((dropped.geo.ax + dropped.geo.bx) / 2) % 24), 0)
  assert.equal(Math.abs(((dropped.geo.ay + dropped.geo.by) / 2) % 24), 0)
  assert.equal(Math.abs(dropped.geo.ax % 24), 0)
  assert.equal(Math.abs(dropped.geo.ay % 24), 0)
})

test('pan moves the camera with the pointer', () => {
  const { ctx, editor } = fakeContext(new Scene())
  const g = beginPan(ctx, pt(100, 100))
  g.move([pt(110, 90), pt(130, 80)], keys)
  assert.deepEqual(editor.camera, { x: -30, y: 20, zoom: 1 })
})

test('the shape tool previews, inserts and immediately selects one atomic ShapeItem per shape', () => {
  for (const kind of ['triangle', 'rightTriangle', 'polygon', 'obliquePyramid', 'cube'] as const) {
    const scene = new Scene()
    const { ctx, editor } = fakeContext(scene)
    ctx.session.setState({ shape: kind })
    Object.assign(ctx.prefs(), {
      triangleCircles: { incircle: true, circumcircle: true },
      shapeBases: { obliquePyramid: 12, polygon: 5 }
    })
    const drag = beginShape(ctx, pt(0, 0))
    drag.move([pt(180, 100)], keys)
    const preview = drag.overlay!().live!.parts!
    assert.ok(preview.length >= 3, kind)
    drag.end()
    assert.equal(scene.getItems().length, 1, `${kind} is stored as one atomic ShapeItem`)
    const item = scene.getItems()[0] as ShapeItem
    assert.equal(item.type, 'shape')
    assert.equal(item.geo.kind, kind)
    assert.deepEqual(editor.selected, [item.id])
    scene.undo()
    assert.equal(scene.getItems().length, 0)
    scene.redo()
    assert.equal(scene.getItems().length, 1)
  }
})

test('stroke eraser and brush select hit edges of a ShapeItem and ignore empty interior space', () => {
  const sc = new Scene()
  const rect = createShapeItem(specToShapeData({ kind: 'rectangle', ax: 0, ay: 0, bx: 120, by: 120 }), { color: '#000', size: 2, tool: 'pen' }, { id: 'sh1', z: 1 })
  sc.add([rect])
  // Brush in empty interior does not select the shape; brushing an edge selects it.
  assert.deepEqual(itemsTouched(sc.getItems(), 60, 60, 62, 60, 4), [])
  assert.deepEqual(ids(itemsTouched(sc.getItems(), 60, 0, 65, 0, 4)), ['sh1'])
  // Erasing in empty interior leaves shape intact; crossing an edge removes it in one step.
  const rec = record()
  eraseAlong(sc, 60, 50, 60, 70, 5, 'stroke', rec)
  assert.equal(sc.getItems().length, 1)
  eraseAlong(sc, 60, -10, 60, 10, 5, 'stroke', rec)
  assert.equal(sc.getItems().length, 0)
  assert.deepEqual(ids(rec.removed), ['sh1'])
})

test('laser rendering batches fast pen samples and starts a separate path after lifting', () => {
  const trail = new LaserTrail()
  const { ctx } = fakeContext(new Scene())
  const first = beginLaser(ctx, trail, pt(0, 0))
  first.move(Array.from({ length: 216 }, (_, i) => ({ ...pt(i + 1, 0), time: i * 4 })), keys)
  first.end()
  beginLaser(ctx, trail, { ...pt(500, 200), time: 880 })
  let strokes = 0
  const moves: number[][] = []
  const canvas = {
    save() {}, restore() {}, setTransform() {}, beginPath() {}, lineTo() {},
    moveTo(x: number, y: number) { moves.push([x, y]) },
    stroke() { strokes++ }
  }
  drawLaser(canvas as unknown as CanvasRenderingContext2D, { x: 0, y: 0, zoom: 1 }, 1,
    { points: trail.points, now: 880, fade: LASER_FADE_MS })
  assert.ok(strokes > 0 && strokes <= 16)
  assert.deepEqual(moves.at(-1), [500, 200])
})
