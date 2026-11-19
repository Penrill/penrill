import type { AppLook, Show } from '../../core/egg'
import { shown, span } from '../../gfx/ease'
import { caption, rgba } from '../../gfx/paint'
import { particle, step, type Particle } from '../../gfx/particles'
import { rng } from '../../gfx/rng'
import { bolt, paintBolt, type Path } from './bolt'

/**
 * A thunderstorm over the board: heavy clouds roll in, slanting rain splashes at the bottom, and
 * lightning forks down twice, lighting the clouds and the whole app for an instant.
 */
const STRIKES = [1.4, 3.3, 3.55, 5.0]

/** How bright the lightning is at `t`: two quick flickers per strike. */
function flash(t: number): number {
  let f = 0
  for (const at of STRIKES) {
    const d = t - at
    if (d >= 0 && d < 0.5) f = Math.max(f, d < 0.06 ? 1 : d < 0.12 ? 0.25 : d < 0.18 ? 0.8 : Math.max(0, 1 - (d - 0.18) / 0.32))
  }
  return f
}

export const stormShow: Show = {
  duration: 7,
  app: (t): AppLook => ({ filter: `brightness(${0.75 + flash(t) * 0.8}) saturate(${0.7 + flash(t) * 0.3})` }),
  start(g) {
    const { ctx } = g
    const r = rng(1752)
    const drops = Array.from({ length: 420 }, () => ({ x: r.range(-0.2, 1.2), y: r(), v: r.range(0.9, 1.3), len: r.range(14, 30), floor: r.range(0.82, 1) }))
    let splashes: Particle[] = []
    const bolts: Path[][] = STRIKES.map(() => [])
    const puffs = Array.from({ length: 34 }, () => ({ x: r.range(-0.1, 1.1), y: r.range(-0.06, 0.16), s: r.range(0.12, 0.26), v: r.range(8, 22) }))
    return (t, dt) => {
      const { w, h } = g
      const dark = shown(t, 0, 7, 0.8)
      const f = flash(t)
      ctx.fillStyle = `rgba(8, 14, 28, ${0.62 * dark})`
      ctx.fillRect(0, 0, w, h)
      if (f > 0) {
        ctx.fillStyle = `rgba(210, 225, 255, ${0.35 * f})`
        ctx.fillRect(0, 0, w, h)
      }
      STRIKES.forEach((at, i) => {
        if (t >= at && !bolts[i].length) bolts[i] = bolt(r, r.range(0.2, 0.8) * w, h * 0.08, h * r.range(0.6, 0.85))
        const d = t - at
        if (d >= 0 && d < 0.5) paintBolt(ctx, bolts[i], flash(t))
      })
      // Rain, slanting with the wind; drops that land splash.
      ctx.strokeStyle = rgba('#b8cdf0', 0.45 * dark)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (const d of drops) {
        d.y += d.v * dt * 1.4
        d.x -= d.v * dt * 0.12
        if (d.y > d.floor) {
          if (r() < 0.5) splashes.push(particle({ x: d.x * w, y: d.floor * h, vx: r.spread(60), vy: -r.range(40, 110), life: 0.35, size: 1.4 }))
          d.y = -0.05
          d.x = r.range(-0.1, 1.2)
        }
        const x = d.x * w
        const y = d.y * h
        ctx.moveTo(x, y)
        ctx.lineTo(x + d.len * 0.12, y - d.len)
      }
      ctx.stroke()
      splashes = step(splashes, dt, { gravity: 600 })
      ctx.fillStyle = rgba('#cfe0ff', 0.6 * dark)
      for (const s of splashes) ctx.fillRect(s.x, s.y, s.size, s.size)
      // A bank of soft cloud along the top, lit from inside by the lightning.
      const m = Math.min(w, h)
      for (const c of puffs) {
        const x = ((c.x * (w + 300) + t * c.v) % (w + 300)) - 150
        const y = c.y * h
        const R = c.s * m * 1.6
        const tone = Math.round(34 + f * 90)
        const puff = ctx.createRadialGradient(x, y - R * 0.3, 0, x, y, R)
        puff.addColorStop(0, `rgba(${tone + 30}, ${tone + 38}, ${tone + 56}, ${0.95 * dark})`)
        puff.addColorStop(0.55, `rgba(${tone}, ${tone + 6}, ${tone + 20}, ${0.85 * dark})`)
        puff.addColorStop(1, `rgba(${tone}, ${tone + 6}, ${tone + 20}, 0)`)
        ctx.fillStyle = puff
        ctx.fillRect(x - R, y - R, R * 2, R * 2)
      }
      caption(ctx, g.say({ en: 'Make it rain', uk: 'Злива' }), w / 2, h * 0.5, Math.min(w, h) * 0.07, '#e3ecff', span(t, 1.5, 2.1) * (1 - span(t, 5.6, 6.3)), 800)
    }
  }
}
