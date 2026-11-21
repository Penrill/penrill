// Turning selected items (the selection's ↻ handle). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyXform, hitTest, xformBBox, xformPoint, type Xform } from '../src/board/engine/transform.ts'
import type { ImageItem, StrokeItem } from '@penrill/core/types'

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

test('ink turns point by point; a turned shape becomes plain lines', () => {
  const s: StrokeItem = {
    type: 'stroke', id: 's', z: 1, tool: 'pen', color: '#000', size: 2, pressure: false, geom: 'line',
    points: [[0, 0, 0.5], [10, 0, 0.5]],
    shape: { kind: 'rect', ax: 0, ay: 0, bx: 10, by: 10 },
    bbox: { minX: -2, minY: -2, maxX: 12, maxY: 2 }
  } as StrokeItem
  const t = applyXform(s, quarter) as StrokeItem
  assert.ok(near(t.points[1][0], 0) && near(t.points[1][1], 10))
  assert.equal(t.shape, undefined)
  // Only moved or scaled, a shape stays editable.
  assert.ok((applyXform(s, { s: 2, ax: 0, ay: 0, dx: 0, dy: 0 }) as StrokeItem).shape)
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
