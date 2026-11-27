import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitStroke } from '@penrill/core/erase'
import { autoBullet, continueList } from '../src/board/engine/lists.ts'
import { holdShape, perfectShape, recognizeShape } from '@penrill/shape-recognition/snapshape'
import { shapePolygonVertices } from '@penrill/core/shapes'
import type { Point, ShapeSpec, StrokeItem } from '@penrill/core/types'

let n = 0
const id = (): string => `p${++n}`

const stroke = (points: Point[], extra: Partial<StrokeItem> = {}): StrokeItem => ({
  type: 'stroke', id: 's', z: 1, tool: 'pen', color: '#000', size: 2, pressure: false, points,
  bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, ...extra
})

test('point eraser cuts a line in two and keeps line ends only where they survive', () => {
  const s = stroke([[0, 0, 0.5], [100, 0, 0.5]], { geom: 'line', startCap: 'arrow', endCap: 'dot' })
  const pieces = splitStroke(s, 50, 0, 50, 0, 5, id)!
  assert.equal(pieces.length, 2)
  assert.ok(pieces[0].points.at(-1)![0] < 45)
  assert.ok(pieces[1].points[0][0] > 55)
  assert.equal(pieces[0].startCap, 'arrow')
  assert.equal(pieces[0].endCap, undefined)
  assert.equal(pieces[1].endCap, 'dot')
  assert.equal(pieces[1].startCap, undefined)
  assert.notEqual(pieces[0].id, pieces[1].id)
})

test('point eraser leaves untouched strokes alone and can remove a stroke entirely', () => {
  const s = stroke([[0, 0, 0.5], [10, 0, 0.5]])
  assert.equal(splitStroke(s, 50, 50, 60, 60, 5, id), null)
  assert.deepEqual(splitStroke(s, 5, 0, 5, 0, 40, id), [])
})

test('pieces of a shape become plain lines', () => {
  const s = stroke([[0, 0, 0.5], [100, 0, 0.5]], { geom: 'line', groupId: 'g', shape: { kind: 'line', ax: 0, ay: 0, bx: 100, by: 0 } })
  for (const p of splitStroke(s, 50, 0, 50, 0, 5, id)!) {
    assert.equal(p.shape, undefined)
    assert.equal(p.groupId, undefined)
  }
})

const wobble = (i: number): number => Math.sin(i * 1.7) * 1.2
const circle = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 80 }, (_, i) => {
    const a = (i / 76) * Math.PI * 2
    return [cx + Math.cos(a) * (rx + wobble(i)), cy + Math.sin(a) * (ry + wobble(i)), 0.5] as Point
  })
const polyline = (corners: [number, number][], per = 20): Point[] => {
  const out: Point[] = []
  for (let k = 0; k < corners.length - 1; k++) {
    const [ax, ay] = corners[k]
    const [bx, by] = corners[k + 1]
    for (let i = 0; i < per; i++) out.push([ax + ((bx - ax) * i) / per + wobble(i + k), ay + ((by - ay) * i) / per + wobble(i * 3 + k), 0.5])
  }
  out.push([...corners.at(-1)!, 0.5])
  return out
}

test('lists continue on Enter and end on an empty item', () => {
  assert.deepEqual(continueList('• milk'), { next: '• ', exit: false })
  assert.deepEqual(continueList('- milk'), { next: '• ', exit: false })
  assert.deepEqual(continueList('  3. eggs'), { next: '  4. ', exit: false })
  assert.deepEqual(continueList('2) x'), { next: '3) ', exit: false })
  assert.deepEqual(continueList('• '), { next: '• ', exit: true })
  assert.equal(continueList('plain text'), null)
  assert.equal(continueList('3.14 is pi'), null)
  assert.equal(autoBullet('- '), '• ')
  assert.equal(autoBullet('  * '), '  • ')
  assert.equal(autoBullet('a - '), null)
})


test('a touchpad swipe is never split between zooming and scrolling', async () => {
  const { WheelSource, WHEEL_GESTURE_GAP } = await import('../src/board/engine/wheel.ts')
  const src = new WheelSource()
  // Two-finger swipe: small pixel steps, some purely vertical, some with a sideways part.
  const swipe = [[0, 4], [1, 6], [0, 9], [0, 7], [2, 5], [0, 3]].map(([dx, dy], i) =>
    src.isMouse({ deltaX: dx, deltaY: dy, deltaMode: 0, wheelDeltaY: -3 * dy, timeStamp: 1000 + i * 16 }))
  assert.ok(swipe.every((m) => !m))
  // A mouse wheel later: whole notches.
  const t = 1000 + 6 * 16 + WHEEL_GESTURE_GAP + 50
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120, timeStamp: t }), true)
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120, timeStamp: t + 30 }), true)
  // Firefox reports lines for a mouse wheel.
  assert.equal(src.isMouse({ deltaX: 0, deltaY: 3, deltaMode: 1, timeStamp: t + 1000 }), true)
})

