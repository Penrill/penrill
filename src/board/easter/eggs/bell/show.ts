import type { Show } from '../../core/egg'
import { outBack, outCubic, shown, span } from '../../gfx/ease'
import { caption, faded, hsla } from '../../gfx/paint'
import { rng } from '../../gfx/rng'

/**
 * Forty-five minutes at the board, a whole lesson: the page turns into an exercise book, the school
 * bell swings and rings in rings of sound, notes fly out, paper planes cross the room, "Recess!"
 */
type Ctx = CanvasRenderingContext2D

function notebook(ctx: Ctx, w: number, h: number, alpha: number): void {
  faded(ctx, alpha, () => {
    ctx.fillStyle = '#fbf8ef'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(120, 170, 220, 0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let y = 40; y < h; y += 26) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(230, 80, 90, 0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(w * 0.08, 0)
    ctx.lineTo(w * 0.08, h)
    ctx.stroke()
  })
}

function bell(ctx: Ctx, s: number, swing: number): void {
  // The bracket on the wall.
  ctx.fillStyle = '#3b3f4a'
  ctx.fillRect(-s * 0.5, -s * 0.12, s, s * 0.08)
  ctx.save()
  ctx.rotate(swing)
  ctx.strokeStyle = '#3b3f4a'
  ctx.lineWidth = s * 0.05
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.08)
  ctx.lineTo(0, s * 0.08)
  ctx.stroke()
  // The clapper swings a little behind the bell.
  ctx.save()
  ctx.translate(0, s * 0.2)
  ctx.rotate(-swing * 0.6)
  ctx.strokeStyle = '#5a5f6a'
  ctx.lineWidth = s * 0.03
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, s * 0.62)
  ctx.stroke()
  ctx.fillStyle = '#4a4f5a'
  ctx.beginPath()
  ctx.arc(0, s * 0.66, s * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  const g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0)
  g.addColorStop(0, '#9c6a12')
  g.addColorStop(0.35, '#ffe08a')
  g.addColorStop(0.55, '#f2b632')
  g.addColorStop(1, '#8a5a0c')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-s * 0.12, s * 0.08)
  ctx.bezierCurveTo(-s * 0.32, s * 0.1, -s * 0.34, s * 0.4, -s * 0.38, s * 0.62)
  ctx.quadraticCurveTo(-s * 0.4, s * 0.7, -s * 0.5, s * 0.74)
  ctx.lineTo(s * 0.5, s * 0.74)
  ctx.quadraticCurveTo(s * 0.4, s * 0.7, s * 0.38, s * 0.62)
  ctx.bezierCurveTo(s * 0.34, s * 0.4, s * 0.32, s * 0.1, s * 0.12, s * 0.08)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#b07a14'
  ctx.beginPath()
  ctx.roundRect(-s * 0.52, s * 0.72, s * 1.04, s * 0.07, s * 0.03)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.18, s * 0.38, s * 0.05, s * 0.22, 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function plane(ctx: Ctx, x: number, y: number, a: number, s: number, hue: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.fillStyle = hsla(hue, 70, 92)
  ctx.strokeStyle = hsla(hue, 40, 45)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.lineTo(-s, -s * 0.55)
  ctx.lineTo(-s * 0.6, 0)
  ctx.lineTo(-s, s * 0.55)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(s, 0)
  ctx.lineTo(-s * 0.6, 0)
  ctx.stroke()
  ctx.restore()
}

export const bellShow: Show = {
  duration: 7.5,
  start(g) {
    const { ctx } = g
    const r = rng(45)
    const notes = Array.from({ length: 16 }, (_, i) => ({ at: 0.5 + i * 0.25, side: i % 2 ? 1 : -1, hue: r.range(0, 360), glyph: r.pick(['♪', '♫', '♩']), drift: r.range(0.6, 1.4) }))
    return (t) => {
      const { w, h } = g
      notebook(ctx, w, h, 0.94 * shown(t, 0, 7.5, 0.5))
      const s = Math.min(w, h) * 0.24
      const bx = w / 2
      const by = h * 0.1
      const ring = span(t, 0.3, 0.6) * (1 - span(t, 5, 6.5))
      const swing = Math.sin(t * Math.PI * 2 * 1.4) * 0.5 * ring
      // Rings of sound at every swing.
      for (let k = 0; k < 12; k++) {
        const at = 0.45 + k * 0.36
        const p = span(t, at, at + 1.1)
        if (p <= 0 || p >= 1) continue
        ctx.strokeStyle = `rgba(230, 150, 30, ${0.5 * (1 - p)})`
        ctx.lineWidth = 3
        for (const side of [-1, 1]) {
          ctx.beginPath()
          ctx.arc(bx, by + s * 0.55, s * (0.6 + outCubic(p) * 1.6), side < 0 ? Math.PI * 0.75 : -Math.PI * 0.25, side < 0 ? Math.PI * 1.25 : Math.PI * 0.25)
          ctx.stroke()
        }
      }
      ctx.save()
      ctx.translate(bx, by)
      bell(ctx, s, swing)
      ctx.restore()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const n of notes) {
        const p = span(t, n.at, n.at + 2.6)
        if (p <= 0 || p >= 1) continue
        const x = bx + n.side * (s * 0.6 + p * w * 0.3 * n.drift)
        const y = by + s * 0.6 - p * h * 0.05 + Math.sin(p * 9) * 18
        ctx.font = `700 ${s * 0.22}px system-ui, sans-serif`
        ctx.fillStyle = hsla(n.hue, 75, 50, 1 - p)
        ctx.fillText(n.glyph, x, y)
      }
      for (let i = 0; i < 3; i++) {
        const p = span(t, 1 + i * 0.7, 4.6 + i * 0.7)
        if (p <= 0 || p >= 1) continue
        const x = -60 + p * (w + 120)
        const y = h * (0.45 + i * 0.12) + Math.sin(p * 7 + i) * 40
        const dy = Math.cos(p * 7 + i) * 40 * 7 / (w + 120)
        ctx.setLineDash([4, 6])
        ctx.strokeStyle = 'rgba(120, 130, 160, 0.4)'
        ctx.beginPath()
        for (let q = Math.max(0, p - 0.18); q <= p; q += 0.01) ctx.lineTo(-60 + q * (w + 120), h * (0.45 + i * 0.12) + Math.sin(q * 7 + i) * 40)
        ctx.stroke()
        ctx.setLineDash([])
        plane(ctx, x, y, Math.atan(dy), 22, 200 + i * 60)
      }
      const k = outBack(span(t, 1.4, 2))
      const word = g.say({ en: 'Recess!', uk: 'Перерва!' })
      const size = Math.min(w * 0.13, h * 0.15)
      ctx.save()
      ctx.translate(w / 2, h * 0.66)
      ctx.scale(k, k)
      ctx.rotate(-0.04 + Math.sin(t * 3) * 0.02)
      ctx.font = `900 ${size}px "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif`
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = size * 0.16
      ctx.strokeText(word, 0, 0)
      const fill = ctx.createLinearGradient(-size * 2, 0, size * 2, 0)
      ;['#ff4f5a', '#ff9f1a', '#2fb36b', '#2f8bff', '#9b4dff'].forEach((c, i) => fill.addColorStop(i / 4, c))
      ctx.fillStyle = fill
      ctx.fillText(word, 0, 0)
      ctx.restore()
      caption(ctx, g.say({ en: '45 minutes at the board. Time for a break.', uk: '45 хвилин за дошкою. Час відпочити.' }), w / 2, h * 0.66 + size * 0.75, size * 0.24, '#3a4a6a', span(t, 2, 2.6), 650)
    }
  }
}
