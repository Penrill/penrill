import { specToShapeData, type ShapeItemData } from '@penrill/core/shapeConvert'
import { MAX_BASE, MIN_BASE, type ShapeKind } from '@penrill/core/shapes'
import type { ShapeGeometry, Vec2 } from '@penrill/core/types'

/**
 * Exact shapes from typed measurements ("Exact shape" dialog): pick a recipe, type its lengths and
 * angles, get the shape with those numbers. Fields are named the way the shape is lettered on the
 * board (AB, ∠A), so what is typed is what the labels show.
 */

/** One number to type: a length (board units after conversion), an angle in degrees, or a count. */
export interface MeasureField {
  id: string
  type: 'len' | 'angle' | 'count'
  /** Shown before the input: AB, ∠A, r, h, n. */
  label: string
  /** Default value (lengths in the unit the dialog uses: cm or cells). */
  def: number
}

export interface MeasureRecipe {
  /** The shape it makes (its icon and name in the dialog). */
  kind: ShapeKind
  fields: MeasureField[]
}

const len = (id: string, def: number, label = id): MeasureField => ({ id, type: 'len', label, def })
const angle = (id: string, def: number): MeasureField => ({ id: `∠${id}`, type: 'angle', label: `∠${id}`, def })
const count = (def: number): MeasureField => ({ id: 'n', type: 'count', label: 'n', def })

export const MEASURE_RECIPES = {
  triangleSSS: { kind: 'triangle', fields: [len('AB', 5), len('BC', 4), len('CA', 3)] },
  triangleSAS: { kind: 'triangle', fields: [len('AB', 5), len('CA', 4), angle('A', 60)] },
  triangleASA: { kind: 'triangle', fields: [len('AB', 5), angle('A', 60), angle('B', 50)] },
  rightTriangle: { kind: 'rightTriangle', fields: [len('AB', 3), len('BC', 4)] },
  rectangle: { kind: 'rectangle', fields: [len('AB', 5), len('BC', 3)] },
  rhombus: { kind: 'rhombus', fields: [len('AB', 4), angle('A', 120)] },
  parallelogram: { kind: 'parallelogram', fields: [len('AB', 5), len('AD', 3), angle('A', 120)] },
  trapezoid: { kind: 'trapezoid', fields: [len('AB', 3), len('DC', 6), len('h', 3)] },
  regular: { kind: 'polygon', fields: [count(6), len('AB', 3)] },
  ellipse: { kind: 'ellipse', fields: [len('r', 3)] },
  cube: { kind: 'cube', fields: [len('a', 3)] },
  prism: { kind: 'prism', fields: [count(4), len('a', 3), len('h', 4)] },
  pyramid: { kind: 'pyramid', fields: [count(4), len('a', 4), len('h', 4)] },
  cylinder: { kind: 'cylinder', fields: [len('r', 2), len('h', 4)] },
  cone: { kind: 'cone', fields: [len('r', 2), len('h', 4)] },
  sphere: { kind: 'sphere', fields: [len('r', 3)] }
} satisfies Record<string, MeasureRecipe>

export type MeasureRecipeId = keyof typeof MEASURE_RECIPES

/** Why the numbers make no shape. */
export type MeasureError = 'positive' | 'triangle' | 'angles' | 'angle' | 'trapezoid' | 'count'

export type MeasureResult = { ok: true; data: ShapeItemData; allLengths?: boolean } | { ok: false; error: MeasureError }

const RAD = Math.PI / 180

