import { evaluateShape } from '@penrill/core/shapeEval'
import type { LineCap, LineDash, ShapeItem, Vec2 } from '@penrill/core/types'
import { PAPER, type Point2, type Prim } from '@penrill/render/display'
import { formatShapeLength, type ShapeAnnotationFormat } from './annotations'

const SANS_FONT = 'system-ui, -apple-system, sans-serif'
const MATH_FONT = 'Georgia, "Times New Roman", serif'

function dashPattern(dash: LineDash | undefined, width: number): number[] | undefined {
  if (!dash) return undefined
  const w = Math.max(1.5, width)
  return dash === 'dashed' ? [w * 3.4, w * 2.5] : [w * 0.2, w * 2.4]
}

function haloText(
  x: number,
  y: number,
  s: string,
  size: number,
  color: string,
  opts?: { italic?: boolean; family?: string }
): Prim[] {
  const family = opts?.family ?? SANS_FONT
  const italic = opts?.italic
  return [
    {
      kind: 'text',
      s,
      x,
      y,
      size,
      family,
      ...(italic ? { italic } : {}),
      align: 'center',
      baseline: 'middle',
      halo: { color: PAPER, width: Math.max(3, size * 0.28) }
    },
    {
      kind: 'text',
      s,
      x,
      y,
      size,
      family,
      ...(italic ? { italic } : {}),
      align: 'center',
      baseline: 'middle',
      color
    }
  ]
}

function capPrims(at: Vec2, from: Vec2, cap: LineCap | undefined, color: string, size: number): Prim[] {
  if (!cap) return []
  const dx = at[0] - from[0]
  const dy = at[1] - from[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) return []
  const ux = dx / len
  const uy = dy / len
  switch (cap) {
    case 'dot':
      return [{ kind: 'circle', cx: at[0], cy: at[1], r: Math.max(3, size * 1.4), fill: color }]
    case 'circle':
      return [{ kind: 'circle', cx: at[0], cy: at[1], r: Math.max(4, size * 1.6), fill: PAPER, stroke: color, width: size }]
    case 'bar': {
      const r = Math.max(6, size * 2.5)
      return [{ kind: 'line', x1: at[0] - uy * r, y1: at[1] + ux * r, x2: at[0] + uy * r, y2: at[1] - ux * r, width: size, color }]
    }
    case 'arrow': {
      const head = Math.min(len * 0.4, Math.max(12, size * 4.5))
      const w1: Point2 = [at[0] - ux * head - uy * head * 0.55, at[1] - uy * head + ux * head * 0.55]
      const w2: Point2 = [at[0] - ux * head + uy * head * 0.55, at[1] - uy * head - ux * head * 0.55]
      return [{ kind: 'polyline', pts: [w1, [at[0], at[1]], w2], width: size, color, join: 'round' }]
    }
  }
}

function segmentLabelPos(a: Vec2, b: Vec2, shapeCenter: Vec2, offset: number): Vec2 {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) return [mx, my - offset]
  let nx = -dy / len
  let ny = dx / len
  // Point outward away from shape center; if collinear (e.g. straight line or diameter), point upward on screen.
  const vx = mx - shapeCenter[0]
  const vy = my - shapeCenter[1]
  const dot = vx * nx + vy * ny
  if (Math.abs(dot) > 1e-2) {
    if (dot < 0) { nx = -nx; ny = -ny }
  } else if (ny > 0 || (Math.abs(ny) < 1e-4 && nx < 0)) {
    nx = -nx
    ny = -ny
  }
  return [mx + nx * offset, my + ny * offset]
}

/**
 * Compile any first-class 2D or 3D ShapeItem into a single pure `@penrill/render/display` Prim tree.
 * Rendered identically on Canvas 2D, PNG export, SVG export, PDF export and Insert menu previews.
 */