const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const rect = polyline([[0, 0], [160, 0], [160, 90], [0, 90], [0, 0]])

test('snaps circles, ovals, rectangles, squares and triangles to board shapes', () => {
  assert.equal(recognizeShape(circle(100, 100, 60, 62))?.kind, 'circle')
  assert.equal(recognizeShape(circle(100, 100, 60, 62))?.spec?.kind, 'ellipse')
  assert.equal(recognizeShape(circle(100, 100, 120, 50))?.kind, 'ellipse')
  assert.equal(recognizeShape(rect)?.spec?.kind, 'rectangle')
  assert.equal(recognizeShape(polyline([[0, 0], [100, 0], [100, 96], [0, 96], [0, 0]]))?.kind, 'square')
  assert.equal(recognizeShape(polyline([[0, 100], [60, 0], [120, 100], [0, 100]]))?.spec?.kind, 'triangle')
  assert.equal(recognizeShape(polyline([[0, 0], [0, 100], [120, 100], [0, 0]]))?.spec?.kind, 'rightTriangle')
  // Level already: nothing to straighten on a longer hold.
  assert.equal(recognizeShape(rect)?.next, undefined)
  assert.equal(recognizeShape(circle(100, 100, 60, 62))?.next, undefined)
})

test('an open curve on a circle becomes an arc; lines, zigzags, arrows and scribbles stay as drawn', () => {
  const arc: Point[] = Array.from({ length: 40 }, (_, i) => {
    const a = Math.PI + (i / 39) * Math.PI * 0.8
    return [100 + Math.cos(a) * 80 + wobble(i) * 0.5, 100 + Math.sin(a) * 80, 0.5]
  })
  assert.equal(recognizeShape(arc)?.kind, 'arc')
  assert.equal(recognizeShape(polyline([[0, 0], [200, 30]])), null)
  assert.equal(recognizeShape(polyline([[0, 100], [50, 0], [100, 100], [150, 0]])), null)
  assert.equal(recognizeShape(polyline([[0, 100], [200, 100], [170, 80], [200, 100], [170, 120]], 12)), null)
  const wave: Point[] = Array.from({ length: 40 }, (_, i) => [i * 5, Math.sin(i / 6) * 60, 0.5])
  assert.equal(recognizeShape(wave), null)
})

test('dragging a held shape only resizes it around its centre: it stays a level board shape', () => {
  const r = recognizeShape(rect)!
  const [cx, cy] = r.pivot
  const big = holdShape(r, [cx + 10, cy], [cx, cy + 20])
  assert.equal(big.spec?.kind, 'rectangle')
  assert.ok(close(big.spec!.bx - big.spec!.ax, (r.spec!.bx - r.spec!.ax) * 2) && close(big.spec!.by - big.spec!.ay, (r.spec!.by - r.spec!.ay) * 2))
  assert.ok(close((big.spec!.ax + big.spec!.bx) / 2, cx))
})

test('perfect: rectangle becomes a square, oval a circle, triangle equilateral', () => {
  const sq = perfectShape(recognizeShape(rect)!)
  assert.equal(sq.kind, 'square')
  assert.ok(close(sq.spec!.bx - sq.spec!.ax, sq.spec!.by - sq.spec!.ay))
  const c = perfectShape(recognizeShape(circle(100, 100, 120, 50))!)
  assert.equal(c.kind, 'circle')
  assert.ok(close(c.spec!.bx - c.spec!.ax, c.spec!.by - c.spec!.ay))
  const t = perfectShape(recognizeShape(polyline([[0, 100], [60, 0], [120, 100], [0, 100]]))!).spec!
  assert.ok(close(t.by - t.ay, ((t.bx - t.ax) * Math.sqrt(3)) / 2))
})

// Hold-to-snap, two steps: the shape as drawn (tilt kept), then level on a longer hold.
type XY = [number, number]
const ring = (c: XY[]): XY[] => [...c, c[0]]
const turned = (c: XY[], deg: number, cx = 100, cy = 100): XY[] =>
  c.map(([x, y]) => {
    const r = (deg * Math.PI) / 180
    return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]
  })
const regular = (k: number, r = 80, off = -Math.PI / 2): XY[] =>
  Array.from({ length: k }, (_, i): XY => [100 + Math.cos(off + (i / k) * 2 * Math.PI) * r, 100 + Math.sin(off + (i / k) * 2 * Math.PI) * r])
