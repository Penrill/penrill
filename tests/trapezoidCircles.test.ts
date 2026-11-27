// Trapezoid incircles and circumcircles. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import { trapezoidCircles } from '@penrill/core/trapezoidCircles'
import type { ShapeItem, ShapeSpec, Vec2 } from '@penrill/core/types'
import { availableWholeShapeActions, toggleConstructionBatch } from '@penrill/shape-editor/elements'

const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const lineDistance = (p: { x: number; y: number }, a: Vec2, b: Vec2): number =>
  Math.abs((b[0] - a[0]) * (a[1] - p.y) - (a[0] - p.x) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1])
const mk = (spec: ShapeSpec): ShapeItem =>
  createShapeItem(specToShapeData(spec), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: 'tz', z: 1 })
const verts = (item: ShapeItem): Vec2[] => evaluateShape(item).vertices.map((v) => v.pos)

test('isosceles tangential trapezoid has both circles', () => {
  // Bases 8 and 2, legs 5, height 4.
  const item = mk({ kind: 'trapezoid', ax: 0, ay: 0, bx: 8, by: 4, topLeft: 0.375, topRight: 0.375 })
  const v = verts(item)
  const { incircle, circumcircle } = trapezoidCircles(v)
  assert.ok(incircle && circumcircle)
  near(incircle.radius, 2)
  near(incircle.x, 4)
  near(incircle.y, 2)
  for (let i = 0; i < 4; i++) {
    near(Math.hypot(v[i][0] - circumcircle.x, v[i][1] - circumcircle.y), circumcircle.radius)
    near(lineDistance(incircle, v[i], v[(i + 1) % 4]), 2)
  }
})

test('right tangential trapezoid has an incircle but no circumcircle', () => {
  // Top 3, bottom 6, height 4, legs 4 and 5: 3 + 6 = 4 + 5.
  const { incircle, circumcircle } = trapezoidCircles(verts(mk({ kind: 'trapezoid', ax: 0, ay: 0, bx: 6, by: 4, topLeft: 0, topRight: 0.5 })))
  assert.equal(circumcircle, null)
  assert.ok(incircle)
  near(incircle.x, 2)
  near(incircle.y, 2)
  near(incircle.radius, 2)
})

test('rotated trapezoid keeps its circles', () => {
  const item = mk({ kind: 'trapezoid', ax: 100, ay: 50, bx: 108, by: 54, topLeft: 0.375, topRight: 0.375, rot: 0.7 })
  const v = verts(item)
  const { incircle, circumcircle } = trapezoidCircles(v)
  assert.ok(incircle && circumcircle)
  near(incircle.radius, 2)
  for (let i = 0; i < 4; i++) near(lineDistance(incircle, v[i], v[(i + 1) % 4]), 2)
})

test('whole-shape actions offer the circles only when the trapezoid has them', () => {
  // Default trapezoid is isosceles but not tangential.
  let item = mk({ kind: 'trapezoid', ax: 0, ay: 0, bx: 120, by: 80 })
  const byId = (it: ShapeItem, id: string) => availableWholeShapeActions(it).find((a) => a.id === id)!
  assert.equal(byId(item, 'circumcircle').disabled, undefined)
  assert.equal(byId(item, 'incircle').disabled, true)
  assert.equal(byId(item, 'incircle').hintKey, 'shape.incircleNeedsSums')

  item = toggleConstructionBatch(item, byId(item, 'circumcircle').constructions)
  assert.ok(evaluateShape(item).constructions.some((c) => c.kind === 'circumcircle'))

  // Bend it out of shape: the circle hides, but the checkbox stays usable to turn it off.
  const skewed: ShapeItem = { ...item, geo: { ...item.geo, topLeft: 0.05, topRight: 0.4 } }
  assert.equal(evaluateShape(skewed).constructions.some((c) => c.kind === 'circumcircle'), false)
  assert.equal(byId(skewed, 'circumcircle').disabled, undefined)
  assert.equal(byId(skewed, 'circumcircle').active, true)
  const off = toggleConstructionBatch(skewed, byId(skewed, 'circumcircle').constructions)
  assert.equal(byId(off, 'circumcircle').disabled, true)
  assert.equal(byId(off, 'circumcircle').hintKey, 'shape.circumcircleNeedsIsosceles')
})
