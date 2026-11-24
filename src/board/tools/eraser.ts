import { splitStroke } from '@penrill/core/erase'
import { bboxIntersects, circleHitsPolyline, newId } from '@penrill/core/geometry'
import type { Scene } from '@penrill/core/scene'
import { evaluateShape } from '@penrill/core/shapeEval'
import { shapeMembers } from '@penrill/core/shapeItems'
import type { Item, StrokeItem } from '@penrill/core/types'
import type { EraserMode } from '../store'
import type { Gesture, Sample, ToolContext } from './types'

/** What one swipe changed so far, kept as a single undo step. */
export interface EraseRecord {
  removed: Item[]
  added: Item[]
}

/**
 * What one eraser touch removes: a whole shape (every edge of a solid), a group made only of
 * straight lines (older shapes), otherwise just the stroke. Nothing if any of it is locked.
 */
export function eraseUnit(items: readonly Item[], item: StrokeItem): Item[] {
  let unit: Item[] = [item]
  if (item.shape) unit = shapeMembers(items, item)
  else if (item.groupId) {
    const group = items.filter((i) => i.groupId === item.groupId)
    if (group.every((i) => i.type === 'stroke' && i.geom === 'line')) unit = group
  }
  return unit.some((i) => i.locked) ? [] : unit
}

/**
 * Erase along the segment (x0, y0) → (x1, y1) on the board with a circle of radius r (board units).
 * 'stroke' removes every stroke the circle touches (like Whiteboard); 'point' cuts away only what it
 * covers and keeps the rest as separate strokes. Images and locked items are never erased.
 * Changes go into the scene without undo entries; `record` collects them for one undo step.
 */
export function eraseAlong(scene: Scene, x0: number, y0: number, x1: number, y1: number, r: number, mode: EraserMode, record: EraseRecord): void {
  const box = { minX: Math.min(x0, x1) - r, minY: Math.min(y0, y1) - r, maxX: Math.max(x0, x1) + r, maxY: Math.max(y0, y1) + r }
  const items = scene.getItems()
  if (mode === 'point') {
    const cut: Item[] = []
    const pieces: Item[] = []
    for (const item of items) {
      if (item.type !== 'stroke' || item.locked || !bboxIntersects(item.bbox, box)) continue
      const rest = splitStroke(item, x0, y0, x1, y1, r, newId)
      if (!rest) continue
      cut.push(item)
      for (const piece of rest) pieces.push({ ...piece, z: item.z })
    }
    if (!cut.length) return
    scene.remove(cut, false)
    if (pieces.length) scene.add(pieces, false)
    // One undo step for the whole swipe: what existed before it, and what is left after it.
    const fresh = new Set(record.added.map((i) => i.id))
    for (const c of cut) {
      if (fresh.has(c.id)) record.added = record.added.filter((i) => i.id !== c.id)
      else record.removed.push(c)
    }
    record.added.push(...pieces)
    return
  }
  // Sample along the eraser movement so fast swipes don't skip strokes or shapes.
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.5)))
  const hit = new Set<Item>()
  for (const item of items) {
    if (item.locked || hit.has(item) || !bboxIntersects(item.bbox, box)) continue
    if (item.type === 'shape') {
      const rr = r + item.size / 2
      const paths = evaluateShape(item).hitPaths
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = x0 + (x1 - x0) * t
        const py = y0 + (y1 - y0) * t
        if (paths.some((path) => circleHitsPolyline(px, py, rr, path))) {
          hit.add(item)
          break
        }
      }
      continue
    }
    if (item.type !== 'stroke') continue
    const rr = r + item.size / 2
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      if (circleHitsPolyline(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rr, item.points)) {
        for (const m of eraseUnit(items, item)) hit.add(m)
        break
      }
    }
  }
  if (hit.size) {
    record.removed.push(...hit)
    scene.remove([...hit], false)
  }
}

/** The eraser tool: a swipe erases along its path and becomes one undo step on release. */
export function beginErase(ctx: ToolContext, start: Sample): Gesture {
  const record: EraseRecord = { removed: [], added: [] }
  const radius = (): number => ctx.prefs().eraserRadius / ctx.editor.camera.zoom
  let last = start
  eraseAlong(ctx.scene, start.x, start.y, start.x, start.y, radius(), ctx.prefs().eraserMode, record)
  return {
    move(samples) {
      for (const s of samples) {
        eraseAlong(ctx.scene, last.x, last.y, s.x, s.y, radius(), ctx.prefs().eraserMode, record)
        last = s
      }
    },
    end() {
      if (record.removed.length || record.added.length) ctx.scene.record({ added: record.added, removed: record.removed })
    }
  }
}
