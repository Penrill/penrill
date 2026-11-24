import { newId } from '@penrill/core/geometry'
import { buildShapeItems } from '@penrill/core/shapeItems'
import { DEFAULT_SHAPE_SIZE, isLinear, isTriangle, SHAPE_BASES, shapeBox, specParts } from '@penrill/core/shapes'
import type { ShapeSpec } from '@penrill/core/types'
import type { LiveStroke } from '../../engine/renderer'
import type { Gesture, Sample, ToolContext } from '../../tools/types'

const TAP_SLOP = 4

/**
 * The shape tool: drag out the chosen shape (Shift keeps it regular). A plain click drops one of the
 * default size centred there. Drawn with the active pen's colour, width and line style.
 */
export function beginShape(ctx: ToolContext, start: Sample): Gesture {
  const { editor, scene } = ctx
  editor.clearSelection()
  const prefs = ctx.prefs()
  const { shape: kind, activePen } = ctx.session.getState()
  const slot = prefs.pens[activePen]
  const base = SHAPE_BASES[kind] ? (prefs.shapeBases[kind] ?? SHAPE_BASES[kind]!.def) : undefined
  const circles = isTriangle(kind) ? prefs.triangleCircles : undefined
  const makeSpec = ([ax, ay, bx, by]: [number, number, number, number]): ShapeSpec => ({
    kind, ax, ay, bx, by,
    ...(base ? { base } : {}),
    ...(circles?.incircle ? { incircle: true } : {}),
    ...(circles?.circumcircle ? { circumcircle: true } : {})
  })
  let end = start
  let keep = false
  let moved = false
  let live: LiveStroke = {
    tool: 'pen',
    color: slot.color,
    size: slot.size,
    pressure: false,
    geom: 'line',
    points: [],
    ...(slot.dash ? { dash: slot.dash } : {}),
    // Line ends apply to the Line shape only.
    ...(kind === 'line' && slot.startCap ? { startCap: slot.startCap } : {}),
    ...(kind === 'line' && slot.endCap ? { endCap: slot.endCap } : {})
  }
  return {
    move(samples, mods) {
      const s = samples.at(-1)
      if (!s) return
      if (Math.hypot(s.sx - start.sx, s.sy - start.sy) > TAP_SLOP) moved = true
      end = s
      keep = mods.shift
      if (moved) live = { ...live, parts: specParts(makeSpec(shapeBox(kind, start.x, start.y, s.x, s.y, keep)), live.size) }
    },
    end() {
      let box: [number, number, number, number]
      if (moved) box = shapeBox(kind, start.x, start.y, end.x, end.y, keep)
      else {
        const d = DEFAULT_SHAPE_SIZE / editor.camera.zoom
        box = isLinear(kind) ? [start.x - d / 2, start.y, start.x + d / 2, start.y] : [start.x - d / 2, start.y - d / 2, start.x + d / 2, start.y + d / 2]
      }
      const spec = makeSpec(box)
      // All parts of a construction stay together as one group.
      scene.add(
        buildShapeItems(spec, { color: live.color, size: live.size, tool: 'pen', dash: live.dash, startCap: live.startCap, endCap: live.endCap }, () => ({ id: newId(), z: scene.allocZ() }))
      )
    },
    overlay: () => ({ live })
  }
}
