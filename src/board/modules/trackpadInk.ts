import { panBy, screenToWorld } from '@penrill/core/camera'
import { bboxOfPoints, newId } from '@penrill/core/geometry'
import type { Point } from '@penrill/core/types'
import type { Editor } from '../editor'
import { prefsStore } from '../store'

/** The board region mapped to the whole trackpad, in CSS pixels from the board's origin. */
export function trackpadFrame(view: { width: number; height: number }, aspect: number) {
  const width = Math.min(640, view.width * 0.72, view.height * 0.56 * aspect)
  const height = width / aspect
  return { width, height, left: (view.width - width) / 2, top: (view.height - height) / 2 }
}

export class TrackpadInk {
  private id = ''
  private readonly editor: Editor

  constructor(editor: Editor) {
    this.editor = editor
  }

  point(phase: 'begin' | 'move' | 'end', x: number, y: number, frame: ReturnType<typeof trackpadFrame>): void {
    const editor = this.editor
    if (phase === 'begin') {
      this.cancel()
      const { activePen, tool } = editor.session.getState()
      const prefs = prefsStore.getState()
      const highlighter = tool === 'highlighter'
      const slot = highlighter ? prefs.highlighter : prefs.pens[activePen]
      this.id = newId()
      editor.trackpadInk = { ...slot, tool: highlighter ? 'highlighter' : 'pen', pressure: false, points: [] }
    }
    const ink = editor.trackpadInk
    if (!ink) return
    const world = screenToWorld(editor.camera, frame.left + x * frame.width, frame.top + y * frame.height)
    const last = ink.points.at(-1)
    if (!last || last[0] !== world.x || last[1] !== world.y) {
      const point: Point = [world.x, world.y, 0.5]
      ink.points.push(point)
    }
    if (phase === 'end') this.commit()
    else editor.shareInk?.(this.id, ink, false, false)
    editor.requestRender(false)
  }

  pan(dx: number, dy: number): void {
    // Finish the contact at its last ink point so moving the camera cannot extend the stroke.
    this.commit()
    this.editor.setCamera(panBy(this.editor.camera, dx * 32, dy * 32))
  }

  private commit(): void {
    const editor = this.editor
    const ink = editor.trackpadInk
    if (!ink) return
    editor.trackpadInk = null
    editor.scene.add([{ ...ink, type: 'stroke', id: this.id, z: editor.scene.allocZ(), bbox: bboxOfPoints(ink.points, ink.size) }])
    editor.shareInk?.(this.id, ink, true, true)
  }

  cancel(): void {
    const ink = this.editor.trackpadInk
    if (!ink) return
    this.editor.trackpadInk = null
    this.editor.shareInk?.(this.id, ink, true, false)
    this.editor.requestRender(false)
  }
}
