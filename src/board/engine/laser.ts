import type { Camera } from '@penrill/core/types'

export const LASER = '#ff2d2d'
const FADE_STEPS = 16

export interface LaserPoint {
  x: number
  y: number
  time: number
  start: boolean
}

export interface LaserFrame {
  points: readonly LaserPoint[]
  now: number
  fade: number
}

/** Batch adjacent samples of similar age so fast pens cost at most one stroke per fade step. */
export function drawLaser(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number, laser: LaserFrame): void {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = LASER
  let band = -1
  let previous: LaserPoint | undefined
  for (const point of laser.points) {
    const life = 1 - (laser.now - point.time) / laser.fade
    const nextBand = Math.max(0, Math.min(FADE_STEPS - 1, Math.floor(life * FADE_STEPS)))
    const x = (point.x - cam.x) * cam.zoom
    const y = (point.y - cam.y) * cam.zoom
    if (band !== nextBand) {
      if (band >= 0) ctx.stroke()
      band = nextBand
      const opacity = (band + 0.5) / FADE_STEPS
      ctx.globalAlpha = Math.min(1, opacity * 1.4)
      ctx.lineWidth = 2 + 3 * opacity
      ctx.beginPath()
      if (previous && !point.start) ctx.moveTo((previous.x - cam.x) * cam.zoom, (previous.y - cam.y) * cam.zoom)
    }
    if (!previous || point.start) ctx.moveTo(x, y)
    ctx.lineTo(x, y)
    previous = point
  }
  if (band >= 0) ctx.stroke()
  ctx.restore()
}
