import { caption } from './paint'

/**
 * The eyepiece shared by the microscope and the telescope: everything painted so far gets a round
 * hole in the middle (the board shows through it as it is), with a metal rim and a fine reticle.
 */
export interface Eyepiece {
  x: number
  y: number
  r: number
}

export function eyepiece(w: number, h: number, open: number): Eyepiece {
  return { x: w / 2, y: h * 0.47, r: Math.min(w, h) * 0.33 * open }
}

export function cutHole(ctx: CanvasRenderingContext2D, e: Eyepiece): void {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const g = ctx.createRadialGradient(e.x, e.y, e.r * 0.94, e.x, e.y, e.r)
  g.addColorStop(0, 'rgba(0, 0, 0, 1)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** The metal ring round the hole; `metal` is [light, dark]. */
export function rim(ctx: CanvasRenderingContext2D, e: Eyepiece, metal: [string, string], label: string, alpha: number): void {
  const width = Math.max(10, e.r * 0.07)
  const g = ctx.createLinearGradient(e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r)
  g.addColorStop(0, metal[0])
  g.addColorStop(0.5, metal[1])
  g.addColorStop(1, metal[0])
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = 24
  ctx.strokeStyle = g
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r + width / 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r + width - 2, Math.PI * 1.05, Math.PI * 1.7)
  ctx.stroke()
  // Fine reticle inside the hole.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = -5; i <= 5; i++) {
    const d = (i / 6) * e.r
    const tick = i % 5 === 0 ? 10 : 5
    ctx.moveTo(e.x + d, e.y - tick)
    ctx.lineTo(e.x + d, e.y + tick)
    ctx.moveTo(e.x - tick, e.y + d)
    ctx.lineTo(e.x + tick, e.y + d)
  }
  ctx.stroke()
  ctx.restore()
  caption(ctx, label, e.x, e.y + e.r + width + 34, Math.max(20, e.r * 0.11), '#ffffff', alpha, 750)
}
