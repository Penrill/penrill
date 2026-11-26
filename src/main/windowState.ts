import { readFileSync, renameSync, writeFileSync } from 'node:fs'

/** Where the window was when the app closed: its normal (not maximized) bounds and state. */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** At least this much of the window (px each way) must stay on a screen to keep the saved spot. */
const MIN_VISIBLE = 100

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function readWindowState(file: string): WindowState | null {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.width) || !isNum(o.height)) return null
    if (o.width < 100 || o.height < 100) return null
    return { x: o.x, y: o.y, width: o.width, height: o.height, maximized: o.maximized === true }
  } catch {
    return null
  }
}

/** Written once on close; a broken file only means the window opens at the default spot. */
export function writeWindowState(file: string, state: WindowState): void {
  try {
    writeFileSync(file + '.tmp', JSON.stringify(state))
    renameSync(file + '.tmp', file)
  } catch {
    // Not worth bothering anyone about.
  }
}

function overlap(a: Rect, b: Rect): { w: number; h: number } {
  return {
    w: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    h: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  }
}

/**
 * Bounds to reopen at: the saved ones, on the screen the window was on, fitted into that screen's
 * work area. `null` when that screen is gone (unplugged monitor): open at the default spot.
 */
export function restoreBounds(saved: WindowState, workAreas: readonly Rect[]): Rect | null {
  let best: Rect | null = null
  let bestArea = 0
  for (const area of workAreas) {
    const o = overlap(saved, area)
    if (o.w >= MIN_VISIBLE && o.h >= MIN_VISIBLE && o.w * o.h > bestArea) {
      best = area
      bestArea = o.w * o.h
    }
  }
  if (!best) return null
  const width = Math.min(saved.width, best.width)
  const height = Math.min(saved.height, best.height)
  const x = Math.min(Math.max(saved.x, best.x), best.x + best.width - width)
  const y = Math.min(Math.max(saved.y, best.y), best.y + best.height - height)
  return { x, y, width, height }
}
