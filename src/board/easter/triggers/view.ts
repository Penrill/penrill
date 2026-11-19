import { MAX_ZOOM, MIN_ZOOM } from '@inkboard/core/camera'
import type { Trigger } from '../core/egg'

/** The board zoomed all the way in or out; fires again only after leaving the limit. */
export const zoomLimit = (side: 'in' | 'out'): Trigger => ({
  arm: ({ editor }, fire) => {
    const at = (z: number): boolean => (side === 'in' ? z >= MAX_ZOOM * 0.999 : z <= MIN_ZOOM * 1.001)
    const away = (z: number): boolean => (side === 'in' ? z < MAX_ZOOM * 0.95 : z > MIN_ZOOM * 1.05)
    let edge = at(editor.camera.zoom)
    return editor.session.subscribe((s) => {
      const z = s.camera.zoom
      if (at(z) && !edge) {
        edge = true
        fire()
      } else if (away(z)) edge = false
    })
  }
})
