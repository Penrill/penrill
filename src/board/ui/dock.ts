import type { BBox, Camera } from '@penrill/core/types'
import type { DockEdge } from '../workspaceLayout'

const MARGIN = 16

/** Keep clear of the bars docked at the top, bottom, left and right edges of the window. */
const topMin = (): number => {
  const top = document.querySelector('[data-chrome="top"]')
  if (!top) return MARGIN
  return Math.max(72, top.getBoundingClientRect().bottom + MARGIN)
}

const leftMin = (): number => {
  const els = document.querySelectorAll('[data-chrome="left"] > *, [data-chrome="rail"] > *')
  let maxRight = 0
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > maxRight) maxRight = r.right
  }
  return maxRight > 0 ? Math.max(MARGIN, maxRight + MARGIN) : MARGIN
}

const rightMax = (): number => {
  const W = window.innerWidth
  const els = document.querySelectorAll('[data-chrome="right"] > *')
  let minLeft = W
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.left < minLeft) minLeft = r.left
  }
  return minLeft < W ? Math.min(W - MARGIN, minLeft - MARGIN) : W - MARGIN
}

const bottomMax = (): number => {
  const top = document.querySelector('[data-chrome="bottom"]')?.getBoundingClientRect().top
  return top && top > 0 ? Math.min(window.innerHeight - MARGIN, top - MARGIN) : window.innerHeight - MARGIN
}

/**
 * Where a floating card goes beside a board object (world bbox): to its right if it fits, else to its
 * left, else inside the safe canvas area. Top follows the object, kept clear of top & bottom bars.
 */
export function dockBeside(
  b: BBox,
  cam: Camera,
  panelW: number,
  height: number
): { left: number; top: number; minTop: number; maxBottom: number; maxHeight: number } {
  const sx0 = (b.minX - cam.x) * cam.zoom
  const sx1 = (b.maxX - cam.x) * cam.zoom
  const sy0 = (b.minY - cam.y) * cam.zoom
  let left: number
  const minLeft = leftMin()
  const maxRight = rightMax()
  const minTop = topMin()
  const maxBottom = bottomMax()
  const maxHeight = Math.max(220, maxBottom - minTop)
  const clampedH = Math.min(height, maxHeight)
  if (sx1 + MARGIN + panelW <= maxRight) left = Math.max(minLeft, sx1 + MARGIN)
  else if (sx0 - MARGIN - panelW >= minLeft) left = Math.min(maxRight - panelW, sx0 - MARGIN - panelW)
  else left = Math.max(minLeft, maxRight - panelW)
  const top = Math.max(minTop, Math.min(sy0, maxBottom - clampedH))
  return { left, top, minTop, maxBottom, maxHeight }
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

/** The part of the window floating cards may use (clear of all docked top, bottom, left and right chrome). */
export const screenArea = (): { w: number; h: number; top: number; left: number; right: number } => ({
  w: window.innerWidth,
  h: bottomMax() + 8,
  top: topMin(),
  left: leftMin(),
  right: rightMax() + 8
})

/**
 * Where a floating box (w x h) goes next to an anchor rectangle so that all of it stays on screen:
 * centred on the anchor, above or below it (the preferred side when it fits, else the roomier one),
 * pushed back inside the window edges. An anchor that is partly or fully off screen (a selection
 * larger than the window) still gets its box, inside the visible area.
 */
export function fitBox(
  anchor: ScreenRect,
  w: number,
  h: number,
  area: { w: number; h: number; top: number; left?: number; right?: number },
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
  const minLeft = area.left === undefined ? margin : Math.max(margin, area.left)
  const maxRight = area.right === undefined ? area.w - margin : Math.min(area.w - margin, area.right - margin)
  // Clear of left and right rails when there is room; a box wider than the gap still stays inside the window.
  const left =
    minLeft + w <= maxRight
      ? Math.max(minLeft, Math.min(cx - w / 2, maxRight - w))
      : Math.max(margin, Math.min(cx - w / 2, area.w - margin - w))
  return { left, top, maxHeight: Math.min(maxHeight, room), side }
}

/**
 * Position a portaled toolbar popover (w x h) inward from a button docked to `edge`,
 * flipping if it runs out of room and clamping cleanly inside the viewport.
 */
export function fitPopoverForEdge(
  anchor: ScreenRect,
  w: number,
  h: number,
  edge: DockEdge,
  viewport: { w: number; h: number },
  gap = 8,
  margin = 12
): { left: number; top: number; maxHeight: number } {
  const maxHeight = Math.max(120, viewport.h - margin * 2)
  const shownH = Math.min(h, maxHeight)
  if (edge === 'top' || edge === 'bottom') {
    const belowTop = anchor.bottom + gap
    const aboveTop = anchor.top - gap - shownH
    let top: number
    if (edge === 'top') {
      top = belowTop + shownH <= viewport.h - margin ? belowTop : Math.max(margin, aboveTop)
    } else {
      top = aboveTop >= margin ? aboveTop : Math.min(viewport.h - margin - shownH, belowTop)
    }
    top = Math.max(margin, Math.min(top, viewport.h - margin - shownH))
    const cx = (anchor.left + anchor.right) / 2
    const left = Math.max(margin, Math.min(cx - w / 2, viewport.w - margin - w))
    return { left, top, maxHeight }
  }
  const rightLeft = anchor.right + gap
  const leftLeft = anchor.left - gap - w
  let left: number
  if (edge === 'left') {
    left = rightLeft + w <= viewport.w - margin ? rightLeft : Math.max(margin, leftLeft)
  } else {
    left = leftLeft >= margin ? leftLeft : Math.min(viewport.w - margin - w, rightLeft)
  }
  left = Math.max(margin, Math.min(left, viewport.w - margin - w))
  const cy = (anchor.top + anchor.bottom) / 2
  const top = Math.max(margin, Math.min(cy - shownH / 2, viewport.h - margin - shownH))
  return { left, top, maxHeight }
}
