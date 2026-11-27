import { newId } from '@penrill/core/geometry'
import { distanceToOutline, ellipseFrame, nearestAngle, TANGENT_MIN_SIDE, tangentAt } from '@penrill/core/tangents'
import type { ShapeItem, Vec2 } from '@penrill/core/types'
import { withShapeUpdate } from '@penrill/shape-editor/elements'

/** How close to the circle's outline (screen px) a press must land to put a tangent there. */
const PICK_PX = 16

/**
 * "Build tangent": a press on the circle's outline puts the touch point there (snapped onto the
 * circle) and starts a tangent of the shortest length. `null` when the press missed the outline.
 */
export function startTangent(item: ShapeItem, w: Vec2, zoom: number): { item: ShapeItem; id: string } | null {
  if (item.geo.kind !== 'ellipse' || item.locked) return null
  const f = ellipseFrame(item.geo)
  if (distanceToOutline(f, w) * zoom > PICK_PX) return null
  const id = `tan:${newId()}`
  const side = TANGENT_MIN_SIDE / f.unit
  const angle = nearestAngle(f, w)
  return {
    id,
    item: withShapeUpdate(item, { constructions: [...(item.constructions ?? []), { id, kind: 'tangent', angle, back: side, fwd: side }] })
  }
}

/** While the first drag goes on, the tangent grows the same both ways: as far as the pointer is along it. */
export function growTangent(item: ShapeItem, id: string, w: Vec2): ShapeItem {
  if (item.geo.kind !== 'ellipse') return item
  const f = ellipseFrame(item.geo)
  const constructions = (item.constructions ?? []).map((c) => {
    if (c.kind !== 'tangent' || c.id !== id) return c
    const { at, dir } = tangentAt(f, c.angle)
    const s = Math.abs((w[0] - at[0]) * dir[0] + (w[1] - at[1]) * dir[1])
    const side = Math.max(TANGENT_MIN_SIDE, s) / f.unit
    return { ...c, back: side, fwd: side }
  })
  return withShapeUpdate(item, { constructions })
}

/** Remove one tangent from the circle. */
export function removeTangent(item: ShapeItem, id: string): ShapeItem {
  return withShapeUpdate(item, { constructions: (item.constructions ?? []).filter((c) => c.id !== id) })
}
