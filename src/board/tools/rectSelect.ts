import { hitTest, itemsInLasso } from '../engine/transform'
import type { Gesture, Sample, ToolContext } from './types'

/** A pointer that moves less than this (screen px) is a tap. */
const TAP_SLOP = 4

/**
 * Rectangle select: drag a box to select the items in it, with the same rule as the lasso. A tap
 * selects the item under the pointer, or clears the selection on empty board.
 */
export function beginRectSelect(ctx: ToolContext, start: Sample): Gesture {
  const { editor, scene } = ctx
  let end = start
  let moved = false
  const corners = (): [number, number][] => [
    [start.x, start.y],
    [end.x, start.y],
    [end.x, end.y],
    [start.x, end.y]
  ]
  return {
    move(samples) {
      if (!samples.length) return
      end = samples[samples.length - 1]
      if (Math.hypot(end.sx - start.sx, end.sy - start.sy) > TAP_SLOP) moved = true
    },
    end() {
      if (moved) return editor.setSelection(itemsInLasso(scene.getItems(), corners()))
      const hit = hitTest(scene.getItems(), start.x, start.y, 6 / editor.camera.zoom)
      if (hit) editor.setSelection([hit])
      else editor.clearSelection()
    },
    overlay: () => ({ lasso: moved ? corners() : null })
  }
}
