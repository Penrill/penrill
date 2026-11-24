import { turnPoint } from '@penrill/core/geometry'
import { isLinear, shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import type { ShapeSpec, Vec2 } from '@penrill/core/types'
import { PAPER, type Point2, type Prim } from '@penrill/render/display'

/** Board units per paper cell (matches compass) and per cm (2 cells, matches ruler). */
export const CELL_UNIT = 24
export const CM_UNIT = 48

export interface ShapeAnnotationFormat {
  unit: 'cm' | 'cells'
  /** Short localized unit suffix (e.g. 'cm', 'см', 'cl.', 'кл.'). */
  unitLabel: string
  comma: boolean
}

/** Format a world-space length into cm or paper cells with at most 1 decimal place. */
export function formatShapeLength(worldLen: number, fmt: ShapeAnnotationFormat): string {
  const divisor = fmt.unit === 'cells' ? CELL_UNIT : CM_UNIT
  const val = Math.round((worldLen / divisor) * 10) / 10
  const raw = Number.isInteger(val) ? String(val) : val.toFixed(1)
  const num = fmt.comma ? raw.replace('.', ',') : raw
  return fmt.unitLabel ? `${num} ${fmt.unitLabel}` : num
}

function signedArea2(verts: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum
}

function labeledText(x: number, y: number, s: string, size: number, color: string): Prim[] {
  const family = 'system-ui, -apple-system, sans-serif'
  return [
    { kind: 'text', s, x, y, size, family, align: 'center', baseline: 'middle', halo: { color: PAPER, width: Math.max(3, size * 0.28) } },
    { kind: 'text', s, x, y, size, family, align: 'center', baseline: 'middle', color }
  ]
}

/**
 * Pure vector display list (`@penrill/render/display`) for shape angle arcs, 90 deg marks and
 * length / dimension labels. Drawn identically on Canvas, PNG, SVG and PDF.
 */
export function shapeAnnotationsDisplay(
  spec: ShapeSpec,
  color: string,
  strokeSize: number,
  fmt: ShapeAnnotationFormat
): Prim | null {
  const wantAngles = Boolean(spec.angleAt?.length)
  const wantLengths = Boolean(spec.lengthAt?.length)
  if (!wantAngles && !wantLengths) return null

  const children: Prim[] = []
  const fontSize = Math.max(12, Math.min(20, 12 + strokeSize * 0.7))
  const lineW = Math.max(1.2, strokeSize * 0.6)

  const verts = shapePolygonVertices(spec)
  const area2 = verts.length >= 3 ? signedArea2(verts) : 0
  const cw = area2 >= 0

  if (wantAngles && verts.length >= 3) {
    const n = verts.length
    for (const idx of spec.angleAt!) {
      if (idx < 0 || idx >= n) continue
      const v = verts[idx]
      const prev = verts[(idx - 1 + n) % n]
      const next = verts[(idx + 1) % n]
      const lp = Math.hypot(prev[0] - v[0], prev[1] - v[1])
      const ln = Math.hypot(next[0] - v[0], next[1] - v[1])
      if (lp < 1e-4 || ln < 1e-4) continue

      const ux = (prev[0] - v[0]) / lp, uy = (prev[1] - v[1]) / lp
      const wx = (next[0] - v[0]) / ln, wy = (next[1] - v[1]) / ln
      const startA = cw ? Math.atan2(wy, wx) : Math.atan2(uy, ux)
      const endA = cw ? Math.atan2(uy, ux) : Math.atan2(wy, wx)
      let sweep = endA - startA
      while (sweep <= 0) sweep += Math.PI * 2
      if (sweep >= Math.PI * 2 - 1e-4) continue
      const deg = (sweep * 180) / Math.PI
      const minSide = Math.min(lp, ln)
      const midA = startA + sweep / 2

      if (Math.abs(deg - 90) <= 0.6) {
        const m = Math.min(18, Math.max(8, minSide * 0.18))
        if (m >= 4 && m < minSide * 0.45) {
          const pts: Point2[] = [
            [v[0] + ux * m, v[1] + uy * m],
            [v[0] + (ux + wx) * m, v[1] + (uy + wy) * m],
            [v[0] + wx * m, v[1] + wy * m]
          ]
          children.push({ kind: 'polyline', pts, width: lineW, color, join: 'round' })
        }
        const labelR = Math.min(minSide * 0.45, Math.max(m + fontSize * 0.85, 22))
        children.push(...labeledText(v[0] + Math.cos(midA) * labelR, v[1] + Math.sin(midA) * labelR, '90°', fontSize, color))
      } else {
        const r = Math.min(26, Math.max(11, minSide * 0.22))
        if (r < minSide * 0.48) {
          const steps = Math.max(8, Math.ceil(deg / 8))
          const pts: Point2[] = []
          for (let s = 0; s <= steps; s++) {
            const a = startA + (sweep * s) / steps
            pts.push([v[0] + Math.cos(a) * r, v[1] + Math.sin(a) * r])
          }
          children.push({ kind: 'polyline', pts, width: lineW, color, join: 'round' })
        }
        const labelR = Math.min(minSide * 0.55, r + fontSize * 0.85)
        const rounded = Math.round(deg * 10) / 10
        const degStr = Number.isInteger(rounded) ? `${rounded}°` : `${fmt.comma ? rounded.toFixed(1).replace('.', ',') : rounded.toFixed(1)}°`
        children.push(...labeledText(v[0] + Math.cos(midA) * labelR, v[1] + Math.sin(midA) * labelR, degStr, fontSize, color))
      }
    }
  }

  if (wantLengths) {
    const labelOffset = Math.max(14, strokeSize * 1.5 + fontSize * 0.72)
    if (isLinear(spec.kind) && spec.lengthAt!.includes(0)) {
      const len = Math.hypot(spec.bx - spec.ax, spec.by - spec.ay)
      if (len > 1) {
        const mx = (spec.ax + spec.bx) / 2
        const my = (spec.ay + spec.by) / 2
        let nx = -(spec.by - spec.ay) / len
        let ny = (spec.bx - spec.ax) / len
        // Prefer placing above the line on screen (negative y).
        if (ny > 0 || (ny === 0 && nx < 0)) {
          nx = -nx
          ny = -ny
        }
        children.push(...labeledText(mx + nx * labelOffset, my + ny * labelOffset, formatShapeLength(len, fmt), fontSize, color))
      }
    } else if (spec.kind === 'ellipse' && spec.lengthAt!.includes(0)) {
      const x0 = Math.min(spec.ax, spec.bx), x1 = Math.max(spec.ax, spec.bx)
      const y0 = Math.min(spec.ay, spec.by), y1 = Math.max(spec.ay, spec.by)
      const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      if (rx > 1 && ry > 1) {
        const isCircle = Math.abs(rx - ry) / Math.max(rx, ry) < 0.02
        if (isCircle) {
          const edgePt: Vec2 = spec.rot ? turnPoint(cx + rx, cy, cx, cy, spec.rot) : [cx + rx, cy]
          children.push({ kind: 'line', x1: cx, y1: cy, x2: edgePt[0], y2: edgePt[1], width: lineW, color })
          const midPt: Vec2 = [(cx + edgePt[0]) / 2, (cy + edgePt[1]) / 2]
          children.push(...labeledText(midPt[0], midPt[1] - fontSize * 0.75, `r = ${formatShapeLength(rx, fmt)}`, fontSize, color))
        } else {
          const topPt: Vec2 = spec.rot ? turnPoint(cx, y0 - labelOffset, cx, cy, spec.rot) : [cx, y0 - labelOffset]
          const text = `${formatShapeLength(rx * 2, fmt)} × ${formatShapeLength(ry * 2, fmt)}`
          children.push(...labeledText(topPt[0], topPt[1], text, fontSize, color))
        }
      }
    } else {
      const edges = shapeEdges(spec)
      const outSign = cw ? 1 : -1
      for (const idx of spec.lengthAt!) {
        const edge = edges[idx]
        if (!edge) continue
        const dx = edge.b[0] - edge.a[0]
        const dy = edge.b[1] - edge.a[1]
        const len = Math.hypot(dx, dy)
        if (len < 1) continue
        const nx = (outSign * dy) / len
        const ny = (-outSign * dx) / len
        const mx = (edge.a[0] + edge.b[0]) / 2 + nx * labelOffset
        const my = (edge.a[1] + edge.b[1]) / 2 + ny * labelOffset
        children.push(...labeledText(mx, my, formatShapeLength(len, fmt), fontSize, color))
      }
    }
  }

  return children.length ? { kind: 'group', cap: 'round', join: 'round', children } : null
}
