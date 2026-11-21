import type { BBox, Camera } from '@penrill/core/types'

const MARGIN = 16
/** Keep clear of the bars at the top of the window and of the drawing rail on the left. */
const topMin = (): number => Math.max(72, (document.querySelector('[data-chrome="top"]')?.getBoundingClientRect().bottom ?? 0) + MARGIN)
const leftMin = (): number => Math.max(MARGIN, (document.querySelector('[data-chrome="rail"] > *')?.getBoundingClientRect().right ?? 0) + MARGIN)

/**
 * Where a floating card goes beside a board object (world bbox): to its right if it fits, else to its
 * left, else in the bottom-right corner of the window. Top follows the object, kept on screen.
 */
export function dockBeside(b: BBox, cam: Camera, panelW: number, height: number): { left: number; top: number } {
  const sx0 = (b.minX - cam.x) * cam.zoom
  const sx1 = (b.maxX - cam.x) * cam.zoom
  const sy0 = (b.minY - cam.y) * cam.zoom
  const W = window.innerWidth
  const H = window.innerHeight
  let left: number
  const minLeft = leftMin()
  if (sx1 + MARGIN + panelW <= W - MARGIN) left = Math.max(minLeft, sx1 + MARGIN)
  else if (sx0 - MARGIN - panelW >= minLeft) left = Math.min(W - MARGIN - panelW, sx0 - MARGIN - panelW)
  else left = W - MARGIN - panelW
  const top = Math.max(topMin(), Math.min(sy0, H - MARGIN - height))
  return { left, top }
}

export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Fit {
  left: number
  top: number
  /** Room the box really has; content taller than this must scroll. */
  maxHeight: number
  side: 'above' | 'below'
}

/** The part of the window floating cards may use (below the top bars, right of the rail). */
export const screenArea = (): { w: number; h: number; top: number; left: number } => ({ w: window.innerWidth, h: window.innerHeight, top: topMin(), left: leftMin() })

/**
 * Where a floating box (w × h) goes next to an anchor rectangle so that all of it stays on screen:
 * centred on the anchor, above or below it (the preferred side when it fits, else the roomier one),
 * pushed back inside the window edges. An anchor that is partly or fully off screen (a selection
 * larger than the window) still gets its box, inside the visible area.
 */
export function fitBox(
  anchor: ScreenRect,
  w: number,
  h: number,
  area: { w: number; h: number; top: number; left?: number },
  prefer: 'above' | 'below' = 'above',
  gap = 8,
  margin = 8
): Fit {
  const minTop = Math.min(area.top, Math.max(margin, area.h - margin - h))
  const maxBottom = area.h - margin
  const room = Math.max(40, maxBottom - minTop)
  // Only the visible part of the anchor counts.
  const aTop = Math.max(minTop, Math.min(anchor.top, maxBottom))
  const aBottom = Math.max(minTop, Math.min(anchor.bottom, maxBottom))
  const above = aTop - gap - minTop
  const below = maxBottom - aBottom - gap
  const other = prefer === 'above' ? 'below' : 'above'
  const space = { above, below }
  const side = space[prefer] >= h ? prefer : space[other] >= h ? other : space[prefer] >= space[other] ? prefer : other
  const fits = space[side] >= h
  const maxHeight = fits ? Math.max(h, space[side]) : room
  const shown = Math.min(h, room)
  let top = side === 'above' ? aTop - gap - shown : aBottom + gap
  top = Math.max(minTop, Math.min(top, maxBottom - shown))
  const cx = (anchor.left + anchor.right) / 2
  // Clear of the rail when there is room for it; a box too wide for that still gets the margin.
  const minLeft = area.left === undefined ? margin : Math.max(margin, Math.min(area.left, area.w - margin - w))
  const left = Math.max(minLeft, Math.min(cx - w / 2, area.w - margin - w))
  return { left, top, maxHeight: Math.min(maxHeight, room), side }
}