/** Shape data (centred on 0, 0) for a recipe; `v` maps field ids to values (lengths in board units). */
export function shapeFromMeasurements(id: MeasureRecipeId, v: Record<string, number>): MeasureResult {
  const recipe: MeasureRecipe = MEASURE_RECIPES[id]
  for (const f of recipe.fields) {
    const x = v[f.id]
    if (!Number.isFinite(x) || x <= 0) return { ok: false, error: 'positive' }
    if (f.type === 'angle' && x >= 180) return { ok: false, error: 'angle' }
    if (f.type === 'count' && (!Number.isInteger(x) || x < MIN_BASE || x > MAX_BASE)) return { ok: false, error: 'count' }
  }
  const fail = (error: MeasureError): MeasureResult => ({ ok: false, error })
  const done = (geo: ShapeGeometry, lengths?: string[], angles?: string[]): MeasureResult => ({
    ok: true,
    data: { geo: centred(geo), ...(lengths ? { lengths } : {}), ...(angles ? { angles } : {}) }
  })
  const triangle = (c: number, ax: number, ay: number, lengths: string[], angles?: string[]): MeasureResult =>
    // A at the bottom left, B at the bottom right, C above: AB is e0, BC e1, CA e2.
    done(withVertices('triangle', [[0, 0], [c, 0], [ax, ay]]), lengths, angles)

  switch (id) {
    case 'triangleSSS': {
      const c = v['AB'], a = v['BC'], b = v['CA']
      if (a + b <= c || a + c <= b || b + c <= a) return fail('triangle')
      const x = (b * b + c * c - a * a) / (2 * c)
      return triangle(c, x, -Math.sqrt(Math.max(0, b * b - x * x)), ['e0', 'e1', 'e2'])
    }
    case 'triangleSAS': {
      const c = v['AB'], b = v['CA'], A = v['∠A'] * RAD
      return triangle(c, b * Math.cos(A), -b * Math.sin(A), ['e0', 'e2'], ['v0'])
    }
    case 'triangleASA': {
      const c = v['AB'], A = v['∠A'] * RAD, B = v['∠B'] * RAD
      if (v['∠A'] + v['∠B'] >= 180) return fail('angles')
      const b = (c * Math.sin(B)) / Math.sin(Math.PI - A - B)
      return triangle(c, b * Math.cos(A), -b * Math.sin(A), ['e0'], ['v0', 'v1'])
    }
    case 'rightTriangle':
      // The right angle is at B, bottom left: AB goes up, BC to the right.
      return done(box('rightTriangle', v['BC'], v['AB']), ['e0', 'e1'])
    case 'rectangle':
      return done(box('rectangle', v['AB'], v['BC']), ['e0', 'e1'])
    case 'rhombus': {
      // A is the top corner, its angle opens downwards between the two diagonals' halves.
      const s = v['AB'], half = (v['∠A'] * RAD) / 2
      return done(box('rhombus', 2 * s * Math.sin(half), 2 * s * Math.cos(half)), ['e0'], ['v0'])
    }
    case 'parallelogram': {
      // A top left, B top right, C bottom right, D bottom left; the angle at D is 180° - ∠A.
      const ab = v['AB'], ad = v['AD'], D = (180 - v['∠A']) * RAD
      const shift = ad * Math.cos(D), h = ad * Math.sin(D)
      const w = ab + Math.abs(shift)
      const skew = shift / w
      if (Math.abs(skew) <= 0.75) return done({ ...box('parallelogram', w, h), skew }, ['e0', 'e3'], ['v0'])
      // Too slanted for the parallelogram's own handles: a free four-cornered polygon, same numbers.
      return done(withVertices('polygon', [[shift, 0], [shift + ab, 0], [ab, h], [0, h]]), ['e0', 'e3'], ['v0'])
    }
    case 'trapezoid': {
      // A, B on top, C, D at the bottom: AB is the top base, DC the bottom one, symmetric legs.
      const top = v['AB'], bottom = v['DC']
      if (top >= bottom || top < bottom * 0.05) return fail('trapezoid')
      const inset = (bottom - top) / (2 * bottom)
      return done({ ...box('trapezoid', bottom, v['h']), topLeft: inset, topRight: inset }, ['e0', 'e2'])
    }
    case 'regular': {
      const n = v['n']
      const kind: ShapeKind = n === 5 ? 'pentagon' : n === 6 ? 'hexagon' : 'polygon'
      return done(regularPolygon(kind, n, v['AB']), ['e0'])
    }
    case 'ellipse': {
      const d = 2 * v['r']
      return { ...done(box('ellipse', d, d)), allLengths: true } as MeasureResult
    }
    case 'cube':
      return done(solid('cube', [v['a'], v['a'], v['a']]))
    case 'prism':
    case 'pyramid': {
      // The base is a regular n-gon on the solid's own width and depth: side a = 2R·sin(π/n).
      const n = v['n']
      const d = v['a'] / Math.sin(Math.PI / n)
      return done({ ...solid(id, [d, v['h'], d]), sides: n })
    }
    case 'cylinder':
    case 'cone':
      return done(solid(id, [2 * v['r'], v['h'], 2 * v['r']]))
    case 'sphere':
      return done(solid('sphere', [2 * v['r'], 2 * v['r'], 2 * v['r']]))
  }
  return fail('positive')
}

function box(kind: ShapeKind, w: number, h: number): ShapeGeometry {
  return { kind, ax: 0, ay: 0, bx: w, by: h }
}

function withVertices(kind: ShapeKind, vertices: Vec2[]): ShapeGeometry {
  const xs = vertices.map((p) => p[0])
  const ys = vertices.map((p) => p[1])
  return { kind, ax: Math.min(...xs), ay: Math.min(...ys), bx: Math.max(...xs), by: Math.max(...ys), vertices }
}

/** A solid with these real dimensions [width, height, depth], seen from the usual angle. */
function solid(kind: ShapeKind, dim3: [number, number, number]): ShapeGeometry {
  const { geo } = specToShapeData({ kind, ax: 0, ay: 0, bx: dim3[0], by: dim3[1] })
  return { ...geo, dim3 }
}

/** A regular n-gon with side `side`: its corners sit on the circle its box holds, radius side / 2·sin(π/n). */
function regularPolygon(kind: ShapeKind, n: number, side: number): ShapeGeometry {
  const r = side / (2 * Math.sin(Math.PI / n))
  return { ...box(kind, 2 * r, 2 * r), sides: n }
}

/** The geometry moved so the middle of its box is at 0, 0 (the board places it in the view). */
function centred(geo: ShapeGeometry): ShapeGeometry {
  const cx = (geo.ax + geo.bx) / 2
  const cy = (geo.ay + geo.by) / 2
  return {
    ...geo,
    ax: geo.ax - cx,
    ay: geo.ay - cy,
    bx: geo.bx - cx,
    by: geo.by - cy,
    ...(geo.vertices ? { vertices: geo.vertices.map(([x, y]): Vec2 => [x - cx, y - cy]) } : {})
  }
}
