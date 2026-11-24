import { newId } from '@penrill/core/geometry'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import { DEFAULT_SHAPE_SIZE, isLinear, isTriangle, SHAPE_BASES, shapeBox } from '@penrill/core/shapes'
import type { LineDash, Point, ShapeItem, ShapeSpec } from '@penrill/core/types'
import { BACKGROUND_STYLE } from '../../engine/background'
import { COMPASS_CELL } from '../../engine/compass'
import type { LiveStroke } from '../../engine/renderer'
import { bgPattern } from '../../engine/surface'
import type { Gesture, Modifiers, Sample, ToolContext } from '../../tools/types'

const TAP_SLOP = 4
const P = (x: number, y: number): Point => [x, y, 0.5]

function shapeLiveParts(item: ShapeItem): { points: Point[]; dash?: LineDash }[] {
  const ev = evaluateShape(item)
  const parts: { points: Point[]; dash?: LineDash }[] = []
  for (const e of ev.edges) parts.push({ points: [P(e.a[0], e.a[1]), P(e.b[0], e.b[1])], ...(e.hidden ? { dash: 'dashed' } : {}) })
  for (const c of ev.curves) parts.push({ points: c.pts.map(([x, y]) => P(x, y)), ...(c.dash ? { dash: c.dash } : {}) })
  for (const d of ev.decorations) parts.push({ points: d.map(([x, y]) => P(x, y)) })
  for (const con of ev.constructions) {
    for (const s of con.segments) parts.push({ points: s.pts.map(([x, y]) => P(x, y)), ...(s.dash ? { dash: s.dash } : {}) })
  }
  return parts
}

/**
 * The shape tool: drag out the chosen 2D or 3D shape (Shift keeps it regular, Ctrl snaps to the
 * paper grid). A plain click drops one of the default size centred there. Creates a first-class
 * ShapeItem, switches to Select, and selects it immediately so vertices, 3D orbit and contextual
 * popovers are ready right away.
 */
export function beginShape(ctx: ToolContext, start: Sample, startMods?: Modifiers): Gesture {
  const { editor, scene } = ctx
  editor.clearSelection()
  const prefs = ctx.prefs()
  const { shape: kind, activePen } = ctx.session.getState()
  const slot = prefs.pens[activePen]
  const base = SHAPE_BASES[kind] ? (prefs.shapeBases[kind] ?? SHAPE_BASES[kind]!.def) : undefined
  const circles = isTriangle(kind) ? prefs.triangleCircles : undefined
  const style = {
    color: slot.color,
    size: slot.size,
    tool: 'pen' as const,
    ...(slot.dash ? { dash: slot.dash } : {}),
    // Line ends apply to the Line shape only.
    ...(kind === 'line' && slot.startCap ? { startCap: slot.startCap } : {}),
    ...(kind === 'line' && slot.endCap ? { endCap: slot.endCap } : {})
  }
  const gridStep = (): [number, number] => [
    COMPASS_CELL,
    bgPattern(ctx.prefs().background ?? 'dots') === 'lines' ? BACKGROUND_STYLE.lines.step : COMPASS_CELL
  ]
  const snap = (x: number, y: number): [number, number] => {
    const [gx, gy] = gridStep()
    return [Math.round(x / gx) * gx, Math.round(y / gy) * gy]
  }
  const dragBox = (s: Sample, shift: boolean, ctrl: boolean): [number, number, number, number] => {
    const [sx, sy] = ctrl ? snap(start.x, start.y) : [start.x, start.y]
    const [ex, ey] = ctrl ? snap(s.x, s.y) : [s.x, s.y]
    const raw = shapeBox(kind, sx, sy, ex, ey, shift)
    if (!ctrl || !shift || isLinear(kind)) return raw
    const [gx, gy] = gridStep()
    const step = Math.max(gx, gy)
    const dx = raw[2] - raw[0]
    const dy = raw[3] - raw[1]
    const side = Math.max(step, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / step) * step)
    return [raw[0], raw[1], raw[0] + (dx < 0 ? -side : side), raw[1] + (dy < 0 ? -side : side)]
  }
  const makeItem = ([ax, ay, bx, by]: [number, number, number, number], id = 'live', z = 0): ShapeItem => {
    const spec: ShapeSpec = {
      kind,
      ax,
      ay,
      bx,
      by,
      ...(base ? { base } : {}),
      ...(circles?.incircle ? { incircle: true } : {}),
      ...(circles?.circumcircle ? { circumcircle: true } : {})
    }
    const item = createShapeItem(specToShapeData(spec), style, { id, z })
    const shapeEd = editor.features?.shapeEditor
    return shapeEd && prefs.shapeDefaults ? shapeEd.applyItemDefaults(item, prefs.shapeDefaults) : item
  }
  let end = start
  let keep = !!startMods?.shift
  let snapGrid = !!startMods?.ctrl
  let moved = false
  let live: LiveStroke = {
    tool: 'pen',
    color: style.color,
    size: style.size,
    pressure: false,
    geom: 'line',
    points: [],
    ...(style.dash ? { dash: style.dash } : {}),
    ...(style.startCap ? { startCap: style.startCap } : {}),
    ...(style.endCap ? { endCap: style.endCap } : {})
  }
  return {
    move(samples, mods) {
      const s = samples.at(-1)
      if (!s) return
      if (Math.hypot(s.sx - start.sx, s.sy - start.sy) > TAP_SLOP) moved = true
      end = s
      keep = mods.shift
      snapGrid = mods.ctrl
      if (moved) live = { ...live, parts: shapeLiveParts(makeItem(dragBox(s, keep, snapGrid))) }
    },
    end() {
      let box: [number, number, number, number]
      if (moved) box = dragBox(end, keep, snapGrid)
      else {
        const d = DEFAULT_SHAPE_SIZE / editor.camera.zoom
        if (snapGrid) {
          const [gx, gy] = gridStep()
          const [cx, cy] = snap(start.x, start.y)
          const wCells = Math.max(2, Math.round(d / gx / 2) * 2) * gx
          const hCells = Math.max(2, Math.round(d / gy / 2) * 2) * gy
          box = isLinear(kind)
            ? [cx - wCells / 2, cy, cx + wCells / 2, cy]
            : [cx - wCells / 2, cy - hCells / 2, cx + wCells / 2, cy + hCells / 2]
        } else {
          box = isLinear(kind) ? [start.x - d / 2, start.y, start.x + d / 2, start.y] : [start.x - d / 2, start.y - d / 2, start.x + d / 2, start.y + d / 2]
        }
      }
      const item = makeItem(box, newId(), scene.allocZ())
      scene.add([item])
      ctx.session.setState({ tool: 'select' })
      editor.setSelection([item])
    },
    overlay: () => ({ live })
  }
}
