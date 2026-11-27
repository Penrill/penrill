// .inkboard file format round-trips (engine/serialize.ts). Run: npm test
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { test } from 'node:test'
import { decodeBoard, deserializeBoard, encodeBoard, FORMAT_VERSION, serializeBoard, type BoardFile } from '../src/board/engine/serialize.ts'
import { EMPTY_FORMULA, typeChar } from '@penrill/math/formula'
import { rowsToText } from '../src/board/engine/formulaexpr.ts'
import type { FormulaItem, GraphItem } from '@penrill/core/types'
import { createShapeItem } from '@penrill/core/shapeConvert'
import { buildShapeItems, editableShape } from '@penrill/core/shapeItems'
import type { ShapeItem, ShapeSpec, StrokeItem } from '@penrill/core/types'

const plane = {
  type: 'graph' as const, id: 'g1', z: 1, ox: 240, oy: 240, color: '#1e1e1e',
  kind: 'plane' as const, xMin: -10, xMax: 10, yMin: -10, yMax: 10, unit: 24, labelStep: 1, grid: false
}

test('the format version is 15; a board is stamped with the lowest version that can show it', () => {
  assert.equal(FORMAT_VERSION, 15)
  // Nothing from version 7 on the board: apps that only know version 6 can still open it.
  const f = serializeBoard({ items: [{ ...plane, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(f.version, 6)
})

test('first-class 2D and 3D ShapeItem round-trips at v12 with top-level sync-friendly fields and prunes malformed entries', () => {
  const rhombus = createShapeItem(
    {
      geo: { kind: 'rhombus', ax: 10, ay: 20, bx: 150, by: 140, rot: 0.25 },
      labels: { v0: 'A', v1: 'B', v2: 'C', v3: 'D' },
      angles: ['v0', 'v1'],
      lengths: ['e0', 'diag:v0-v2'],
      constructions: [
        { id: 'diag:v0-v2', kind: 'diagonal', from: 'v0', to: 'v2' },
        { id: 'incircle', kind: 'incircle' },
        { id: 'mid:e0', kind: 'midpoint', edge: 'e0' }
      ]
    },
    { color: '#1971c2', size: 3, tool: 'pen', dash: 'dashed' },
    { id: 'sh-rhomb', z: 1 }
  )
  const pyramid = createShapeItem(
    {
      geo: { kind: 'pyramid', ax: 200, ay: 40, bx: 360, by: 200, sides: 4, dim3: [120, 140, 120], orbit: [-0.45, 0.35], slant3: [0.3, -0.1] },
      labels: { apex: 'S', b0: 'A' },
      lengths: ['eb0', 'alt:apex'],
      constructions: [
        { id: 'alt:apex', kind: 'altitude', from: 'apex' },
        { id: 'apo:eb0', kind: 'apothem', edge: 'eb0' }
      ]
    },
    { color: '#1e1e1e', size: 2, tool: 'pen' },
    { id: 'sh-pyr', z: 2 }
  )
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [rhombus, pyramid], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(file.version, 12)
  assert.equal(file.items[0].type, 'shape')
  assert.equal(file.items[1].type, 'shape')

  const [backR, backP] = deserializeBoard(file).items as ShapeItem[]
  assert.equal(backR.type, 'shape')
  assert.deepEqual(backR.geo, rhombus.geo)
  assert.deepEqual(backR.labels, rhombus.labels)
  assert.deepEqual(backR.angles, rhombus.angles)
  assert.deepEqual(backR.lengths, rhombus.lengths)
  assert.deepEqual(backR.constructions, rhombus.constructions)
  assert.equal(backR.dash, 'dashed')
  assert.ok(backR.bbox.maxX > backR.bbox.minX)

  assert.equal(backP.type, 'shape')
  assert.deepEqual(backP.geo, pyramid.geo)
  assert.deepEqual(backP.constructions, pyramid.constructions)
  assert.deepEqual(backP.labels, pyramid.labels)

  // Malformed constructions and labels are dropped cleanly without dropping the shape itself.
  const broken = JSON.parse(JSON.stringify(file)) as BoardFile
  Object.assign(broken.items[0], {
    constructions: [{ id: 'bad1', kind: 'altitude' }, { id: 'ok', kind: 'center' }],
    labels: { v0: 'A', bad: 'waytoolonglabeltext' }
  })
  const cleaned = deserializeBoard(broken).items[0] as ShapeItem
  assert.deepEqual(cleaned.constructions, [{ id: 'ok', kind: 'center' }])
  assert.deepEqual(cleaned.labels, { v0: 'A' })
})

test('v12 shape editor features round-trip cleanly and ignore malformed fields', () => {
  const specs: ShapeSpec[] = [
    {
      kind: 'triangle',
      ax: 0,
      ay: 0,
      bx: 150,
      by: 90,
      vertices: [[120, 0], [150, 90], [0, 90]],
      incircle: true,
      altitudeAt: [0],
      medianAt: [1],
      bisectorAt: [2],
      angleAt: [0, 2],
      lengthAt: [1]
    },
    { kind: 'polygon', ax: 0, ay: 0, bx: 100, by: 100, base: 5, vertices: [[50, 0], [100, 40], [80, 100], [20, 100], [0, 40]], angleAt: [0], lengthAt: [0, 1] },
    { kind: 'parallelogram', ax: 0, ay: 0, bx: 120, by: 80, skew: -0.3, rot: 0.5 },
    { kind: 'trapezoid', ax: 0, ay: 0, bx: 120, by: 80, topLeft: 0, topRight: 0.35 },
    { kind: 'star', ax: 0, ay: 0, bx: 100, by: 100, base: 7, innerRatio: 0.5 },
    { kind: 'pyramid', ax: 0, ay: 0, bx: 160, by: 120, base: 5, apex: [0.85, -0.1], depth: 0.22 }
  ]
  for (const spec of specs) {
    const items = buildShapeItems(spec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `v12-${i}`, z: i }))
    const file = JSON.parse(JSON.stringify(serializeBoard({ items, background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
    assert.equal(file.version, 12, spec.kind)
    const back = deserializeBoard(file).items as StrokeItem[]
    assert.deepEqual(editableShape(back)?.spec, spec)
  }
  const bad = serializeBoard({
    items: buildShapeItems({ kind: 'rectangle', ax: 0, ay: 0, bx: 50, by: 50 }, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `b${i}`, z: i })),
    background: 'dots',
    camera: { x: 0, y: 0, zoom: 1 }
  })
  Object.assign((bad.items[0] as StrokeItem).shape!, { skew: 99, vertices: [[1, 2]], apex: ['bad'], depth: -5, altitudeAt: [99, 'x'], angleAt: [-1], lengthAt: 'no' })
  assert.deepEqual(editableShape(deserializeBoard(bad).items)?.spec, { kind: 'rectangle', ax: 0, ay: 0, bx: 50, by: 50 })
})

test('triangle circles and oblique pyramids save as version 11 and retain editable geometry', () => {
  const specs: ShapeSpec[] = [
    { kind: 'triangle', ax: 10, ay: 20, bx: 160, by: 120, incircle: true, circumcircle: true },
    { kind: 'rightTriangle', ax: 10, ay: 20, bx: 160, by: 120, circumcircle: true },
    { kind: 'obliquePyramid', ax: 10, ay: 20, bx: 160, by: 120, base: 24 }
  ]
  for (const spec of specs) {
    const items = buildShapeItems(spec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `s${i}`, z: i }))
    const file = JSON.parse(JSON.stringify(serializeBoard({ items, background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
    assert.equal(file.version, 11)
    const back = deserializeBoard(file).items as StrokeItem[]
    assert.deepEqual(editableShape(back)?.spec, spec)
    assert.deepEqual(back.map((p) => p.dash), items.map((p) => p.dash))
    assert.deepEqual(back.map((p) => p.groupId), items.map((p) => p.groupId))
  }
})

test('older triangle specs still load and invalid circle options are ignored', () => {
  const spec: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 100, by: 100 }
  const items = buildShapeItems(spec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `s${i}`, z: i }))
  const file = serializeBoard({ items, background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(file.version, 6)
  for (let version = 4; version <= 10; version++) assert.deepEqual(editableShape(deserializeBoard({ ...file, version }).items)?.spec, spec)
  const malformed = JSON.parse(JSON.stringify(file)) as BoardFile
  Object.assign((malformed.items[0] as StrokeItem).shape!, { incircle: 'yes', circumcircle: 1 })
  assert.deepEqual(editableShape(deserializeBoard(malformed).items)?.spec, spec)
})

test('a formula survives save and load and makes the file version 7', () => {
  const rows = [...'x^2/3'].reduce(typeChar, EMPTY_FORMULA).rows
  const item: FormulaItem = { type: 'formula', id: 'f1', z: 2, x: 10, y: 20, size: 32, color: '#e03131', rows, locked: true, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [item], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(file.version, 7)
  const back = deserializeBoard(file).items[0] as FormulaItem
  assert.equal(back.type, 'formula')
  assert.deepEqual(back.rows, rows)
  assert.equal(back.color, '#e03131')
  assert.equal(back.locked, true)
  assert.ok(back.bbox.minX === 10 && back.bbox.minY === 20 && back.bbox.maxX > 10 && back.bbox.maxY > 20)
})

test('a broken formula is dropped, the rest of the board loads', () => {
  const bad = { type: 'formula', id: 'f1', z: 2, x: 0, y: 0, size: 32, color: '#000', rows: [{ t: 'frac', n: 'oops' }] }
  const file = { format: 'inkboard', version: 7, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [bad, plane] } as unknown as BoardFile
  const items = deserializeBoard(file).items
  assert.equal(items.length, 1)
  assert.equal(items[0].type, 'graph')
})

test('a plotted function keeps its keypad formula; stale rows are dropped', () => {
  const rows = [...'x^2 +1'].reduce(typeChar, EMPTY_FORMULA).rows
  const fn = { expr: rowsToText(rows), color: '#e03131', rows }
  const g: GraphItem = { ...plane, fns: [fn], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  // Plots alone don't need a newer reader: older versions use the text.
  assert.equal(file.version, 6)
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [fn])
  // An older version edited the text and left the rows behind: the text wins.
  ;(file.items[0] as unknown as GraphItem).fns![0].expr = 'x^3'
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [{ expr: 'x^3', color: '#e03131' }])
})

test('a chalkboard background is saved as version 8 and reads back', () => {
  const f = JSON.parse(JSON.stringify(serializeBoard({ items: [], background: 'chalk-grid', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(f.version, 8)
  assert.equal(deserializeBoard(f).background, 'chalk-grid')
  assert.equal(deserializeBoard({ ...f, version: 7 }).background, 'chalk-grid')
})

test('a chalkboard with a formula preserves both the surface and the formula', () => {
  const rows = [...'x^2'].reduce(typeChar, EMPTY_FORMULA).rows
  const formula: FormulaItem = { type: 'formula', id: 'f1', z: 1, x: 10, y: 20, size: 32, color: '#1e1e1e', rows, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = serializeBoard({ items: [formula], background: 'chalk-grid', camera: { x: 0, y: 0, zoom: 1 } })
  const board = deserializeBoard(file)
  assert.equal(file.version, 8)
  assert.equal(board.background, 'chalk-grid')
  assert.deepEqual((board.items[0] as FormulaItem).rows, rows)
  assert.equal((board.items[0] as FormulaItem).color, formula.color)
})

test('unknown or missing backgrounds fall back to dots', () => {
  const base = { format: 'inkboard', version: 6, camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [] }
  assert.equal(deserializeBoard({ ...base, background: 'marble' } as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard({ ...base, background: 'chalk-marble' } as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard(base as unknown as BoardFile).background, 'dots')
  assert.equal(deserializeBoard({ ...base, background: 'lines' } as unknown as BoardFile).background, 'lines')
})

test('a plane with functions survives save and load', () => {
  const g: GraphItem = { ...plane, hideFormulas: true, fns: [{ expr: 'x^2', color: '#e03131' }, { expr: 'sin(x)', color: '#1971c2' }], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  const back = deserializeBoard(file).items[0] as GraphItem
  assert.equal(back.type, 'graph')
  assert.deepEqual(back.fns, g.fns)
  assert.equal(back.hideFormulas, true)
  assert.equal(back.ox, 240)
  assert.ok(back.bbox.maxX > back.bbox.minX)
})

test('version 5 files (no functions) still load', () => {
  const file = { format: 'inkboard', version: 5, background: 'grid', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [plane] } as unknown as BoardFile
  const items = deserializeBoard(file).items
  assert.equal(items.length, 1)
  assert.equal((items[0] as GraphItem).fns, undefined)
})

test('malformed functions are dropped without losing the plane', () => {
  const file = {
    format: 'inkboard', version: 6, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {},
    items: [{ ...plane, fns: 'nope' }, { ...plane, id: 'g2', fns: [{ expr: 42 }, { expr: 'x', color: 'red;' }] }]
  } as unknown as BoardFile
  const items = deserializeBoard(file).items as GraphItem[]
  assert.equal(items.length, 2)
  assert.equal(items[0].fns, undefined)
  assert.equal(items[1].fns!.length, 1)
  assert.equal(items[1].fns![0].expr, 'x')
  assert.match(items[1].fns![0].color, /^#/)
})

test('files from a newer version are refused', () => {
  assert.throws(() => deserializeBoard({ format: 'inkboard', version: FORMAT_VERSION + 1, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [] }))
})

test('encodeBoard writes plain UTF-8 JSON and decodeBoard accepts both plain JSON and legacy gzip', async () => {
  const g: GraphItem = { ...plane, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const bytes = await encodeBoard({ items: [g], background: 'grid', camera: { x: 10, y: 20, zoom: 1.5 } })
  // Not gzipped (starts with '{', not 0x1f 0x8b).
  assert.equal(bytes[0], '{'.charCodeAt(0))
  const fromPlain = await decodeBoard(bytes)
  assert.equal(fromPlain.background, 'grid')
  assert.equal(fromPlain.items.length, 1)

  // Legacy gzipped .inkboard files still decode cleanly.
  const gzipped = new Uint8Array(gzipSync(Buffer.from(bytes)))
  assert.equal(gzipped[0], 0x1f)
  assert.equal(gzipped[1], 0x8b)
  const fromGzip = await decodeBoard(gzipped)
  assert.equal(fromGzip.background, 'grid')
  assert.equal(fromGzip.items.length, 1)
})

test('a function drawn on a range keeps its range, name and variable, and needs version 7', () => {
  const rows = [...'3t+1'].reduce(typeChar, EMPTY_FORMULA).rows
  const fn = { expr: rowsToText(rows, 't'), color: '#e03131', rows, name: 's', arg: 't', from: 3, to: 7 }
  const g: GraphItem = { ...plane, fns: [fn], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }))) as BoardFile
  assert.equal(file.version, 7)
  assert.deepEqual((deserializeBoard(file).items[0] as GraphItem).fns, [fn])
  // Name and variable alone change only how it is labelled: older versions may still open it.
  const named: GraphItem = { ...g, fns: [{ ...fn, from: undefined, to: undefined }] }
  delete named.fns![0].from
  delete named.fns![0].to
  assert.equal(serializeBoard({ items: [named], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } }).version, 6)
  // A reversed range is put right; a variable without its keypad formula, or a bad name, is dropped.
  const bad = { ...plane, fns: [{ expr: 'x', color: '#e03131', from: 5, to: -2, arg: 't', name: 'xy' }] }
  const f2 = { format: 'inkboard', version: 7, background: 'dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {}, items: [bad] } as unknown as BoardFile
  assert.deepEqual((deserializeBoard(f2).items[0] as GraphItem).fns, [{ expr: 'x', color: '#e03131', from: -2, to: 5 }])
})

test('ink drawn white before white was removed loads as black; other colours are untouched', () => {
  const file: BoardFile = {
    format: 'inkboard', version: 8, background: 'chalk-dots', camera: { x: 0, y: 0, zoom: 1 }, assets: {},
    items: [
      { type: 'stroke', id: 'w', z: 1, tool: 'pen', color: '#FFFFFF', size: 3, pressure: false, pts: [0, 0, 0.5, 10, 10, 0.5] },
      { type: 'stroke', id: 'r', z: 2, tool: 'pen', color: '#e03131', size: 3, pressure: false, pts: [0, 0, 0.5, 10, 10, 0.5] }
    ]
  }
  const { items } = deserializeBoard(file)
  assert.equal(items[0].type === 'stroke' && items[0].color, '#1e1e1e')
  assert.equal(items[1].type === 'stroke' && items[1].color, '#e03131')
})

test('school paper patterns need version 9 and read back, on paper and on the chalkboard', () => {
  const cam = { x: 0, y: 0, zoom: 1 }
  for (const bg of ['math', 'hand', 'slant', 'chalk-slant'] as const) {
    const f = serializeBoard({ items: [], background: bg, camera: cam })
    assert.equal(f.version, 9)
    assert.equal(deserializeBoard(f).background, bg)
  }
  assert.equal(serializeBoard({ items: [], background: 'grid', camera: cam }).version, 6)
})

test('turned images, texts and formulas need version 10 and keep their turn', () => {
  const cam = { x: 0, y: 0, zoom: 1 }
  const img = { type: 'image' as const, id: 'i1', z: 1, src: 'data:image/png;base64,AA', x: 0, y: 0, w: 100, h: 50, rot: Math.PI / 2, bbox: { minX: 25, minY: -25, maxX: 75, maxY: 75 } }
  const text = { type: 'text' as const, id: 't1', z: 2, x: 0, y: 200, text: 'Hi', size: 20, color: '#1e1e1e', rot: -0.3, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const f = serializeBoard({ items: [img, text], background: 'dots', camera: cam })
  assert.equal(f.version, 10)
  // Text is laid out with a canvas when read, so only the image is read back here.
  assert.equal((f.items[1] as { rot?: number }).rot, -0.3)
  const back = deserializeBoard({ ...f, items: [f.items[0]] }).items
  assert.equal(back[0].type === 'image' && back[0].rot, Math.PI / 2)
  // A quarter turn swaps the bounds' width and height around the same centre.
  const b = back[0].bbox
  assert.ok(Math.abs(b.minX - 25) < 1e-9 && Math.abs(b.maxX - 75) < 1e-9 && Math.abs(b.minY + 25) < 1e-9 && Math.abs(b.maxY - 75) < 1e-9)
  // Not turned: no `rot` written, and the board stays readable by older versions.
  const plain = serializeBoard({ items: [{ ...img, rot: undefined, bbox: { minX: 0, minY: 0, maxX: 100, maxY: 50 } }], background: 'dots', camera: cam })
  assert.equal(plain.version, 6)
  assert.equal('rot' in plain.items[0], false)
})

test('3D ShapeItem quaternion rot3 round-trips cleanly, normalizes drift and drops malformed values', () => {
  const cam = { x: 0, y: 0, zoom: 1 }
  const q = [0.5, 0.5, 0.5, 0.5] as [number, number, number, number]
  const cube = createShapeItem(
    { geo: { kind: 'cube', ax: 0, ay: 0, bx: 120, by: 120, dim3: [90, 90, 90], rot3: q } },
    { color: '#1e1e1e', size: 2, tool: 'pen' },
    { id: 'c-rot3', z: 1 }
  )
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [cube], background: 'dots', camera: cam }))) as BoardFile
  assert.equal(file.version, 12)
  const back = deserializeBoard(file).items[0] as ShapeItem
  assert.ok(back.geo.rot3)
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(back.geo.rot3![i] - q[i]) < 1e-4)

  // Unnormalized quaternion gets normalized; zero/bad quaternion is dropped safely.
  const driftFile = JSON.parse(JSON.stringify(file)) as BoardFile
  ;(driftFile.items[0] as unknown as { geo: { rot3: unknown } }).geo.rot3 = [0, 0, 2, 0]
  const normBack = deserializeBoard(driftFile).items[0] as ShapeItem
  assert.deepEqual(normBack.geo.rot3, [0, 0, 1, 0])

  const badFile = JSON.parse(JSON.stringify(file)) as BoardFile
  ;(badFile.items[0] as unknown as { geo: { rot3: unknown } }).geo.rot3 = [0, 0, 0, 0]
  const badBack = deserializeBoard(badFile).items[0] as ShapeItem
  assert.equal(badBack.geo.rot3, undefined)
})

test('3D ShapeItem free vertices3 map round-trips cleanly and drops malformed entries', () => {
  const cam = { x: 0, y: 0, zoom: 1 }
  const verts3: Record<string, [number, number, number]> = {
    b0: [-45.125, -45, 45],
    b1: [45, -45, 45],
    b2: [45, -45, -45],
    b3: [-45, -45, -45],
    t0: [-55, 62.5, 45],
    t1: [45, 45, 45],
    t2: [45, 45, -45],
    t3: [-45, 45, -45]
  }
  const cube = createShapeItem(
    { geo: { kind: 'cube', ax: 0, ay: 0, bx: 120, by: 120, dim3: [90, 90, 90], vertices3: verts3 } },
    { color: '#1e1e1e', size: 2, tool: 'pen' },
    { id: 'c-v3', z: 1 }
  )
  const file = JSON.parse(JSON.stringify(serializeBoard({ items: [cube], background: 'dots', camera: cam }))) as BoardFile
  assert.equal(file.version, 12)
  const back = deserializeBoard(file).items[0] as ShapeItem
  assert.ok(back.geo.vertices3)
  assert.deepEqual(back.geo.vertices3!.t0, [-55, 62.5, 45])
  assert.equal(back.geo.vertices3!.b0[0], -45.12)

  const badFile = JSON.parse(JSON.stringify(file)) as BoardFile
  ;(badFile.items[0] as unknown as { geo: { vertices3: unknown } }).geo.vertices3 = { b0: [1, 2, 'bad'] }
  const badBack = deserializeBoard(badFile).items[0] as ShapeItem
  assert.equal(badBack.geo.vertices3, undefined)
})

test('a filled shape keeps its fill and outline colours, needs version 15; bad fills are dropped', () => {
  const sq = createShapeItem(
    { geo: { kind: 'rectangle', ax: 0, ay: 0, bx: 100, by: 80 } },
    { color: '#e03131', size: 3, tool: 'pen' },
    { id: 'sq', z: 1 }
  )
  const filled: ShapeItem = { ...sq, fill: '#ffe066' }
  const cam = { x: 0, y: 0, zoom: 1 }
  const f = serializeBoard({ items: [filled], background: 'dots', camera: cam })
  assert.equal(f.version, 15)
  const back = deserializeBoard(JSON.parse(JSON.stringify(f))).items[0] as ShapeItem
  assert.equal(back.fill, '#ffe066')
  assert.equal(back.color, '#e03131')
  // Not filled: no fill field, and the board can still be opened by apps that know version 12.
  const plain = serializeBoard({ items: [sq], background: 'dots', camera: cam })
  assert.equal(plain.version, 12)
  assert.equal((deserializeBoard(plain).items[0] as ShapeItem).fill, undefined)
  const bad = JSON.parse(JSON.stringify(f)) as BoardFile
  ;(bad.items[0] as { fill?: unknown }).fill = 'url(javascript:x)'
  assert.equal((deserializeBoard(bad).items[0] as ShapeItem).fill, undefined)
})
