// Special points of plotted functions (extrema, zeros, crossings) and transformations of graphs. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_FORMULA, typeChar, type Row } from '@penrill/math/formula'
import { parseRows, rowsToText, transformRows, type FnTransform } from '../src/board/engine/formulaexpr.ts'
import { graphPrims, sanitizeGraph } from '../src/board/engine/graph.ts'
import { findExtrema, findRoots, graphPoints, pointLabel } from '../src/board/engine/graphPoints.ts'
import { deserializeBoard, serializeBoard } from '../src/board/engine/serialize.ts'
import type { GraphItem, GraphPoints, PlotFn } from '@penrill/core/types'

/** A formula as typed on the keyboard (a space leaves an exponent). */
const rows = (s: string): Row => [...s].reduce(typeChar, EMPTY_FORMULA).rows
const fn = (s: string, color = '#e03131'): PlotFn => ({ expr: rowsToText(rows(s)), rows: rows(s), color })
const plane = (fns: PlotFn[], points: GraphPoints, box = 10): GraphItem => ({
  ...sanitizeGraph({ kind: 'plane', xMin: -box, xMax: box, yMin: -box, yMax: box, unit: 24, labelStep: 1, grid: false, fns, points }),
  type: 'graph', id: 'g', z: 1, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
})
const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const coords = (g: GraphItem, kind: string): [number, number][] =>
  graphPoints(g).filter((p) => p.kind === kind).map((p) => [p.x, p.y] as [number, number]).sort((a, b) => a[0] - b[0])

test('zeros: sign changes, touching zeros, no poles', () => {
  const r = findRoots((x) => x * x - 4, -10, 10)
  assert.equal(r.length, 2)
  near(r[0], -2)
  near(r[1], 2)
  // x² only touches the axis.
  const t = findRoots((x) => (x - 0.3) * (x - 0.3), -5, 5)
  assert.equal(t.length, 1)
  near(t[0], 0.3, 1e-5)
  // 1/x and tan x change sign across poles, which are no zeros.
  assert.deepEqual(findRoots((x) => 1 / x, -5, 5), [])
  const tan = findRoots(Math.tan, -3, 3)
  assert.equal(tan.length, 1)
  near(tan[0], 0)
  // y = 0 itself has no points to mark.
  assert.deepEqual(findRoots(() => 0, -5, 5), [])
})

test('extrema: maxima and minima inside the range, none at jumps or on lines', () => {
  const e = findExtrema((x) => x ** 3 - 3 * x, -3, 3)
  assert.deepEqual(e.map((p) => p.kind), ['max', 'min'])
  near(e[0].x, -1, 1e-5)
  near(e[0].y, 2)
  near(e[1].x, 1, 1e-5)
  near(e[1].y, -2)
  assert.deepEqual(findExtrema((x) => 1 / x, -5, 5), [])
  assert.deepEqual(findExtrema((x) => 2 * x + 1, -5, 5), [])
  assert.deepEqual(findExtrema(() => 3, -5, 5), [])
  const abs = findExtrema(Math.abs, -5, 5)
  assert.equal(abs.length, 1)
  near(abs[0].x, 0, 1e-6)
  assert.equal(findExtrema(Math.sin, -5, 5).length, 4)
})

test('the plane marks only the kinds switched on, within its window', () => {
  const g = plane([fn('x^2 -4')], { extrema: true, roots: true })
  const mins = coords(g, 'min')
  assert.equal(mins.length, 1)
  near(mins[0][0], 0, 1e-5)
  near(mins[0][1], -4)
  assert.equal(coords(g, 'root').length, 2)
  assert.equal(graphPoints(plane([fn('x^2 -4')], { roots: true })).filter((p) => p.kind === 'min').length, 0)
  // Off-screen points are not marked.
  assert.equal(graphPoints(plane([fn('x^2 -40')], { extrema: true })).length, 0)
  assert.equal(graphPoints(plane([fn('x^2 -4')], {})).length, 0)
})