const deg = (spec: ShapeSpec | undefined): number => ((spec?.rot ?? 0) * 180) / Math.PI
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol
const rect160x90: XY[] = [[0, 0], [160, 0], [160, 90], [0, 90]]

test('a tilted rectangle keeps its tilt, then straightens on a longer hold', () => {
  const s = recognizeShape(polyline(ring(turned(rect160x90, 20))))!
  assert.equal(s.spec?.kind, 'rectangle')
  assert.ok(near(deg(s.spec), 20, 1.5))
  assert.ok(near(s.spec!.bx - s.spec!.ax, 160, 4) && near(s.spec!.by - s.spec!.ay, 90, 4))
  const level = s.next!
  assert.equal(level.spec?.kind, 'rectangle')
  assert.equal(level.spec?.rot, undefined)
  assert.ok(near(level.spec!.bx - level.spec!.ax, s.spec!.bx - s.spec!.ax, 1e-6))
  // A tilt of a few degrees snaps level straight away, at its real size.
  const slight = recognizeShape(polyline(ring(turned(rect160x90, 3))))!
  assert.equal(slight.spec?.rot, undefined)
  assert.equal(slight.next, undefined)
  assert.ok(near(slight.spec!.bx - slight.spec!.ax, 160, 4))
  // A tilted oval too.
  const oval = recognizeShape(circle(100, 100, 120, 50).map(([x, y, p]): Point => [...turned([[x, y]], 30)[0], p]))!
  assert.equal(oval.kind, 'ellipse')
  assert.ok(near(deg(oval.spec), 30, 2))
  assert.equal(oval.next?.spec?.rot, undefined)
})

test('quadrilaterals: rhombus, parallelogram, trapezoid and any other', () => {
  const rh = recognizeShape(polyline(ring(turned([[100, 0], [160, 100], [100, 200], [40, 100]], 25))))!
  assert.equal(rh.spec?.kind, 'rhombus')
  assert.ok(near(deg(rh.spec), 25, 1.5))
  assert.equal(rh.next?.spec?.kind, 'rhombus')
  const par = recognizeShape(polyline(ring([[40, 0], [200, 0], [160, 100], [0, 100]])))!
  assert.equal(par.spec?.kind, 'parallelogram')
  assert.ok(near(par.spec!.skew!, 0.2, 0.03))
  assert.ok(near(recognizeShape(polyline(ring([[0, 0], [160, 0], [200, 100], [40, 100]])))!.spec!.skew!, -0.2, 0.03))
  const iso = recognizeShape(polyline(ring([[50, 0], [150, 0], [200, 100], [0, 100]])))!.spec!
  assert.equal(iso.kind, 'trapezoid')
  assert.equal(iso.topLeft, iso.topRight)
  const right = recognizeShape(polyline(ring([[0, 0], [100, 0], [200, 100], [0, 100]])))!.spec!
  assert.equal(right.topLeft, 0)
  assert.ok(near(right.topRight!, 0.5, 0.03))
  // Drawn upside down: the longer base is still the bottom of the shape, which is turned over.
  assert.ok(near(Math.abs(deg(recognizeShape(polyline(ring([[0, 0], [200, 0], [150, 100], [50, 100]])))!.spec)), 180, 1e-6))
  const tilted = recognizeShape(polyline(ring(turned([[50, 0], [150, 0], [200, 100], [0, 100]], 30))))!
  assert.ok(near(deg(tilted.spec), 30, 1.5))
  assert.equal(tilted.next?.spec?.rot, undefined)
  // The top hanging past the bottom: no board trapezoid, so its own corners.
  const overhang = recognizeShape(polyline(ring([[120, 0], [260, 0], [200, 100], [0, 100]])))!
  assert.equal(overhang.spec?.kind, 'polygon')
  assert.equal(overhang.spec?.vertices?.length, 4)
  const kite = recognizeShape(polyline(ring([[100, 0], [180, 60], [100, 200], [20, 60]])))!
  assert.equal(kite.kind, 'quadrilateral')
  assert.equal(kite.next?.spec?.kind, 'rectangle')
  // A rectangle with rounded corners is still a rectangle, not a circle.
  const rounded: Point[] = Array.from({ length: 201 }, (_, i) => {
    const t = (i / 200) * 2 * Math.PI
    const c = Math.cos(t), sn = Math.sin(t)
    return [100 + 100 * Math.sign(c) * Math.abs(c) ** 0.25, 100 + 60 * Math.sign(sn) * Math.abs(sn) ** 0.25, 0.5]
  })
  assert.equal(recognizeShape(rounded)?.spec?.kind, 'rectangle')
})

