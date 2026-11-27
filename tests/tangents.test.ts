// Tangents to a circle (packages/core/src/tangents.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createShapeItem } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import { ellipseFrame, layTangents, TANGENT_REACH, tangentAt, type TangentConstruction } from '@penrill/core/tangents'
import type { ShapeItem, Vec2 } from '@penrill/core/types'
import { dragShapeItemHandle, shapeItemHandles } from '@penrill/shape-editor/handles'
import { Editor } from '../src/board/editor.ts'
import { deserializeBoard, serializeBoard } from '../src/board/engine/serialize.ts'
import { shapeEditorModule } from '../src/board/modules/shapeEditor.ts'
import { beginShapeItemHandle } from '../src/board/modules/shapeEditor/controller.ts'
import { strokesModule } from '../src/board/modules/strokes.ts'

// A circle of radius 100 around (0, 0).
const geo = { kind: 'ellipse' as const, ax: -100, ay: -100, bx: 100, by: 100 }
const f = ellipseFrame(geo)
const tan = (id: string, angle: number, back = 0.5, fwd = 0.5): TangentConstruction => ({ id, kind: 'tangent', angle, back, fwd })
const circle = (constructions: TangentConstruction[]): ShapeItem =>
  createShapeItem({ geo, constructions }, { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: 'c1', z: 1 })
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

test('a tangent is perpendicular to the radius at the touch point, also on a turned circle', () => {
  for (const rot of [0, 0.7]) {
    const fr = ellipseFrame({ ...geo, rot })
    for (const a of [0, 1, 2.5, -2]) {
      const { at, dir } = tangentAt(fr, a)
      close(Math.hypot(at[0], at[1]), 100)
      close(dot(at, dir), 0)
    }
  }
})

test('two tangents meet at P: PA = PB and ∠APB + ∠AOB = 180°', () => {
  const { laid, pairs } = layTangents(f, [tan('a', -Math.PI / 2 - 0.6), tan('b', -Math.PI / 2 + 0.6)])
  assert.equal(pairs.length, 1)
  const { p } = pairs[0]
  const [a, b] = laid
  close(Math.hypot(p[0] - a.at[0], p[1] - a.at[1]), Math.hypot(p[0] - b.at[0], p[1] - b.at[1]))
  const ang = (o: Vec2, u: Vec2, v: Vec2): number => {
    const x: Vec2 = [u[0] - o[0], u[1] - o[1]], y: Vec2 = [v[0] - o[0], v[1] - o[1]]
    return Math.acos(dot(x, y) / Math.hypot(...x) / Math.hypot(...y))
  }
  close(ang(p, a.at, b.at) + ang([0, 0], a.at, b.at), Math.PI)
  // Tangent-chord angle = half the central angle.
  close(ang(a.at, p, b.at), ang([0, 0], a.at, b.at) / 2)
})

test('a short side is drawn up to P, a long one is never shortened', () => {
  const { laid, pairs } = layTangents(f, [tan('a', -Math.PI / 2 - 0.6, 0.2, 0.2), tan('b', -Math.PI / 2 + 0.6, 5, 5)])
  const { p } = pairs[0]
  const [a, b] = laid
  const reach = (t: typeof a): number => Math.max(t.back, t.fwd)
  close(reach(a), Math.hypot(p[0] - a.at[0], p[1] - a.at[1]))
  assert.equal(reach(b), 500)
})

test('tangents meeting farther than 10 cm away are left as drawn; parallel ones never meet', () => {
  // Almost opposite points: the crossing point is far off.
  const far = layTangents(f, [tan('a', 0), tan('b', Math.PI - 0.05)])
  assert.equal(far.pairs.length, 0)
  assert.ok(TANGENT_REACH === 480)
  for (const t of far.laid) assert.equal(t.back, 50)
  assert.equal(layTangents(f, [tan('a', 0), tan('b', Math.PI)]).pairs.length, 0)
})

