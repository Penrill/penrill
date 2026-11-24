import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '@penrill/core/scene'
import { buildShapeItems, editableShape, patchShapeSpec, regenerateShape, shapeMembers } from '@penrill/core/shapeItems'
import { MAX_BASE, MIN_BASE, shapeParts, specParts } from '@penrill/core/shapes'
import { triangleCircles, type Circle } from '@penrill/core/triangleCircles'
import type { Point, ShapeSpec, StrokeItem } from '@penrill/core/types'
import { applyXform } from '../src/board/engine/transform.ts'
import { FeatureRegistry } from '../src/board/registry.ts'
import { strokesModule } from '../src/board/modules/strokes.ts'
import { eraseUnit } from '../src/board/tools/eraser.ts'
import { Editor } from '../src/board/editor.ts'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const distance = (circle: Circle, p: Point) => Math.hypot(circle.x - p[0], circle.y - p[1])
const sideDistance = (circle: Circle, a: Point, b: Point) => Math.abs(
  (b[0] - a[0]) * (circle.y - a[1]) - (b[1] - a[1]) * (circle.x - a[0])
) / Math.hypot(b[0] - a[0], b[1] - a[1])

test('triangle circles pass through all vertices or touch all sides, for either winding', () => {
  const triangles: Point[][] = [
    [[0, 0, 0.5], [0, 30, 0.5], [40, 30, 0.5]],
    [[60, 0, 0.5], [120, 100, 0.5], [0, 100, 0.5]],
    [[0, 0, 0.5], [120, 0, 0.5], [20, 10, 0.5]],
    [[1e8, -1e8, 0.5], [1e8 + 40, -1e8 + 10, 0.5], [1e8 + 10, -1e8 + 60, 0.5]]
  ]
  for (const triangle of triangles) for (const vertices of [triangle, [...triangle].reverse()]) {
    const [a, b, c] = vertices
    const circles = triangleCircles(a, b, c)!
    assert.ok(circles.incircle.radius > 0)
    for (let i = 0; i < 3; i++) {
      near(distance(circles.circumcircle, vertices[i]), circles.circumcircle.radius)
      near(sideDistance(circles.incircle, vertices[i], vertices[(i + 1) % 3]), circles.incircle.radius)
    }
  }
  const right = triangleCircles(...triangles[0] as [Point, Point, Point])!
  near(right.incircle.x, 10)
  near(right.incircle.y, 20)
  near(right.incircle.radius, 10)
  near(right.circumcircle.x, 20)
  near(right.circumcircle.y, 15)
  near(right.circumcircle.radius, 25)
})

test('collapsed triangles omit circles and never produce non-finite points', () => {
  for (const [bx, by] of [[0, 0], [100, 0], [0, 100]]) {
    const parts = specParts({ kind: 'triangle', ax: 0, ay: 0, bx, by, incircle: true, circumcircle: true }, 2)
    assert.equal(parts.length, 1)
    assert.ok(parts.flatMap((p) => p.points.flat()).every(Number.isFinite))
  }
})

test('both triangle kinds generate circles independently and recompute them after stretching', () => {
  for (const kind of ['triangle', 'rightTriangle'] as const) {
    for (const [bx, by] of [[120, 100], [300, 40], [-180, -220]]) {
      const spec: ShapeSpec = { kind, ax: 0, ay: 0, bx, by, incircle: true, circumcircle: true }
      const parts = specParts(spec, 2)
      assert.equal(parts.length, 3)
      const [a, b, c] = parts[0].points
      const circles = triangleCircles(a, b, c)!
      for (const [index, circle] of [circles.incircle, circles.circumcircle].entries()) {
        for (const p of parts[index + 1].points) near(distance(circle, p), circle.radius)
      }
      assert.equal(specParts({ ...spec, circumcircle: false }, 2).length, 2)
      assert.equal(specParts({ ...spec, incircle: false }, 2).length, 2)
      assert.equal(specParts({ ...spec, incircle: false, circumcircle: false }, 2).length, 1)
    }
  }
})

