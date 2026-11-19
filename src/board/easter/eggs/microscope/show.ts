import type { Show } from '../../core/egg'
import { lerp, outCubic, span } from '../../gfx/ease'
import { additive, glow } from '../../gfx/paint'
import { cutHole, eyepiece, rim } from '../../gfx/lens'
import { rng } from '../../gfx/rng'
import { microbe, type Microbe } from './life'

/**
 * Zoomed all the way in: the view closes down to an eyepiece. Through it the board is still there;
 * round it, a drop of pond water with light dancing in it and its tenants swimming by.
 */
export const microscopeShow: Show = {
  duration: 6,
  passThrough: true,
  start(g) {
    const { ctx } = g
    const r = rng(1676)
    const kinds: Microbe['kind'][] = ['cell', 'cell', 'cell', 'bacterium', 'bacterium', 'bacterium', 'bacterium', 'diatom', 'diatom']
    const life: Microbe[] = Array.from({ length: 16 }, (_, i) => ({
      kind: kinds[i % kinds.length],
      x: r.range(0, g.w),
      y: r.range(0, g.h),
      s: r.range(18, 46),
      heading: r.range(0, 6.3),
      speed: r.range(14, 40),
      hue: r.pick([95, 140, 170, 300, 35]),
      phase: r.range(0, 6.3)
    }))
    const lights = Array.from({ length: 7 }, () => ({ x: r(), y: r(), s: r.range(0.15, 0.35), p: r.range(0, 6.3) }))
    return (t, dt) => {
      const { w, h } = g
      const water = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
      water.addColorStop(0, '#bdf2e4')
      water.addColorStop(0.6, '#5fbfae')
      water.addColorStop(1, '#1f6f78')
      ctx.fillStyle = water
      ctx.fillRect(0, 0, w, h)
      additive(ctx, () => {
        for (const l of lights) glow(ctx, (l.x + Math.sin(t * 0.6 + l.p) * 0.05) * w, (l.y + Math.cos(t * 0.5 + l.p) * 0.05) * h, l.s * Math.min(w, h), '#ffffff', 0.18)
      })
      for (const m of life) {
        m.heading += Math.sin(t * 0.8 + m.phase) * 0.4 * dt
        m.x += Math.cos(m.heading) * m.speed * dt
        m.y += Math.sin(m.heading) * m.speed * dt
        if (m.x < -60) m.x = w + 50
        if (m.x > w + 60) m.x = -50
        if (m.y < -60) m.y = h + 50
        if (m.y > h + 60) m.y = -50
        microbe(ctx, m, t)
      }
      const final = eyepiece(w, h, 1)
      const e = { ...final, r: lerp(Math.hypot(w, h), final.r, outCubic(span(t, 0, 0.9))) }
      cutHole(ctx, e)
      rim(ctx, e, ['#d9dde5', '#4f5664'], g.say({ en: 'Oh, someone lives here!', uk: 'Ой, а тут хтось живе!' }), span(t, 0.8, 1.3))
    }
  }
}
