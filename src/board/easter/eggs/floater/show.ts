import type { AppLook, Show } from '../../core/egg'
import { inOutSine, outCubic, shown, span } from '../../gfx/ease'
import { additive, caption, glow } from '../../gfx/paint'
import { earth } from '../../gfx/planets'
import { rng } from '../../gfx/rng'
import { drawStars, makeStars } from '../../gfx/sky'
import { TOOLS } from './tools'

/**
 * Moon gravity: the sky turns to space with the Earth hanging in it, a grey lunar ground rises, the
 * whole app lifts and drifts, and pencils, rulers and set squares float up, turning slowly.
 */
export const floaterShow: Show = {
  duration: 7.5,
  app: (t): AppLook => {
    const k = inOutSine(span(t, 0.4, 3.5)) * (1 - inOutSine(span(t, 5.6, 7.3)))
    return { transform: `translateY(${-k * 46 + Math.sin(t * 1.6) * 6 * k}px) rotate(${Math.sin(t * 0.9) * 0.8 * k}deg)` }
  },
  start(g) {
    const { ctx } = g
    const r = rng(1969)
    const stars = makeStars(r, 220, g.w, g.h)
    const things = Array.from({ length: 16 }, (_, i) => ({ kind: i % TOOLS.length, x: r(), at: r.range(0.2, 3.2), s: r.range(50, 90), spin: r.spread(0.6), rot: r.range(0, 6.3), sway: r.spread(0.06) }))
    const dust = Array.from({ length: 50 }, () => ({ x: r(), y: r(), v: r.range(0.01, 0.04), p: r.range(0, 6.3) }))
    return (t) => {
      const { w, h } = g
      const k = shown(t, 0, 7.5, 0.8)
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, `rgba(2, 4, 14, ${0.92 * k})`)
      sky.addColorStop(1, `rgba(16, 20, 44, ${0.85 * k})`)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      drawStars(ctx, stars, t, k)
      const m = Math.min(w, h)
      earth(ctx, w * 0.8, h * 0.22 + (1 - outCubic(span(t, 0, 1.6))) * h * 0.3, m * 0.09, t)
      // The lunar ground.
      const rise = outCubic(span(t, 0.2, 1.4))
      const gy = h * (1.02 - 0.12 * rise)
      const ground = ctx.createLinearGradient(0, gy - h * 0.05, 0, h)
      ground.addColorStop(0, `rgba(170, 172, 180, ${k})`)
      ground.addColorStop(1, `rgba(70, 72, 82, ${k})`)
      ctx.fillStyle = ground
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, gy + Math.sin(x * 0.012) * h * 0.02 + Math.sin(x * 0.031) * h * 0.008)
      ctx.lineTo(w, h)
      ctx.fill()
      ctx.fillStyle = `rgba(90, 92, 102, ${0.7 * k})`
      for (const [cx, rx] of [
        [0.15, 0.05],
        [0.42, 0.03],
        [0.7, 0.06],
        [0.9, 0.025]
      ]) {
        ctx.beginPath()
        ctx.ellipse(cx * w, gy + h * 0.05, rx * w, rx * w * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      additive(ctx, () => {
        for (const d of dust) glow(ctx, d.x * w + Math.sin(t + d.p) * 10, ((d.y - t * d.v) % 1 + 1) % 1 * h, 3, '#dfe6ff', 0.6 * k)
      })
      for (const th of things) {
        const p = span(t, th.at, th.at + 6)
        if (p <= 0) continue
        const x = (th.x + Math.sin(p * 4) * th.sway) * w
        const y = gy - p * (h + 200) + 40
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(th.rot + th.spin * t)
        ctx.globalAlpha = k
        TOOLS[th.kind](ctx, th.s * (m / 700))
        ctx.restore()
      }
      const title = g.say({ en: 'Moon gravity', uk: 'Місячна гравітація' })
      const size = m * 0.075
      ctx.save()
      ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#eef2ff'
      ctx.shadowColor = '#7f9cff'
      ctx.shadowBlur = size * 0.4
      const letters = [...title]
      const widths = letters.map((l) => ctx.measureText(l).width)
      let lx = w / 2 - widths.reduce((a, b) => a + b, 0) / 2
      const a = span(t, 1, 1.8) * (1 - span(t, 6.4, 7.2))
      ctx.globalAlpha = a
      letters.forEach((l, i) => {
        ctx.fillText(l, lx, h * 0.4 + Math.sin(t * 1.4 + i * 0.5) * size * 0.25)
        lx += widths[i]
      })
      ctx.restore()
      caption(ctx, 'g = 1.62 m/s²', w / 2, h * 0.4 + size * 1.1, size * 0.4, '#b9c6ff', a, 600)
    }
  }
}