test('triangle constructions stay grouped, editable, erasable, undoable and vector in exports', () => {
  const scene = new Scene()
  const spec: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 100, by: 100, incircle: true, circumcircle: true }
  const parts = buildShapeItems(spec, { color: '#1971c2', size: 2, tool: 'pen' }, (i) => ({ id: `part${i}`, z: scene.allocZ() }))
  scene.add(parts)
  assert.equal(new Set(parts.map((p) => p.groupId)).size, 1)
  assert.ok(parts[0].groupId)
  assert.deepEqual(shapeMembers(parts, parts[2]), parts)
  assert.deepEqual(eraseUnit(parts, parts[2]), parts)
  const next = regenerateShape(parts, { ...spec, bx: 240 }, () => scene.allocZ(), false)
  scene.replace(parts, next)
  assert.equal(editableShape(next)?.spec.bx, 240)
  assert.deepEqual(next.map((p) => p.id), parts.map((p) => p.id))
  assert.equal(next[0].groupId, parts[0].groupId)
  assert.notDeepEqual(next[1].points, parts[1].points)
  scene.undo()
  assert.deepEqual(scene.getItems(), parts)
  scene.redo()
  assert.deepEqual(scene.getItems(), next)
  const moved = next.map((p) => applyXform(p, { s: 2, ax: 0, ay: 0, dx: 50, dy: -40 }) as StrokeItem)
  assert.equal(editableShape(moved)?.spec.incircle, true)
  const rebuilt = specParts(moved[0].shape!, 4)
  moved.forEach((part, i) => part.points.forEach((p, j) => {
    near(p[0], rebuilt[i].points[j][0])
    near(p[1], rebuilt[i].points[j][1])
  }))
  const reg = new FeatureRegistry([strokesModule])
  for (const part of parts) assert.match(reg.svg(part), /^<path .*fill="none"/)
  assert.equal(editableShape([parts[0], { ...parts[1], shape: { ...spec, incircle: false } }, parts[2]]), null)
})

test('pyramids have n base edges and n apex edges for every supported base', () => {
  for (const kind of ['pyramid', 'obliquePyramid'] as const) for (let n = MIN_BASE; n <= MAX_BASE; n++) {
    const parts = shapeParts(kind, 0, 0, 200, 150, false, 2, n)
    assert.equal(parts.length, 2 * n, `${kind}: ${n}`)
    assert.equal(parts[0].dash, undefined)
    assert.ok(parts.some((p) => p.dash === 'dashed'))
    assert.ok(parts.flatMap((p) => p.points.flat()).every(Number.isFinite))
    const sideEdges = parts.filter((p) => p.points[0][1] === 0)
    assert.equal(sideEdges.length, n)
    const baseVertices = new Set(sideEdges.map((p) => JSON.stringify(p.points[1])))
    assert.equal(baseVertices.size, n)
    if (kind === 'obliquePyramid') near(sideEdges[0].points[0][0], 180)
  }
  const prism = shapeParts('prism', 0, 0, 200, 150, false, 2, 24)
  assert.equal(prism[0].points.length, 25)
  assert.equal(prism.length, 49)
})

test('undo and redo keep every restored circle selected so the triangle remains editable', () => {
  const editor = new Editor([strokesModule])
  try {
    const spec: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 120, by: 100, incircle: true, circumcircle: true }
    const parts = buildShapeItems(spec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `undo${i}`, z: i }))
    editor.scene.add(parts)
    editor.setSelection(parts)
    editor.updateShape({ incircle: false })
    assert.equal(editor.selectedItems().length, 2)
    editor.undo()
    assert.equal(editor.selectedItems().length, 3)
    assert.equal(editableShape(editor.selectedItems())?.spec.incircle, true)
    editor.redo()
    assert.equal(editor.selectedItems().length, 2)
    assert.equal(editableShape(editor.selectedItems())?.spec.incircle, false)
    editor.updateShape({ circumcircle: false })
    assert.equal(editor.selectedItems().length, 1)
    editor.undo()
    assert.equal(editor.selectedItems().length, 2)
    assert.ok(editableShape(editor.selectedItems()))
  } finally {
    editor.dispose()
  }
})

test('a pyramid can switch between straight and oblique while retaining its base, style and group', () => {
  const spec: ShapeSpec = { kind: 'pyramid', ax: 0, ay: 0, bx: 200, by: 150, base: 6 }
  const style = { tool: 'pen' as const, color: '#e03131', size: 3 }
  const parts = buildShapeItems(spec, style, (i) => ({ id: `p${i}`, z: i }))
  const oblique = regenerateShape(parts, patchShapeSpec(spec, { kind: 'obliquePyramid' }), () => 100, false)
  assert.equal(editableShape(oblique)?.spec.base, 6)
  assert.equal(oblique[0].groupId, parts[0].groupId)
  assert.ok(oblique.every((p) => p.color === style.color && p.size === style.size))
  const apex = (items: StrokeItem[]) => items.find((p) => p.points[0][1] === 0)!.points[0]
  assert.notDeepEqual(apex(oblique), apex(parts))
  assert.equal(patchShapeSpec({ ...spec, kind: 'prism', base: undefined }, { kind: 'obliquePyramid' }).base, 3)
  assert.equal(patchShapeSpec(spec, { kind: 'obliquePyramid', base: 12 }).base, 12)
  const triangle: ShapeSpec = { ...spec, kind: 'triangle', base: undefined, incircle: true, circumcircle: true }
  assert.equal(patchShapeSpec(triangle, { kind: 'rightTriangle' }).incircle, true)
  assert.equal(patchShapeSpec(triangle, { kind: 'rectangle' }).incircle, undefined)
  assert.equal(patchShapeSpec(triangle, { kind: 'rectangle' }).circumcircle, undefined)
})
