import type { Show } from '../../core/egg'
import { outCubic, outBack, shown, span } from '../../gfx/ease'
import { additive, caption, glow } from '../../gfx/paint'
import { particle, step, type Particle } from '../../gfx/particles'
import { rng } from '../../gfx/rng'
import { drawStars, makeStars } from '../../gfx/sky'
import { burst, forces, paintSpark, type Shell } from './shells'

/**
 * Five hundred strokes on one board: night falls over a city skyline and fireworks go up, peonies,
 * golden willows, rings and crackling stars, each lighting up the sky as it bursts; the count closes
 * the show.
 */
const LAUNCHES: Array<[number, Shell]> = [
  [0.4, 'peony'],
  [0.9, 'willow'],
  [1.3, 'ring'],
  [1.7, 'peony'],
  [2.1, 'crackle'],
  [2.4, 'willow'],
  [2.8, 'peony'],
  [3.2, 'ring'],
  [3.5, 'peony'],
  [3.9, 'willow'],
  [4.4, 'crackle'],
  [4.6, 'peony'],
  [4.8, 'ring'],
  [5.0, 'willow'],
  [5.1, 'peony'],
  [5.3, 'crackle']
]

interface Rocket {
  x: number
  from: number
  to: number
  at: number
  shell: Shell
  done: boolean
}

export const fireworksShow: Show = {
  duration: 9,
  start(g) {
    const { ctx } = g
    const r = rng(500)
    const stars = makeStars(r, 220, g.w, g.h * 0.7)
    const towers = Array.from({ length: 34 }, () => ({ w: r.range(0.025, 0.06), h: r.range(0.06, 0.24), lit: Array.from({ length: 40 }, () => r() < 0.3) }))
    const rockets: Rocket[] = LAUNCHES.map(([at, shell]) => ({ x: r.range(0.15, 0.85), from: 1, to: r.range(0.14, 0.42), at, shell, done: false }))
    let sparks: Particle[] = []
    let trail: Particle[] = []
    const flashes: Array<{ x: number; y: number; at: number; hue: number }> = []
    const count = typeof g.data === 'number' ? g.data : 500
    return (t, dt) => {
      const { w, h } = g
      const night = shown(t, 0, 9, 0.8)
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, `rgba(4, 6, 22, ${0.95 * night})`)
      sky.addColorStop(1, `rgba(30, 18, 60, ${0.92 * night})`)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      drawStars(ctx, stars, t, night * 0.8)
      for (const f of flashes) {
        const k = 1 - span(t, f.at, f.at + 0.6)
        if (k > 0) additive(ctx, () => glow(ctx, f.x, f.y, Math.min(w, h) * 0.5, '#ffd9a0', 0.22 * k))
      }
      for (const rk of rockets) {
        if (t < rk.at) continue
        const x = rk.x * w
        const p = span(t, rk.at, rk.at + 1)
        const y = h * (rk.from + (rk.to - rk.from) * outCubic(p))
        if (p < 1) {
          trail.push(particle({ x: x + r.spread(1.5), y, vy: r.range(20, 60), vx: r.spread(15), life: r.range(0.3, 0.6), size: 1.6, hue: 40 }))
          additive(ctx, () => glow(ctx, x, y, 10, '#fff1c8', 1))
        } else if (!rk.done) {
          rk.done = true
          sparks.push(...burst(r, rk.shell, x, y, Math.min(w, h) / 700))
          flashes.push({ x, y, at: t, hue: 0 })
        }
      }
      trail = step(trail, dt, { gravity: 40 })
      sparks = sparks.filter((s) => s.age < s.life)
      for (const s of sparks) {
        const f = forces(s.kind)
        step([s], dt, f)
      }
      additive(ctx, () => {
        ctx.lineCap = 'round'
        for (const s of trail) {
          ctx.fillStyle = `rgba(255, 210, 140, ${1 - s.age / s.life})`
          ctx.fillRect(s.x, s.y, 1.6, 1.6)
        }
        for (const s of sparks) paintSpark(ctx, s, r)
      })
      // The skyline, dark against the lit sky.
      let x = 0
      let i = 0
      while (x < w) {
        const tw = towers[i % towers.length]
        const bw = tw.w * w
        const bh = tw.h * h
        ctx.fillStyle = `rgba(6, 6, 16, ${night})`
        ctx.fillRect(x, h - bh, bw + 1, bh)
        ctx.fillStyle = `rgba(255, 214, 130, ${0.55 * night})`
        for (let k = 0; k < tw.lit.length; k++) {
          if (!tw.lit[k]) continue
          const wx = x + 4 + (k % 4) * (bw / 4.5)
          const wy = h - bh + 6 + Math.floor(k / 4) * 11
          if (wy < h - 4 && wx < x + bw - 4) ctx.fillRect(wx, wy, 3, 5)
        }
        x += bw
        i++
      }
      const k = outBack(span(t, 6, 6.6))
      ctx.save()
      ctx.translate(w / 2, h * 0.42)
      ctx.scale(k, k)
      caption(ctx, g.say({ en: `${count} strokes!`, uk: `${count} штрихів!` }), 0, 0, Math.min(w, h) * 0.1, '#fff4dc', k > 0 ? 1 : 0, 900)
      ctx.restore()
      caption(ctx, g.say({ en: 'That’s a lot of drawing.', uk: 'Оце так ви намалювали.' }), w / 2, h * 0.42 + Math.min(w, h) * 0.09, Math.min(w, h) * 0.035, '#ffd9a0', span(t, 6.4, 7), 600)
    }
  }
}
