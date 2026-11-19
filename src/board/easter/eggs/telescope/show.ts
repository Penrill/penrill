import type { Show } from '../../core/egg'
import { lerp, outCubic, span } from '../../gfx/ease'
import { additive, glow, hsla } from '../../gfx/paint'
import { cutHole, eyepiece, rim } from '../../gfx/lens'
import { rng } from '../../gfx/rng'
import { drawStars, makeStars } from '../../gfx/sky'
import { earth, jupiter, mars, saturn } from '../../gfx/planets'

/**
 * Zoomed all the way out: the view closes down to a brass eyepiece. Through it the board is still
 * there; round it, deep space with drifting nebulae, twinkling stars, four planets and a comet.
 */
export const telescopeShow: Show = {
  duration: 6.5,
  passThrough: true,
  start(g) {
    const { ctx } = g
    const r = rng(1610)
    const stars = makeStars(r, 420, g.w, g.h)
    const clouds = Array.from({ length: 6 }, () => ({ x: r(), y: r(), s: r.range(0.25, 0.5), hue: r.pick([270, 300, 220, 190, 330]), p: r.range(0, 6.3) }))
    return (t) => {
      const { w, h } = g
      const m = Math.min(w, h)
      ctx.fillStyle = '#04030c'
      ctx.fillRect(0, 0, w, h)
      additive(ctx, () => {
        for (const c of clouds) {
          const x = (c.x + Math.sin(t * 0.1 + c.p) * 0.03) * w
          const y = (c.y + Math.cos(t * 0.1 + c.p) * 0.03) * h
          const gr = ctx.createRadialGradient(x, y, 0, x, y, c.s * Math.max(w, h))
          gr.addColorStop(0, hsla(c.hue, 80, 55, 0.22))
          gr.addColorStop(1, hsla(c.hue, 80, 40, 0))
          ctx.fillStyle = gr
          ctx.fillRect(0, 0, w, h)
        }
      })
      drawStars(ctx, stars, t)
      saturn(ctx, w * 0.13, h * 0.22, m * 0.07)
      jupiter(ctx, w * 0.1, h * 0.78, m * 0.085)
      earth(ctx, w * 0.88, h * 0.72, m * 0.065, t)
      mars(ctx, w * 0.86, h * 0.17, m * 0.035)
      // A comet crossing the top.
      const k = span(t, 0.8, 5)
      if (k > 0 && k < 1) {
        const x = w * (1.1 - k * 1.3)
        const y = h * (0.06 + k * 0.12)
        const tail = ctx.createLinearGradient(x, y, x + m * 0.35, y - m * 0.06)
        tail.addColorStop(0, 'rgba(210, 235, 255, 0.85)')
        tail.addColorStop(1, 'rgba(120, 180, 255, 0)')
        additive(ctx, () => {
          ctx.strokeStyle = tail
          ctx.lineWidth = 6
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + m * 0.35, y - m * 0.06)
          ctx.stroke()
          glow(ctx, x, y, 22, '#e6f4ff', 1)
        })
      }
      const final = eyepiece(w, h, 1)
      const e = { ...final, r: lerp(Math.hypot(w, h), final.r, outCubic(span(t, 0, 0.9))) }
      cutHole(ctx, e)
      rim(ctx, e, ['#f5dc94', '#7a5b1c'], g.say({ en: 'Hello from orbit!', uk: 'Привіт з орбіти!' }), span(t, 0.8, 1.3))
    }
  }
}