export function shapeDisplay(item: ShapeItem, fmt: ShapeAnnotationFormat): Prim {
  const ev = evaluateShape(item)
  const color = item.color
  const size = item.size
  const mainDash = dashPattern(item.dash, size)
  const auxW = Math.max(1.2, size * 0.65)
  const fontSize = Math.max(12, Math.min(20, 12 + size * 0.7))
  const labelFontSize = Math.max(14, Math.min(22, 13.5 + size * 0.75))
  const children: Prim[] = []

  // 1. Translucent shaded fills (e.g. 3D axial cross-sections) underneath all lines.
  for (const c of ev.constructions) {
    if (!c.fills) continue
    for (const f of c.fills) {
      if (f.pts.length >= 3) {
        children.push({ kind: 'polygon', pts: f.pts as Point2[], color, opacity: f.opacity })
      }
    }
  }

  // 2. Hidden 3D edges (dashed).
  for (const e of ev.edges) {
    if (!e.hidden) continue
    children.push({
      kind: 'line',
      x1: e.a[0],
      y1: e.a[1],
      x2: e.b[0],
      y2: e.b[1],
      width: size,
      color,
      dash: dashPattern('dashed', size)
    })
  }
  for (const cr of ev.curves) {
    if (!cr.dash || cr.pts.length < 2) continue
    children.push({
      kind: 'polyline',
      pts: cr.pts as Point2[],
      width: size,
      color,
      join: 'round',
      dash: dashPattern(cr.dash, size)
    })
  }

  // 3. Geometric construction segments (altitudes, medians, bisectors, diagonals, midlines, circles, apothems, axes).
  for (const c of ev.constructions) {
    for (const seg of c.segments) {
      if (seg.pts.length < 2) continue
      const w = seg.thin ? auxW : Math.max(1.4, size * 0.85)
      const dash = dashPattern(seg.dash, w)
      if (seg.pts.length === 2) {
        children.push({
          kind: 'line',
          x1: seg.pts[0][0],
          y1: seg.pts[0][1],
          x2: seg.pts[1][0],
          y2: seg.pts[1][1],
          width: w,
          color,
          ...(dash ? { dash } : {})
        })
      } else {
        children.push({
          kind: 'polyline',
          pts: seg.pts as Point2[],
          width: w,
          color,
          join: 'round',
          ...(dash ? { dash } : {})
        })
      }
    }
  }

  // 4. Primary visible edges, curves, arrow decorations, and line end caps.
  for (const e of ev.edges) {
    if (e.hidden) continue
    children.push({
      kind: 'line',
      x1: e.a[0],
      y1: e.a[1],
      x2: e.b[0],
      y2: e.b[1],
      width: size,
      color,
      ...(mainDash ? { dash: mainDash } : {})
    })
  }
  for (const cr of ev.curves) {
    if (cr.dash || cr.pts.length < 2) continue
    children.push({
      kind: 'polyline',
      pts: cr.pts as Point2[],
      width: size,
      color,
      join: 'round',
      ...(mainDash ? { dash: mainDash } : {})
    })
  }
  for (const dec of ev.decorations) {
    if (dec.length < 2) continue
    children.push({ kind: 'polyline', pts: dec as Point2[], width: size, color, join: 'round' })
  }
  if (item.geo.kind === 'line' && ev.edges[0]) {
    const e = ev.edges[0]
    children.push(...capPrims(e.a, e.b, item.startCap, color, size))
    children.push(...capPrims(e.b, e.a, item.endCap, color, size))
  }

  // 5. Crisp dot markers for midpoints, centres O and altitude feet.
  for (const c of ev.constructions) {
    if (!c.dots) continue
    for (const d of c.dots) {
      children.push({ kind: 'circle', cx: d.pos[0], cy: d.pos[1], r: d.r ?? Math.max(2.6, size * 1.15), fill: color })
    }
  }

  // 6. Interior angle arcs / 90 deg corner squares and degree labels.
  if (item.angles?.length) {
    const angleSet = new Set(item.angles)
    const edgeByVert = new Map<string, number>()
    for (const e of ev.edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1])
      edgeByVert.set(e.from, Math.min(edgeByVert.get(e.from) ?? Infinity, len))
      edgeByVert.set(e.to, Math.min(edgeByVert.get(e.to) ?? Infinity, len))
    }
    for (const v of ev.vertices) {
      if (!angleSet.has(v.id)) continue
      if (v.angle3d) {
        if (v.angle3d.markPts.length >= 2) {
          children.push({ kind: 'polyline', pts: v.angle3d.markPts as Point2[], width: auxW, color, join: 'round' })
        }
        const rounded = Math.round(v.angle3d.deg * 10) / 10
        const degStr = Math.abs(v.angle3d.deg - 90) <= 0.6
          ? '90°'
          : Number.isInteger(rounded)
            ? `${rounded}°`
            : `${fmt.comma ? rounded.toFixed(1).replace('.', ',') : rounded.toFixed(1)}°`
        children.push(...haloText(v.angle3d.labelPos[0], v.angle3d.labelPos[1], degStr, fontSize, color))
        continue
      }
      if (v.angleDeg === undefined || !v.angleRays) continue
      const [startRay, endRay] = v.angleRays
      const startA = Math.atan2(startRay[1], startRay[0])
      let sweep = Math.atan2(endRay[1], endRay[0]) - startA
      while (sweep <= 0) sweep += Math.PI * 2
      if (sweep >= Math.PI * 2 - 1e-4) continue
      const deg = (sweep * 180) / Math.PI
      const minSide = edgeByVert.get(v.id) ?? 60
      if (!Number.isFinite(minSide) || minSide < 8) continue
      const midA = startA + sweep / 2

      if (Math.abs(deg - 90) <= 0.6) {
        const m = Math.min(18, Math.max(8, minSide * 0.18))
        if (m >= 4 && m < minSide * 0.45) {
          const pts: Point2[] = [
            [v.pos[0] + startRay[0] * m, v.pos[1] + startRay[1] * m],
            [v.pos[0] + (startRay[0] + endRay[0]) * m, v.pos[1] + (startRay[1] + endRay[1]) * m],
            [v.pos[0] + endRay[0] * m, v.pos[1] + endRay[1] * m]
          ]
          children.push({ kind: 'polyline', pts, width: auxW, color, join: 'round' })
        }
        const labelR = Math.min(minSide * 0.48, Math.max(m + fontSize * 0.85, 22))
        children.push(...haloText(v.pos[0] + Math.cos(midA) * labelR, v.pos[1] + Math.sin(midA) * labelR, '90°', fontSize, color))
      } else {
        const r = Math.min(26, Math.max(11, minSide * 0.22))
        if (r < minSide * 0.48) {
          const steps = Math.max(8, Math.ceil(deg / 8))
          const pts: Point2[] = []
          for (let s = 0; s <= steps; s++) {
            const a = startA + (sweep * s) / steps
            pts.push([v.pos[0] + Math.cos(a) * r, v.pos[1] + Math.sin(a) * r])
          }
          children.push({ kind: 'polyline', pts, width: auxW, color, join: 'round' })
        }
        const labelR = Math.min(minSide * 0.56, r + fontSize * 0.85)
        const rounded = Math.round(deg * 10) / 10
        const degStr = Number.isInteger(rounded) ? `${rounded}°` : `${fmt.comma ? rounded.toFixed(1).replace('.', ',') : rounded.toFixed(1)}°`
        children.push(...haloText(v.pos[0] + Math.cos(midA) * labelR, v.pos[1] + Math.sin(midA) * labelR, degStr, fontSize, color))
      }
    }
  }

  // 7. True lengths on edges, curves (ellipse/sphere) and constructions.
  if (item.lengths?.length) {
    const lenSet = new Set(item.lengths)
    const offset = Math.max(14, size * 1.5 + fontSize * 0.72)
    for (const e of ev.edges) {
      if (!lenSet.has(e.id) || e.length < 1) continue
      const [lx, ly] = segmentLabelPos(e.a, e.b, ev.center, offset)
      children.push(...haloText(lx, ly, formatShapeLength(e.length, fmt), fontSize, color))
    }
    for (const c of ev.constructions) {
      if (!lenSet.has(c.id) || !c.length || !c.lengthAnchor) continue
      const [lx, ly] = segmentLabelPos(c.lengthAnchor[0], c.lengthAnchor[1], ev.center, offset * 0.8)
      const prefix = c.kind === 'radius' ? 'r = ' : c.kind === 'diameter' ? 'd = ' : c.kind === 'altitude' ? 'h = ' : ''
      children.push(...haloText(lx, ly, `${prefix}${formatShapeLength(c.length, fmt)}`, fontSize, color))
    }
    if (item.geo.kind === 'ellipse' && lenSet.has('e0')) {
      const x0 = Math.min(item.geo.ax, item.geo.bx), x1 = Math.max(item.geo.ax, item.geo.bx)
      const y0 = Math.min(item.geo.ay, item.geo.by), y1 = Math.max(item.geo.ay, item.geo.by)
      const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
      if (rx > 1 && ry > 1) {
        const isCircle = Math.abs(rx - ry) / Math.max(rx, ry) < 0.02
        const text = isCircle
          ? `r = ${formatShapeLength(rx, fmt)}`
          : `${formatShapeLength(rx * 2, fmt)} × ${formatShapeLength(ry * 2, fmt)}`
        const vTop = ev.vertices.find((v) => v.id === 'v0')?.pos ?? [ev.center[0], ev.center[1] - ry]
        const dx = vTop[0] - ev.center[0], dy = vTop[1] - ev.center[1]
        const d = Math.hypot(dx, dy) || 1
        children.push(...haloText(vTop[0] + (dx / d) * offset, vTop[1] + (dy / d) * offset, text, fontSize, color))
      }
    }
    if (item.geo.kind === 'sphere' && lenSet.has('outer')) {
      const cr = ev.curves.find((c) => c.id === 'outer')
      if (cr?.length && cr.length > 1) {
        children.push(...haloText(ev.center[0], ev.bounds.minY - offset * 0.75, `r = ${formatShapeLength(cr.length, fmt)}`, fontSize, color))
      }
    }
  }

  // 8. Vertex & centre letter labels (A, B, C, D, S, O...).
  const labeledPoints = new Set<string>()
  const labelOffset = Math.max(15, size * 1.7 + labelFontSize * 0.7)
  if (item.labels) {
    for (const v of ev.vertices) {
      const text = item.labels[v.id]
      if (!text) continue
      labeledPoints.add(v.id)
      let dx = v.pos[0] - ev.center[0]
      let dy = v.pos[1] - ev.center[1]
      const d = Math.hypot(dx, dy)
      if (d < 1e-2) { dx = 0.6; dy = 0.8 }
      else { dx /= d; dy /= d }
      const off = v.role === 'center' ? labelOffset * 0.8 : labelOffset
      children.push(...haloText(v.pos[0] + dx * off, v.pos[1] + dy * off, text, labelFontSize, color, { italic: true, family: MATH_FONT }))
    }
  }
  for (const c of ev.constructions) {
    if (!c.label || labeledPoints.has('center')) continue
    const dx = c.label.pos[0] - c.label.awayFrom[0]
    const dy = c.label.pos[1] - c.label.awayFrom[1]
    const d = Math.hypot(dx, dy) || 1
    children.push(...haloText(
      c.label.pos[0] + (dx / d) * (labelOffset * 0.85),
      c.label.pos[1] + (dy / d) * (labelOffset * 0.85),
      c.label.text,
      labelFontSize,
      color,
      { italic: true, family: MATH_FONT }
    ))
  }

  return {
    kind: 'group',
    cap: 'round',
    join: 'round',
    ...(item.tool === 'highlighter' ? { opacity: 0.35 } : {}),
    children
  }
}
