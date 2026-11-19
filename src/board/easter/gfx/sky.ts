import { additive, faded, glow, rgba } from './paint'
import type { Rng } from './rng'

/** Things in the sky that several shows share: twinkling stars, soft clouds, a moon. */

export interface Star {
  x: number
  y: number
  r: number
  phase: number
  speed: number
  warm: boolean
}

export function makeStars(r: Rng, n: number, w: number, h: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: r() * w,
    y: r() * h,
    r: r() < 0.08 ? r.range(1.2, 2) : r.range(0.4, 1.1),
    phase: r.range(0, 6.3),
    speed: r.range(1, 3.5),
    warm: r() < 0.25
  }))
}

export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], t: number, alpha = 1): void {
  additive(ctx, () => {
    for (const s of stars) {
      const a = alpha * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase)))
      ctx.fillStyle = s.warm ? `rgba(255, 228, 190, ${a})` : `rgba(220, 232, 255, ${a})`
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
      if (s.r > 1.2) glow(ctx, s.x, s.y, s.r * 6, s.warm ? '#ffe2b0' : '#cfe0ff', a * 0.35)
    }
  })
}

/** A fluffy cloud made of overlapping puffs, lit from above. `s` is its width in px. */
export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, light: string, shade: string, alpha = 1): void {
  const puffs: Array<[number, number, number]> = [
    [-0.32, 0.06, 0.2],
    [-0.12, -0.08, 0.26],
    [0.12, -0.12, 0.3],
    [0.32, 0.02, 0.22],
    [0, 0.1, 0.24]
  ]
  faded(ctx, alpha, () => {
    for (const [dx, dy, r] of puffs) {
      const cx = x + dx * s
      const cy = y + dy * s
      const g = ctx.createRadialGradient(cx, cy - r * s * 0.4, r * s * 0.1, cx, cy, r * s)
      g.addColorStop(0, light)
      g.addColorStop(1, shade)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r * s, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/** A crescent moon with a halo. */
export function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  faded(ctx, alpha, () => {
    glow(ctx, x, y, r * 3.2, '#fff2c8', 0.22)
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    g.addColorStop(0, '#fffbe8')
    g.addColorStop(1, '#e9dcb0')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    // The dark part of the crescent.
    ctx.fillStyle = rgba('#0a1030', 0.92)
    ctx.beginPath()
    ctx.arc(x + r * 0.45, y - r * 0.18, r * 0.92, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
}
