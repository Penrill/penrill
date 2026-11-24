import { newId } from '@penrill/core/geometry'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import { DEFAULT_SHAPE_SIZE, isLinear, isTriangle, SHAPE_BASES, shapeBox } from '@penrill/core/shapes'
import type { LineDash, Point, ShapeItem, ShapeSpec } from '@penrill/core/types'
import type { LiveStroke } from '../../engine/renderer'
import type { Gesture, Sample, ToolContext } from '../../tools/types'

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
 * The shape tool: drag out the chosen 2D or 3D shape (Shift keeps it regular). A plain click drops
 * one of the default size centred there. Creates a first-class ShapeItem and selects it immediately
 * so vertices, 3D orbit and contextual popovers are ready right away.
 */
export function beginShape(ctx: ToolContext, start: Sample): Gesture {
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
  let keep = false
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
      if (moved) live = { ...live, parts: shapeLiveParts(makeItem(shapeBox(kind, start.x, start.y, s.x, s.y, keep))) }
    },
    end() {
      let box: [number, number, number, number]
      if (moved) box = shapeBox(kind, start.x, start.y, end.x, end.y, keep)
      else {
        const d = DEFAULT_SHAPE_SIZE / editor.camera.zoom
        box = isLinear(kind) ? [start.x - d / 2, start.y, start.x + d / 2, start.y] : [start.x - d / 2, start.y - d / 2, start.x + d / 2, start.y + d / 2]
      }
      const item = makeItem(box, newId(), scene.allocZ())
      scene.add([item])
      editor.setSelection([item])
    },
    overlay: () => ({ live })
  }
}