test('triangles keep their shape: scalene, right at any corner, equilateral', () => {
  const sc = recognizeShape(polyline(ring([[0, 100], [30, 0], [160, 100]])))!
  assert.equal(sc.spec?.kind, 'triangle')
  assert.equal(sc.spec?.vertices?.length, 3)
  assert.equal(sc.next?.spec?.vertices, undefined)
  // The right angle at the top right: exactly 90 deg, at the middle corner.
  const r = recognizeShape(polyline(ring([[0, 0], [120, 0], [120, 100]])))!.spec!
  assert.equal(r.kind, 'rightTriangle')
  const [a, b, c] = r.vertices!
  assert.ok(near((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]), 0, 1e-6))
  const rt = recognizeShape(polyline(ring(turned([[0, 0], [0, 100], [120, 100]], 25))))!
  assert.equal(rt.spec?.kind, 'rightTriangle')
  assert.equal(rt.next?.spec?.kind, 'rightTriangle')
  const eq = recognizeShape(polyline(ring(regular(3, 80, -Math.PI / 2 + 0.3))))!.spec!.vertices!
  const sides = eq.map((p, i) => Math.hypot(eq[(i + 1) % 3][0] - p[0], eq[(i + 1) % 3][1] - p[1]))
  assert.ok(near(sides[0], sides[1], 1e-6) && near(sides[1], sides[2], 1e-6))
})

test('polygons: regular ones turned as drawn, others by their corners', () => {
  const pent = recognizeShape(polyline(ring(regular(5, 80, -Math.PI / 2 + 0.25))))!
  assert.equal(pent.spec?.kind, 'pentagon')
  assert.ok(near(deg(pent.spec), 14.3, 1.5))
  assert.equal(pent.next?.spec?.rot, undefined)
  assert.equal(recognizeShape(polyline(ring(regular(5))))?.next, undefined)
  assert.equal(recognizeShape(polyline(ring(regular(6, 80, 0.3))))?.spec?.kind, 'hexagon')
  const oct = recognizeShape(polyline(ring(regular(8, 90))))!.spec!
  assert.equal(oct.kind, 'polygon')
  assert.equal(oct.base, 8)
  const odd = recognizeShape(polyline(ring([[100, 0], [200, 70], [150, 180], [30, 160], [0, 40]])))!
  assert.equal(odd.spec?.vertices?.length, 5)
  assert.equal(odd.next?.spec?.kind, 'pentagon')
  // A circle is never taken for a polygon.
  assert.equal(recognizeShape(circle(100, 100, 90, 88))?.kind, 'circle')
})

test('the outline drawn while holding is the board shape it becomes', () => {
  const strokes = [
    polyline(ring(turned(rect160x90, 20))),
    polyline(ring(turned([[50, 0], [150, 0], [200, 100], [0, 100]], 30))),
    polyline(ring(regular(6, 80, 0.3)))
  ]
  for (const st of strokes) {
    const s = recognizeShape(st)!
    for (const shape of [s, s.next!]) {
      const board = shapePolygonVertices(shape.spec!)
      assert.equal(shape.points.length, board.length + 1)
      board.forEach((p, i) => assert.ok(near(p[0], shape.points[i][0], 1e-6) && near(p[1], shape.points[i][1], 1e-6)))
    }
  }
})

test('perfect and resizing keep the tilt; free corners scale too', () => {
  const s = recognizeShape(polyline(ring(turned(rect160x90, 20))))!
  const sq = perfectShape(s)
  assert.equal(sq.kind, 'square')
  assert.equal(sq.spec?.rot, s.spec?.rot)
  const big = holdShape(s, [s.pivot[0] + 10, s.pivot[1]], [s.pivot[0] + 20, s.pivot[1]])
  assert.equal(big.spec?.rot, s.spec?.rot)
  assert.ok(near(big.spec!.bx - big.spec!.ax, (s.spec!.bx - s.spec!.ax) * 2, 1e-6))
  const tri = recognizeShape(polyline(ring([[0, 100], [30, 0], [160, 100]])))!
  const tri2 = holdShape(tri, [tri.pivot[0] + 10, tri.pivot[1]], [tri.pivot[0] + 20, tri.pivot[1]])
  const [p0, p1] = tri.spec!.vertices!
  const [q0, q1] = tri2.spec!.vertices!
  assert.ok(near(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), 2 * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 1e-6))
  const eq = perfectShape(tri).spec!.vertices!
  const d = (i: number): number => Math.hypot(eq[(i + 1) % 3][0] - eq[i][0], eq[(i + 1) % 3][1] - eq[i][1])
  assert.ok(near(d(0), d(1), 1e-6) && near(d(1), d(2), 1e-6))
})