test('crossings of two functions and of a function with an equation', () => {
  const g = plane([fn('x^2 '), fn('x+2', '#1971c2')], { cross: true })
  const c = coords(g, 'cross')
  assert.equal(c.length, 2)
  near(c[0][0], -1)
  near(c[0][1], 1)
  near(c[1][0], 2)
  near(c[1][1], 4)
  const circle = plane([fn('x^2 +y^2 =4'), fn('x', '#1971c2')], { cross: true }, 5)
  const k = coords(circle, 'cross')
  assert.equal(k.length, 2)
  near(k[1][0], Math.SQRT2, 1e-3)
  near(k[1][1], Math.SQRT2, 1e-3)
  // The circle meets the axis where x² − 4 = 0.
  assert.equal(coords(plane([fn('x^2 +y^2 =4')], { roots: true }, 5), 'root').length, 2)
})

test('points are drawn as dots with their coordinates', () => {
  const p = graphPrims(plane([fn('x^2 -4')], { extrema: true, roots: true, comma: true }))
  assert.equal(p.dots.length, 3)
  const labels = p.texts.filter((t) => t.halo).map((t) => t.s)
  assert.ok(labels.includes('(0; −4)'))
  assert.ok(labels.includes('(2; 0)'))
  assert.equal(pointLabel(1.4142, -0.5, false), '(1.41, −0.5)')
  assert.equal(pointLabel(1.4142, -0.5, true), '(1,41; −0,5)')
})

test('switched-on points survive saving and need format 13', () => {
  const g = plane([fn('x^2 -4')], { roots: true })
  const file = serializeBoard({ items: [g], background: 'dots', camera: { x: 0, y: 0, zoom: 1 } })
  assert.equal(file.version, 13)
  const back = deserializeBoard(file).items[0] as GraphItem
  assert.deepEqual(back.points, { roots: true })
  assert.equal(sanitizeGraph({ ...g, points: { roots: 1, junk: true } as unknown as GraphPoints }).points, undefined)
})

test('transformations rewrite the formula', () => {
  const val = (r: Row | null, x: number, y?: number): number => {
    assert.ok(r)
    const p = parseRows(r)
    assert.ok(p.ok, JSON.stringify(r))
    return p.ok ? p.fn(x, y) : NaN
  }
  const f = rows('x^2 +3x')
  const F = (x: number): number => x * x + 3 * x
  const tf = (t: FnTransform): Row | null => transformRows(f, 'x', t)
  for (const x of [-2, 0.5, 3]) {
    near(val(tf({ k: 'flipX' }), x), -F(x))
    near(val(tf({ k: 'flipY' }), x), F(-x))
    near(val(tf({ k: 'origin' }), x), -F(-x))
    near(val(tf({ k: 'shift', a: 2, b: -1 }), x), F(x - 2) - 1)
    near(val(tf({ k: 'scaleY', by: 3 }), x), 3 * F(x))
    near(val(tf({ k: 'scaleX', by: 0.5 }), x), F(0.5 * x))
    near(val(tf({ k: 'abs' }), x), Math.abs(F(x)))
    near(val(tf({ k: 'absX' }), x), F(Math.abs(x)))
  }
  // Symmetry about y = x is the equation x = f(y).
  const sw = tf({ k: 'swap' })
  near(val(sw, 4, 1), 0)
  // Written as a teacher would.
  assert.equal(rowsToText(tf({ k: 'flipX' })!), '-(x^2+3*x)')
  assert.equal(rowsToText(tf({ k: 'flipY' })!), '(-x)^2+3*(-x)')
  assert.equal(rowsToText(transformRows(rows('x'), 'x', { k: 'shift', a: 1, b: 2 })!), 'x-1+2')
  assert.equal(rowsToText(transformRows(rows('-x^2 '), 'x', { k: 'flipX' })!), 'x^2')
  // Equations change both sides; |f| of an equation has no meaning here.
  const circle = rows('x^2 +y^2 =4')
  const moved = transformRows(circle, 'x', { k: 'shift', a: 1, b: 2 })
  near(val(moved, 1, 4), 0)
  assert.equal(transformRows(circle, 'x', { k: 'abs' }), null)
  assert.equal(transformRows(f, 'x', { k: 'scaleY', by: 0 }), null)
})
