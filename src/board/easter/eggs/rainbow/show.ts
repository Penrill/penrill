import type { Show } from '../../core/egg'
import { inOutCubic, outBack, shown, span } from '../../gfx/ease'
import { additive, caption, glow, rays, sparkle } from '../../gfx/paint'
import { cloud } from '../../gfx/sky'

/**
 * Seven ink colours on one board: the sky clears, the sun comes out and a rainbow unrolls from one
 * cloud to the other, birds cross it and it glitters; its seven colours spell out the title.
 */
const BANDS = ['#ff3b3b', '#ff8c1a', '#ffd21a', '#3fcf4e', '#2fa3ff', '#4b55e8', '#9b4dff']

type Ctx = CanvasRenderingContext2D

function bird(ctx: Ctx, x: number, y: number, s: number, flap: number): void {
  ctx.strokeStyle = 'rgba(40, 50, 80, 0.75)'
  ctx.lineWidth = Math.max(1.5, s * 0.12)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - s, y - s * 0.4 * flap)
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5 * flap, x, y)
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5 * flap, x + s, y - s * 0.4 * flap)
  ctx.stroke()
}

function arcOf(ctx: Ctx, cx: number, cy: number, R: number, bw: number, p: number): void {
  ctx.lineCap = 'butt'
  BANDS.forEach((c, i) => {
    ctx.strokeStyle = c
    ctx.globalAlpha = 0.82
    ctx.lineWidth = bw + 1
    ctx.beginPath()
    ctx.arc(cx, cy, R - i * bw, Math.PI, Math.PI + Math.PI * p)
    ctx.stroke()
  })
  ctx.globalAlpha = 1
  // A soft white sheen along the top of the bow.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = bw * 0.6
  ctx.beginPath()
  ctx.arc(cx, cy, R - bw * 0.3, Math.PI, Math.PI + Math.PI * p)
  ctx.stroke()
}

export const rainbowShow: Show = {
  duration: 7.5,
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      const sky = shown(t, 0, 7.5, 0.7)
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, `rgba(70, 160, 255, ${0.9 * sky})`)
      bg.addColorStop(1, `rgba(215, 240, 255, ${0.85 * sky})`)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      const sx = w * 0.14
      const sy = h * 0.17
      additive(ctx, () => {
        rays(ctx, sx, sy, 14, Math.min(w, h) * 0.35, t * 0.2, '#fff3b0', 0.35 * sky)
        glow(ctx, sx, sy, Math.min(w, h) * 0.16, '#fff0a0', 0.9 * sky)
      })
      ctx.fillStyle = `rgba(255, 240, 170, ${sky})`
      ctx.beginPath()
      ctx.arc(sx, sy, Math.min(w, h) * 0.05, 0, Math.PI * 2)
      ctx.fill()

      const cx = w / 2
      const cy = h * 0.92
      const R = Math.min(w * 0.44, h * 0.72)
      const bw = R * 0.06
      const p = inOutCubic(span(t, 0.7, 2.6))
      if (p > 0) arcOf(ctx, cx, cy, R, bw, p)
      if (p >= 1)
        for (let i = 0; i < 14; i++) {
          const a = Math.PI + ((i + 0.5) / 14) * Math.PI
          const rr = R - ((i * 3) % 7) * bw
          sparkle(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 6 + 4 * Math.sin(t * 6 + i * 1.7), '#ffffff', 0.5 + 0.5 * Math.sin(t * 4 + i))
        }
      for (let i = 0; i < 4; i++) {
        const k = span(t, 1.2 + i * 0.35, 6.5 + i * 0.35)
        if (k <= 0 || k >= 1) continue
        bird(ctx, -40 + k * (w + 80), h * (0.3 + i * 0.05) + Math.sin(t * 2 + i) * 10, 9 + i * 2, Math.sin(t * 14 + i))
      }
      const slide = outBack(span(t, 0.2, 1.1))
      const bob = Math.sin(t * 1.5) * 6
      cloud(ctx, cx - R + (1 - slide) * -w * 0.4, cy - bw * 2 + bob, R * 0.75, '#ffffff', '#d7e6f5', sky)
      cloud(ctx, cx + R - bw * 6 + (1 - slide) * w * 0.4, cy - bw * 2 - bob, R * 0.75, '#ffffff', '#d7e6f5', sky)

      const k = outBack(span(t, 2.6, 3.3))
      const word = g.say({ en: 'Rainbow', uk: 'Веселка' })
      const size = Math.min(w, h) * 0.1
      ctx.save()
      ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      const widths = [...word].map((ch) => ctx.measureText(ch).width)
      let x = cx - widths.reduce((a, b) => a + b, 0) / 2
      ;[...word].forEach((ch, i) => {
        const y = h * 0.42 + Math.sin(t * 4 + i * 0.6) * size * 0.05
        ctx.save()
        ctx.translate(x + widths[i] / 2, y)
        ctx.scale(k, k)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = size * 0.14
        ctx.strokeText(ch, -widths[i] / 2, 0)
        ctx.fillStyle = BANDS[i % BANDS.length]
        ctx.fillText(ch, -widths[i] / 2, 0)
        ctx.restore()
        x += widths[i]
      })
      ctx.restore()
      caption(ctx, g.say({ en: 'Seven colours on one board', uk: 'Сім кольорів на одній дошці' }), cx, h * 0.42 + size * 0.85, size * 0.3, '#ffffff', span(t, 3, 3.6), 650)
    }
  }
}
