import type { Show } from '../../core/egg'
import { outCubic, span } from '../../gfx/ease'
import { additive, caption, glow, sparkle } from '../../gfx/paint'
import { particle, step, type Particle } from '../../gfx/particles'
import { rng } from '../../gfx/rng'
import type { RoundFit } from '../../triggers/circle'

/**
 * A freehand circle that came out round: the screen dims around it, a line of gold light traces over
 * it, ripples run out, its radius is measured, and the story of Giotto's O is told.
 */
export const giottoShow: Show = {
  duration: 7,
  start(g) {
    const { ctx } = g
    const fit = g.data as RoundFit | undefined
    const [cx, cy] = fit ? g.toScreen(fit.cx, fit.cy) : [g.w / 2, g.h / 2]
    const R = fit ? Math.max(30, fit.r * g.zoom) : Math.min(g.w, g.h) * 0.2
    const off = fit ? (fit.error * 100).toFixed(1) : '1.0'
    const r = rng(1305)
    let sparks: Particle[] = []
    return (t, dt) => {
      const { w, h } = g
      // Dim everything but the circle.
      ctx.fillStyle = `rgba(6, 8, 18, ${0.62 * span(t, 0, 0.5)})`
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      const hole = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35)
      hole.addColorStop(0, 'rgba(0, 0, 0, 0.9)')
      hole.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = hole
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      const p = outCubic(span(t, 0.35, 1.6))
      const head = -Math.PI / 2 + p * Math.PI * 2
      additive(ctx, () => {
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#ffcf5a'
        ctx.shadowColor = '#ffb000'
        ctx.shadowBlur = 18
        ctx.lineWidth = 4 + (t > 1.6 ? Math.sin((t - 1.6) * 5) * 1.5 + 1.5 : 0)
        ctx.beginPath()
        ctx.arc(cx, cy, R, -Math.PI / 2, head)
        ctx.stroke()
        ctx.shadowBlur = 0
        if (p > 0 && p < 1) glow(ctx, cx + Math.cos(head) * R, cy + Math.sin(head) * R, 30, '#fff3c0', 1)
      })
      if (p > 0 && p < 1)
        for (let i = 0; i < 3; i++)
          sparks.push(particle({ x: cx + Math.cos(head) * R, y: cy + Math.sin(head) * R, vx: r.spread(90), vy: r.spread(90), life: r.range(0.4, 0.9), size: r.range(1, 2.5) }))
      sparks = step(sparks, dt, { drag: 2 })
      additive(ctx, () => {
        for (const s of sparks) {
          ctx.fillStyle = `rgba(255, 220, 140, ${1 - s.age / s.life})`
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      // Ripples once it is closed.
      for (const start of [1.6, 2.0, 2.4]) {
        const k = span(t, start, start + 1.4)
        if (k <= 0 || k >= 1) continue
        ctx.strokeStyle = `rgba(255, 214, 120, ${0.6 * (1 - k)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, R * (1 + outCubic(k) * 0.9), 0, Math.PI * 2)
        ctx.stroke()
      }
      for (let i = 0; i < 10; i++) {
        const a = t * 0.4 + (i * Math.PI * 2) / 10
        sparkle(ctx, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12, 7 + 4 * Math.sin(t * 5 + i), '#fff4cc', span(t, 1.6, 2))
      }
      // Its radius.
      const m = span(t, 2.2, 2.8)
      if (m > 0) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * m})`
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + R * m, cy)
        ctx.stroke()
        ctx.setLineDash([])
        caption(ctx, 'r', cx + R * 0.5, cy - 14, 18, '#ffffff', m, 700)
      }
      const below = cy - R - 90 < 60
      const ty = below ? cy + R + 60 : cy - R - 70
      const k = span(t, 1.7, 2.3)
      caption(ctx, g.say({ en: 'A perfect circle', uk: 'Ідеальне коло' }), cx, ty, Math.min(48, Math.min(w, h) * 0.06), '#fff1c8', k, 800)
      caption(ctx, g.say({ en: `Only ${off}% off true round`, uk: `Відхилення лише ${off.replace('.', ',')}%` }), cx, ty + (below ? 40 : 38), 18, '#ffe3a0', k, 600)
      caption(
        ctx,
        g.say({ en: 'They say Giotto won the Pope’s commission with just such an O.', uk: 'Кажуть, Джотто здобув замовлення Папи саме таким колом.' }),
        w / 2,
        h - 48,
        16,
        '#d9def0',
        span(t, 2.8, 3.4),
        500
      )
    }
  }
}
