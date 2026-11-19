import { particle, type Particle } from '../../gfx/particles'
import type { Rng } from '../../gfx/rng'

/** Firework shells: how each kind bursts. `kind` on a spark: 0 peony, 1 willow, 2 ring, 3 crackle. */

export type Shell = 'peony' | 'willow' | 'ring' | 'crackle'

export function burst(r: Rng, shell: Shell, x: number, y: number, scale: number): Particle[] {
  const hue = r.pick([0, 30, 50, 130, 190, 220, 280, 320])
  const spark = (a: number, v: number, p: Partial<Particle>): Particle =>
    particle({ x, y, vx: Math.cos(a) * v * scale, vy: Math.sin(a) * v * scale, life: r.range(1.4, 2.2), size: 2.4, hue, ...p })
  switch (shell) {
    case 'peony':
      return Array.from({ length: 120 }, () => spark(r.range(0, 6.3), r.range(120, 260), { hue: hue + r.spread(15) }))
    case 'willow':
      return Array.from({ length: 90 }, () => spark(r.range(0, 6.3), r.range(80, 200), { hue: 42, life: r.range(2.4, 3.2), kind: 1 }))
    case 'ring':
      return Array.from({ length: 64 }, (_, i) => spark((i / 64) * Math.PI * 2, 230, { kind: 2, life: 1.8 }))
    case 'crackle':
      return Array.from({ length: 80 }, () => spark(r.range(0, 6.3), r.range(60, 220), { hue: 55, kind: 3, life: r.range(1, 1.8) }))
  }
}

/** Physics per kind: willows hang in the air, the rest fall faster. */
export function forces(kind: number): { gravity: number; drag: number } {
  return kind === 1 ? { gravity: 55, drag: 1.6 } : { gravity: 95, drag: 1.2 }
}

/** A spark as a short streak along its motion, in additive light. */
export function paintSpark(ctx: CanvasRenderingContext2D, p: Particle, r: Rng): void {
  const left = 1 - p.age / p.life
  if (left <= 0) return
  const flicker = p.kind === 3 ? (r() < 0.5 ? 1 : 0.15) : 1
  const a = Math.min(1, left * 1.6) * flicker
  const tail = p.kind === 1 ? 0.09 : 0.04
  const colour = (alpha: number, light: number): string =>
    p.kind === 1 ? `hsla(42, 100%, ${light}%, ${alpha})` : `hsla(${p.hue}, 100%, ${light}%, ${alpha})`
  const x0 = p.x - p.vx * tail
  const y0 = p.y - p.vy * tail
  // A wide soft halo, then a bright core.
  ctx.strokeStyle = colour(a * 0.22, 60)
  ctx.lineWidth = p.size * 3.2
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.strokeStyle = colour(a, 62 + left * 28)
  ctx.lineWidth = p.size * (0.7 + left * 0.7)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}