test('three tangents around a circle make three crossing points', () => {
  const { pairs } = layTangents(f, [tan('a', 0), tan('b', (2 * Math.PI) / 3), tan('c', (4 * Math.PI) / 3)])
  assert.equal(pairs.length, 3)
})

test('dragging one end of a tangent changes that side only', () => {
  const item = circle([tan('tan:x', 0, 0.5, 0.5)])
  const handles = shapeItemHandles(item).filter((h) => h.id.startsWith('tan:'))
  assert.deepEqual(handles.map((h) => h.id).sort(), ['tan:tan:x:back', 'tan:tan:x:fwd'])
  // The tangent at angle 0 touches (100, 0) and runs along y; pull the front end to y = 180.
  const { dir } = tangentAt(f, 0)
  const res = dragShapeItemHandle(item, 'tan:tan:x:fwd', [100, 180 * Math.sign(dir[1])], { shift: false, ctrl: false, alt: false, snapTol: 1, gridStep: [24, 24] })
  const c = res.item.constructions![0] as TangentConstruction
  close(c.fwd, 1.8)
  assert.equal(c.back, 0.5)
})

test('a tangent end drag leaves the scene alone until release, then is one undo step', () => {
  const editor = new Editor([strokesModule, shapeEditorModule])
  try {
    const item = circle([tan('tan:x', 0, 0.5, 0.5)])
    editor.scene.add([item])
    editor.setSelection([item])
    const end = editor.features.shapeEditor!.itemHandles(item).find((h) => h.id === 'tan:tan:x:fwd')!
    const version = editor.scene.version
    const g = beginShapeItemHandle(editor.features.shapeEditor!, editor, item, end, [end.x, end.y])
    g.move([end.x, end.y + 40 * Math.sign(end.y)], { shift: false, ctrl: false, alt: false }, [24, 24])
    // The drag lives in the gesture: the scene (and the panels that follow it) did not change.
    assert.equal(editor.scene.version, version)
    assert.notEqual(g.live, null)
    assert.equal(g.end(), true)
    const dragged = editor.scene.getById(['c1'])[0] as ShapeItem
    assert.ok((dragged.constructions![0] as TangentConstruction).fwd > 0.5)
    editor.undo()
    assert.equal((editor.scene.getById(['c1'])[0] as ShapeItem).constructions![0], item.constructions![0])
  } finally {
    editor.dispose()
  }
})

test('tangents and their marks are drawn and follow the circle', () => {
  const item = circle([tan('a', -2.2), tan('b', -0.9)])
  const ev = evaluateShape(item)
  const tangents = ev.constructions.filter((c) => c.kind === 'tangent')
  assert.equal(tangents.length, 2)
  const letters = tangents.flatMap((c) => c.texts ?? []).flatMap((t) => ('letter' in t ? [t.letter] : []))
  assert.deepEqual(letters.sort(), ['A', 'B', 'O', 'P'])
  const degs = tangents.flatMap((c) => c.texts ?? []).flatMap((t) => ('deg' in t ? [t.deg] : []))
  assert.equal(degs.length, 3)
  // Marks switched off: only the tangents and the touch points are left.
  const bare = evaluateShape({ ...item, tangentMarks: { radius: false, angle: false, equal: false, chord: false } })
  const segs = bare.constructions.reduce((n, c) => n + c.segments.length, 0)
  assert.equal(segs, 2)
})

test('tangents and switched-off marks survive saving; bad ones are dropped', () => {
  const item: ShapeItem = { ...circle([tan('a', 1, 0.4, 0.9)]), tangentMarks: { chord: false } }
  const file = serializeBoard({ items: [item], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(file.version, 14)
  const raw = JSON.parse(JSON.stringify(file))
  raw.items[0].constructions.push({ id: 'bad', kind: 'tangent', angle: 1, back: -1, fwd: 1 })
  raw.items[0].tangentMarks.radius = 'yes'
  const back = deserializeBoard(raw).items[0] as ShapeItem
  assert.deepEqual(back.constructions, [tan('a', 1, 0.4, 0.9)])
  assert.deepEqual(back.tangentMarks, { chord: false })
})
