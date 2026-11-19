import type { Show } from '../../core/egg'
import { outBack, outCubic, shown, span } from '../../gfx/ease'
import { additive, backdrop, caption, glow, hsla } from '../../gfx/paint'

/**
 * The golden ratio: a golden rectangle splits into Fibonacci squares one by one while the golden
 * spiral is drawn through them in light; then a sunflower head grows seed by seed at the golden
 * angle, its spirals counting Fibonacci numbers too.
 */
const PHI = (1 + Math.sqrt(5)) / 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const FIB = [55, 34, 21, 13, 8, 5, 3, 2, 1, 1]

interface Square {
  x: number
  y: number
  s: number
  /** The quarter of the spiral inside it: centre and start angle (it turns a quarter clockwise). */
  cx: number
  cy: number
  a: number
}

/** Cuts squares off a golden rectangle in turn from the left, top, right and bottom. */
function squares(x: number, y: number, w: number, h: number): Square[] {
  const out: Square[] = []
  for (let i = 0; i < FIB.length; i++) {
    const side = i % 4
    if (side === 0) {
      out.push({ x, y, s: h, cx: x + h, cy: y + h, a: Math.PI })
      x += h
      w -= h
    } else if (side === 1) {
      out.push({ x, y, s: w, cx: x, cy: y + w, a: Math.PI * 1.5 })
      y += w
      h -= w
    } else if (side === 2) {
      out.push({ x: x + w - h, y, s: h, cx: x + w - h, cy: y, a: 0 })
      w -= h
    } else {
      out.push({ x, y: y + h - w, s: w, cx: x + w, cy: y + h - w, a: Math.PI / 2 })
      h -= w
    }
  }
  return out
}

function rectangle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const W = Math.min(w * 0.72, h * 0.62 * PHI)
  const H = W / PHI
  const sq = squares(w / 2 - W / 2, h * 0.47 - H / 2, W, H)
  const each = 0.32
  sq.forEach((q, i) => {
    const k = outBack(span(t, 0.3 + i * each, 0.3 + i * each + 0.4))
    if (k <= 0) return
    ctx.save()
    ctx.translate(q.x + q.s / 2, q.y + q.s / 2)
    ctx.scale(k, k)
    ctx.fillStyle = hsla(38 + i * 6, 70, 50, 0.08)
    ctx.strokeStyle = hsla(42, 80, 70, 0.6)
    ctx.lineWidth = 1.5
    ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s)
    ctx.strokeRect(-q.s / 2, -q.s / 2, q.s, q.s)
    if (q.s > 22) {
      ctx.fillStyle = hsla(42, 90, 80, 0.75)
      ctx.font = `600 ${Math.max(10, q.s * 0.16)}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(FIB[i]), 0, 0)
    }
    ctx.restore()
  })
  // The spiral, drawn outwards from the smallest square.
  const total = span(t, 0.6, 0.6 + sq.length * each + 0.4) * sq.length
  additive(ctx, () => {
    ctx.strokeStyle = '#ffcc55'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.shadowColor = '#ffae00'
    ctx.shadowBlur = 14
    for (let i = sq.length - 1, n = 0; i >= 0; i--, n++) {
      const part = Math.min(1, total - n)
      if (part <= 0) break
      const q = sq[i]
      const end = q.a + Math.PI / 2
      ctx.beginPath()
      ctx.arc(q.cx, q.cy, q.s, end - (Math.PI / 2) * part, end)
      ctx.stroke()
      if (part < 1) {
        const a = end - (Math.PI / 2) * part
        glow(ctx, q.cx + Math.cos(a) * q.s, q.cy + Math.sin(a) * q.s, 26, '#fff0b0', 1)
      }
    }
    ctx.shadowBlur = 0
  })
}

function sunflower(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const n = Math.floor(outCubic(span(t, 4.4, 7)) * 900)
  const R = Math.min(w, h) * 0.27
  const c = R / Math.sqrt(900)
  const cx = w / 2
  const cy = h * 0.41
  const turn = t * 0.08
  // Petals open round the head once it is full: 34 of them, a Fibonacci number again.
  const open = outBack(span(t, 6.6, 7.6))
  if (open > 0)
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + turn + (i % 2) * 0.05
      ctx.save()
      ctx.translate(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02)
      ctx.rotate(a)
      const len = R * 0.42 * open * (i % 2 ? 0.9 : 1)
      const petal = ctx.createLinearGradient(0, 0, len, 0)
      petal.addColorStop(0, '#e79a00')
      petal.addColorStop(1, '#ffd84a')
      ctx.fillStyle = petal
      ctx.beginPath()
      ctx.ellipse(len / 2, 0, len / 2, R * 0.075, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  for (let i = 0; i < n; i++) {
    const r = c * Math.sqrt(i)
    const k = r / R
    const a = i * GOLDEN_ANGLE + turn
    const fresh = Math.max(0, 1 - (n - i) / 60)
    ctx.fillStyle = hsla(30 + k * 12, 75, 16 + k * 34 + fresh * 30)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c * (0.45 + k * 0.1) * (1 + fresh), 0, Math.PI * 2)
    ctx.fill()
  }
}

export const goldenShow: Show = {
  duration: 9,
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      backdrop(ctx, w, h, 0.92 * span(t, 0, 0.5), '#140b02', 0.8)
      const rect = shown(t, 0, 5, 0.6)
      if (rect > 0) {
        ctx.save()
        ctx.globalAlpha = rect
        rectangle(ctx, w, h, t)
        ctx.restore()
      }
      sunflower(ctx, w, h, t)
      const k = span(t, 5, 5.8)
      caption(ctx, 'φ = 1.6180339887…', w / 2, h * 0.86, Math.min(w, h) * 0.06, '#ffe08a', k, 700)
      caption(ctx, g.say({ en: 'The golden ratio', uk: 'Золотий перетин' }), w / 2, h * 0.92, Math.min(w, h) * 0.03, '#f3d7a8', k, 500)
    }
  }
}
