// Turning selected items (the selection's ↻ handle). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyXform, hitTest, xformBBox, xformPoint, type Xform } from '../src/board/engine/transform.ts'
import { buildShapeItems, editableShape } from '@penrill/core/shapeItems'
import { specParts } from '@penrill/core/shapes'
import type { ImageItem, ShapeSpec, StrokeItem } from '@penrill/core/types'

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const quarter: Xform = { s: 1, ax: 0, ay: 0, dx: 0, dy: 0, r: Math.PI / 2 }

test('a point turns clockwise on screen about the anchor', () => {
  const [x, y] = xformPoint(quarter, 10, 0)
  assert.ok(near(x, 0) && near(y, 10))
})

test('a turned box keeps its centre and swaps width and height', () => {
  const b = xformBBox({ minX: -20, minY: -5, maxX: 20, maxY: 5 }, quarter)
  assert.ok(near(b.minX, -5) && near(b.maxX, 5) && near(b.minY, -20) && near(b.maxY, 20))
})

test('ink turns point by point; turned shapes keep editable specs and triangles transform their vertices', () => {
  const rectSpec: ShapeSpec = { kind: 'rectangle', ax: 0, ay: 0, bx: 20, by: 10 }
  const rect = buildShapeItems(rectSpec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `r${i}`, z: i }))[0]
  const turnedRect = applyXform(rect, quarter) as StrokeItem
  assert.ok(turnedRect.shape)
  assert.ok(near(turnedRect.shape!.rot!, Math.PI / 2))
  const rebuiltRect = specParts(turnedRect.shape!, turnedRect.size)[0].points
  turnedRect.points.forEach((p, i) => assert.ok(near(p[0], rebuiltRect[i][0]) && near(p[1], rebuiltRect[i][1])))
  // Turning back by -90 deg restores an upright shape with no stored rot.
  const uprightRect = applyXform(turnedRect, { ...quarter, r: -Math.PI / 2 }) as StrokeItem
  assert.equal(uprightRect.shape?.rot, undefined)

  // Rotating a triangle with incircle transforms its exact vertices so it stays editable and its circle matches.
  const triSpec: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 100, by: 80, incircle: true }
  const triParts = buildShapeItems(triSpec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `t${i}`, z: i }))
  const turnedTri = triParts.map((p) => applyXform(p, { s: 1, ax: 50, ay: 40, dx: 0, dy: 0, r: 0.7 }) as StrokeItem)
  const ed = editableShape(turnedTri)
  assert.ok(ed)
  assert.equal(ed!.spec.vertices?.length, 3)
  assert.equal(ed!.spec.rot, undefined)
  const rebuiltTri = specParts(ed!.spec, 2)
  turnedTri[0].points.forEach((p, i) => assert.ok(near(p[0], rebuiltTri[0].points[i][0]) && near(p[1], rebuiltTri[0].points[i][1])))
})

test('an image turns about the selection, adding up its own turn', () => {
  const img: ImageItem = { type: 'image', id: 'i', z: 1, src: '', x: 0, y: 0, w: 40, h: 20, bbox: { minX: 0, minY: 0, maxX: 40, maxY: 20 } }
  // About its own centre: the box stays put, only the turn changes.
  const own = applyXform(img, { s: 1, ax: 20, ay: 10, dx: 0, dy: 0, r: Math.PI / 2 }) as ImageItem
  assert.ok(near(own.x, 0) && near(own.y, 0) && near(own.rot!, Math.PI / 2))
  assert.ok(near(own.bbox.minX, 10) && near(own.bbox.maxX, 30) && near(own.bbox.minY, -10) && near(own.bbox.maxY, 30))
  // Turned back by the same amount: no turn left at all.
  const back = applyXform(own, { s: 1, ax: 20, ay: 10, dx: 0, dy: 0, r: -Math.PI / 2 }) as ImageItem
  assert.equal(back.rot, undefined)
  // Scaled 2× about the top-left corner while turned: the unturned box scales with it.
  const big = applyXform(own, { s: 2, ax: 0, ay: 0, dx: 0, dy: 0 }) as ImageItem
  assert.ok(near(big.w, 80) && near(big.h, 40) && near(big.x, 0) && near(big.y, 0))
})

test('a turned image is hit inside its turned box only, not in the corners of its bounds', () => {
  const img = applyXform(
    { type: 'image', id: 'i', z: 1, src: '', x: 0, y: 0, w: 100, h: 10, bbox: { minX: 0, minY: 0, maxX: 100, maxY: 10 } },
    { s: 1, ax: 50, ay: 5, dx: 0, dy: 0, r: Math.PI / 4 }
  )
  assert.equal(hitTest([img], 50, 5, 0)?.id, 'i')
  // A corner of the bounds is far from the thin turned strip.
  assert.equal(hitTest([img], img.bbox.minX + 2, img.bbox.maxY - 2, 0), null)
})

test('ink remembers how far it was turned, so the turn can be undone exactly', () => {
  const s = {
    type: 'stroke', id: 's', z: 1, tool: 'pen', color: '#000', size: 2, pressure: false,
    points: [[0, 0, 0.5], [10, 0, 0.5], [10, 5, 0.5]],
    bbox: { minX: -2, minY: -2, maxX: 12, maxY: 7 }
  } as StrokeItem
  const a = applyXform(s, { s: 1, ax: 5, ay: 2, dx: 0, dy: 0, r: 0.4 }) as StrokeItem
  const b = applyXform(a, { s: 1, ax: 5, ay: 2, dx: 0, dy: 0, r: 0.3 }) as StrokeItem
  assert.ok(near(b.rot!, 0.7))
  // Back by the remembered turn about the same point: upright, where it was, and nothing remembered.
  const back = applyXform(b, { s: 1, ax: 5, ay: 2, dx: 0, dy: 0, r: -b.rot! }) as StrokeItem
  assert.equal(back.rot, undefined)
  back.points.forEach((p, i) => assert.ok(near(p[0], s.points[i][0]) && near(p[1], s.points[i][1])))
})
