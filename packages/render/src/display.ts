/**
 * Display lists: what an item looks like, as plain data (lines, polylines, polygons, text, groups).
 * Items build them once (they can be cached per item object); backends turn them into pixels or
 * markup: Canvas 2D on screen and in PNG exports (@penrill/render-canvas), SVG for vector exports
 * (svg below), and later Skia for React Native. One description, so the screen and the exports can't
 * drift apart.
 *
 * Colours are stored as the item has them. The backend maps them when drawing (`ColorMap`), so the
 * same list works on white paper and on the chalkboard, where dark ink is shown light.
 */

/** The paper (or chalkboard) colour under the item, for outlines that keep text readable. */
export const PAPER = '@paper'

export type Align = 'left' | 'center' | 'right'
export type Baseline = 'alphabetic' | 'top' | 'middle'
export type Point2 = [x: number, y: number]

export interface LinePrim {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  color: string
  dash?: number[]
}

/** An open polyline, stroked. */
export interface PolylinePrim {
  kind: 'polyline'
  pts: Point2[]
  width: number
  color: string
  join?: 'round'
  dash?: number[]
}

/** A closed polygon, filled. */
export interface PolygonPrim {
  kind: 'polygon'
  pts: Point2[]
  color: string
  opacity?: number
}

/** A circle, filled and/or stroked. */
export interface CirclePrim {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  fill?: string
  stroke?: string
  width?: number
  opacity?: number
}

export interface TextPrim {
  kind: 'text'
  s: string
  x: number
  y: number
  size: number
  family: string
  italic?: boolean
  align?: Align
  baseline?: Baseline
  /** Fill colour; without it the text takes the fill of its group. */
  color?: string
  /** Draw an outline of this colour and width instead of filling (a halo under other text). */
  halo?: { color: string; width: number }
}

/** Shared drawing state for its children (as an SVG <g>). */
export interface GroupPrim {
  kind: 'group'
  fill?: string
  cap?: 'round'
  join?: 'round'
  opacity?: number
  children: Prim[]
}

export type Prim = LinePrim | PolylinePrim | PolygonPrim | CirclePrim | TextPrim | GroupPrim

/** Turns an item's colour into the one to draw on the current surface. */
export type ColorMap = (color: string) => string

// ------------------------------------------------------------------ SVG

/** Numbers in SVG output: at most two decimals. */
export const r2 = (v: number): string => (Math.round(v * 100) / 100).toString()
export const escapeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const pathData = (pts: readonly Point2[]): string => `M${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L')}`
const ANCHOR: Record<Align, string> = { left: 'start', center: 'middle', right: 'end' }
const BASELINE: Record<Baseline, string> = { alphabetic: 'alphabetic', top: 'hanging', middle: 'central' }

/** The display list as SVG markup (for SVG and PDF exports). */
export function toSvg(p: Prim, color: ColorMap): string {
  const c = (v: string): string => escapeXml(color(v))
  const dashAttr = (d?: number[]): string => (d?.length ? ` stroke-dasharray="${d.map(r2).join(' ')}"` : '')
  switch (p.kind) {
    case 'group': {
      const attrs =
        (p.fill ? ` fill="${c(p.fill)}"` : '') +
        (p.cap ? ` stroke-linecap="${p.cap}"` : '') +
        (p.join ? ` stroke-linejoin="${p.join}"` : '') +
        (p.opacity !== undefined && p.opacity !== 1 ? ` opacity="${r2(p.opacity)}"` : '')
      return `<g${attrs}>${p.children.map((ch) => toSvg(ch, color)).join('')}</g>`
    }
    case 'line':
      return `<line x1="${r2(p.x1)}" y1="${r2(p.y1)}" x2="${r2(p.x2)}" y2="${r2(p.y2)}" stroke="${c(p.color)}" stroke-width="${r2(p.width)}"${dashAttr(p.dash)}/>`
    case 'polygon':
      return `<path d="${pathData(p.pts)}Z" fill="${c(p.color)}"${p.opacity !== undefined && p.opacity !== 1 ? ` fill-opacity="${r2(p.opacity)}"` : ''}/>`
    case 'polyline':
      return `<path d="${pathData(p.pts)}" fill="none" stroke="${c(p.color)}" stroke-width="${r2(p.width)}"${p.join ? ` stroke-linejoin="${p.join}"` : ''}${dashAttr(p.dash)}/>`
    case 'circle': {
      const fill = p.fill ? c(p.fill) : 'none'
      const stroke = p.stroke ? ` stroke="${c(p.stroke)}" stroke-width="${r2(p.width ?? 1)}"` : ''
      const opacity = p.opacity !== undefined && p.opacity !== 1 ? ` opacity="${r2(p.opacity)}"` : ''
      return `<circle cx="${r2(p.cx)}" cy="${r2(p.cy)}" r="${r2(p.r)}" fill="${fill}"${stroke}${opacity}/>`
    }
    case 'text': {
      // Only non-default alignment is written: start / alphabetic are what SVG assumes.
      const align = p.align && p.align !== 'left' ? ` text-anchor="${ANCHOR[p.align]}"` : ''
      const base = p.baseline && p.baseline !== 'alphabetic' ? ` dominant-baseline="${BASELINE[p.baseline]}"` : ''
      const paint = p.halo
        ? ` fill="none" stroke="${c(p.halo.color)}" stroke-width="${r2(p.halo.width)}" stroke-linejoin="round"`
        : p.color
          ? ` fill="${c(p.color)}"`
          : ''
      return `<text x="${r2(p.x)}" y="${r2(p.y)}" font-size="${r2(p.size)}" font-family='${p.family}'${p.italic ? ' font-style="italic"' : ''}${align}${base}${paint}>${escapeXml(p.s)}</text>`
    }
  }
}
