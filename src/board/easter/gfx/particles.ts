import type { Rng } from './rng'
import { faded, glow, hsla } from './paint'

/** Simple physics for everything that flies in the shows: sparks, confetti, coins, drops. */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds lived and seconds to live. */
  age: number
  life: number
  size: number
  /** Turn and turning speed (rad, rad/s). */
  rot: number
  spin: number
  /** Phase of a flip about its own axis (confetti, coins). */
  flip: number
  flipSpeed: number
  hue: number
  /** Free use per show (kind of piece, colour index...). */
  kind: number
}

export function particle(p: Partial<Particle> & { x: number; y: number }): Particle {
  return { vx: 0, vy: 0, age: 0, life: 3, size: 6, rot: 0, spin: 0, flip: 0, flipSpeed: 0, hue: 0, kind: 0, ...p }
}

export interface Forces {
  gravity?: number
  /** Share of speed lost per second (air resistance). */
  drag?: number
  /** Side-to-side flutter (confetti), px/s². */
  flutter?: number
  /** Floor to bounce off and how much speed survives a bounce. */
  floor?: number
  bounce?: number
}

/** Moves every particle by `dt` seconds and drops the ones whose time is up. */
export function step(list: Particle[], dt: number, f: Forces = {}): Particle[] {
  const drag = Math.max(0, 1 - (f.drag ?? 0) * dt)
  for (const p of list) {
    p.age += dt
    p.vy += (f.gravity ?? 0) * dt
    if (f.flutter) p.vx += Math.sin(p.age * 6 + p.flip) * f.flutter * dt
    p.vx *= drag
    p.vy *= drag
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.spin * dt
    p.flip += p.flipSpeed * dt
    if (f.floor !== undefined && p.y > f.floor && p.vy > 0) {
      p.y = f.floor
      p.vy *= -(f.bounce ?? 0.4)
      p.vx *= 0.8
      p.spin *= 0.6
    }
  }
  return list.filter((p) => p.age < p.life)
}

/** How much of the particle is left: 1 at birth, fading to 0 over the last `tail` of its life. */
export const fadeOut = (p: Particle, tail = 0.3): number => Math.min(1, (p.life - p.age) / (p.life * tail))

export const CONFETTI_HUES = [350, 45, 140, 205, 275, 25, 185]

/** Confetti: a paper bit that turns over as it falls (one side lit, one in shade). */
export function confetti(ctx: CanvasRenderingContext2D, p: Particle): void {
  const face = Math.cos(p.flip)
  faded(ctx, fadeOut(p, 0.2), () => {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.scale(1, Math.max(0.08, Math.abs(face)))
    ctx.fillStyle = hsla(p.hue, 85, face > 0 ? 62 : 44)
    if (p.kind % 3 === 0) {
      ctx.beginPath()
      ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2)
      ctx.fill()
    } else ctx.fillRect(-p.size * 0.6, -p.size * 0.32, p.size * 1.2, p.size * 0.64)
    ctx.restore()
  })
}

/** A gold coin turning over: a face that narrows to a rim and widens again. */
export function coin(ctx: CanvasRenderingContext2D, p: Particle): void {
  const c = Math.cos(p.flip)
  const wide = Math.abs(c)
  const r = p.size
  faded(ctx, fadeOut(p, 0.15), () => {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot * 0.2)
    // The rim: a darker body behind the face, showing more as the coin turns edge-on.
    ctx.fillStyle = '#9a6a08'
    ctx.beginPath()
    ctx.ellipse(r * 0.12 * Math.sign(c || 1), 0, Math.max(r * wide, r * 0.14), r, 0, 0, Math.PI * 2)
    ctx.fill()
    const g = ctx.createLinearGradient(-r, -r, r, r)
    g.addColorStop(0, wide > 0.5 ? '#fff4b8' : '#ffe27a')
    g.addColorStop(0.45, '#ffc931')
    g.addColorStop(1, '#c98a0c')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(0, 0, Math.max(r * wide, r * 0.08), r, 0, 0, Math.PI * 2)
    ctx.fill()
    if (wide > 0.35) {
      ctx.strokeStyle = 'rgba(150, 95, 0, 0.55)'
      ctx.lineWidth = r * 0.12
      ctx.beginPath()
      ctx.ellipse(0, 0, r * wide * 0.72, r * 0.72, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.scale(wide, 1)
      ctx.fillStyle = 'rgba(150, 95, 0, 0.75)'
      ctx.font = `900 ${r * 1.1}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('7', 0, r * 0.05)
    }
    ctx.restore()
    if (wide > 0.9) glow(ctx, p.x - r * 0.3, p.y - r * 0.3, r * 0.9, '#fff6c8', 0.5)
  })
}

/** A burst of confetti from (x, y) shot in direction `angle` within `cone`. */
export function confettiBurst(r: Rng, n: number, x: number, y: number, angle: number, cone: number, speed: number): Particle[] {
  return Array.from({ length: n }, () => {
    const a = angle + r.spread(cone)
    const v = speed * r.range(0.4, 1)
    return particle({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: r.range(3, 5),
      size: r.range(8, 15),
      rot: r.range(0, 6.3),
      spin: r.spread(6),
      flip: r.range(0, 6.3),
      flipSpeed: r.range(6, 14),
      hue: r.pick(CONFETTI_HUES),
      kind: Math.floor(r.range(0, 9))
    })
  })
}
