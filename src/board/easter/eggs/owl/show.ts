import type { Show } from '../../core/egg'
import { inOutSine, outBack, shown, span } from '../../gfx/ease'
import { additive, caption, glow } from '../../gfx/paint'
import { rng } from '../../gfx/rng'
import { drawStars, makeStars, moon } from '../../gfx/sky'
import { owl } from './bird'

/**
 * Three in the morning: night falls over the board, fireflies drift, and an owl glides in, lands on
 * a branch, tilts its head, blinks, and suggests bed.
 */
export const owlShow: Show = {
  duration: 8,
  start(g) {
    const { ctx } = g
    const r = rng(3)
    const stars = makeStars(r, 180, g.w, g.h * 0.7)
    const flies = Array.from({ length: 18 }, () => ({ x: r(), y: r.range(0.45, 0.95), p: r.range(0, 6.3), s: r.range(0.5, 1.2) }))
    return (t) => {
      const { w, h } = g
      const night = shown(t, 0, 8, 0.8)
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, `rgba(5, 10, 34, ${0.95 * night})`)
      sky.addColorStop(1, `rgba(22, 30, 74, ${0.9 * night})`)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      drawStars(ctx, stars, t, night)
      moon(ctx, w * 0.8, h * 0.2, Math.min(w, h) * 0.07, night)
      additive(ctx, () => {
        for (const f of flies) {
          const x = (f.x + Math.sin(t * 0.4 * f.s + f.p) * 0.04) * w
          const y = (f.y + Math.cos(t * 0.5 * f.s + f.p) * 0.03) * h
          glow(ctx, x, y, 12, '#d8ff7a', night * (0.4 + 0.6 * Math.max(0, Math.sin(t * 2 * f.s + f.p))))
        }
      })
      // The branch, coming in from the left.
      const by = h * 0.68
      const reach = w * 0.42
      ctx.fillStyle = `rgba(30, 20, 14, ${night})`
      ctx.beginPath()
      ctx.moveTo(-10, by - 16)
      ctx.quadraticCurveTo(reach * 0.6, by - 26, reach, by - 4)
      ctx.lineTo(reach, by + 4)
      ctx.quadraticCurveTo(reach * 0.6, by - 6, -10, by + 18)
      ctx.fill()
      const s = Math.min(w, h) * 0.24
      const px = reach * 0.62
      const py = by - s * 0.47
      const fly = inOutSine(span(t, 0.4, 2.6))
      const x = w + s - (w + s - px) * fly
      const y = py - Math.sin(fly * Math.PI) * h * 0.18 - (1 - fly) * h * 0.1
      const perched = fly >= 1
      const flap = perched ? Math.max(0, 1 - span(t, 2.6, 2.9)) * 0.6 : 0.5 + 0.5 * Math.sin(t * 16)
      const blink = perched ? Math.max(0, 1 - Math.abs(((t - 3) % 1.7) - 0.1) * 10) : 0
      const tilt = perched ? Math.sin(span(t, 3.4, 5.4) * Math.PI * 2) * 0.35 : 0
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(perched ? 0 : -0.12)
      owl(ctx, s, { wing: flap, blink, tilt, perched })
      ctx.restore()
      const k = outBack(span(t, 3.2, 3.7))
      if (k > 0) {
        const bx = px + s * 0.55
        const bw = Math.min(w * 0.42, 380)
        const bh = 74
        const top = py - s * 1.05
        ctx.save()
        ctx.translate(bx, top + bh)
        ctx.scale(k, k)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.beginPath()
        ctx.roundRect(0, -bh, bw, bh, 18)
        ctx.moveTo(14, -6)
        ctx.lineTo(-10, 18)
        ctx.lineTo(36, -2)
        ctx.fill()
        ctx.restore()
        caption(ctx, g.say({ en: 'Hoo-hoo… It’s 3 a.m.', uk: 'Ух-ух… Третя ночі.' }), bx + (bw * k) / 2, top + bh * 0.36, 20, '#1d2340', k, 750)
        caption(ctx, g.say({ en: 'Bedtime, maybe?', uk: 'Може, вже спати?' }), bx + (bw * k) / 2, top + bh * 0.7, 17, '#3a4270', k, 550)
      }
    }
  }
}
