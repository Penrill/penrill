import type { Show } from '../../core/egg'
import { outBack, outCubic, span } from '../../gfx/ease'
import { starPath } from '../../gfx/paint'

/**
 * The "six seven" meme in pop-art style: a comic burst with halftone dots, two open palms seesawing
 * a big 6 and a big 7 up and down, and the shout across the bottom.
 */
type Ctx = CanvasRenderingContext2D
const INK = '#14101c'

function burst(ctx: Ctx, w: number, h: number, t: number, open: number): void {
  const cx = w / 2
  const cy = h / 2
  const R = Math.hypot(w, h) * 0.6 * open
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = '#ffcf33'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ff8a1f'
  const n = 22
  for (let i = 0; i < n; i += 2) {
    const a0 = t * 0.15 + (i / n) * Math.PI * 2
    const a1 = a0 + (Math.PI * 2) / n
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R)
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
    ctx.fill()
  }
  // Halftone: dots grow towards the edges.
  ctx.fillStyle = 'rgba(160, 30, 0, 0.2)'
  const step = 16
  const far = Math.hypot(w, h) / 2
  for (let y = step / 2; y < h; y += step)
    for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
      const d = Math.hypot(x - cx, y - cy) / far
      ctx.beginPath()
      ctx.arc(x, y, 1 + d * 5, 0, Math.PI * 2)
      ctx.fill()
    }
  ctx.restore()
}

/** A cartoon hand, palm up, fingers pointing right; `s` is its length. */
function palm(ctx: Ctx, s: number, sleeve: string): void {
  ctx.lineJoin = 'round'
  ctx.lineWidth = s * 0.035
  ctx.strokeStyle = INK
  const part = (paint: () => void, fill: string): void => {
    ctx.beginPath()
    paint()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.stroke()
  }
  part(() => ctx.roundRect(-0.85 * s, -0.17 * s, 0.42 * s, 0.36 * s, 0.05 * s), sleeve)
  part(() => ctx.roundRect(-0.5 * s, -0.19 * s, 0.1 * s, 0.4 * s, 0.03 * s), '#ffffff')
  part(() => ctx.roundRect(0.0 * s, 0.03 * s, 0.5 * s, 0.13 * s, 0.065 * s), '#f2b27f')
  part(() => ctx.roundRect(-0.42 * s, -0.12 * s, 0.6 * s, 0.3 * s, 0.13 * s), '#ffcf9e')
  part(() => ctx.roundRect(0.05 * s, -0.11 * s, 0.52 * s, 0.13 * s, 0.065 * s), '#ffcf9e')
  ctx.save()
  ctx.translate(-0.02 * s, -0.08 * s)
  ctx.rotate(-1.05)
  part(() => ctx.roundRect(0, -0.06 * s, 0.26 * s, 0.12 * s, 0.06 * s), '#ffcf9e')
  ctx.restore()
  // A crease across the palm.
  ctx.lineWidth = s * 0.02
  ctx.beginPath()
  ctx.moveTo(-0.3 * s, 0.02 * s)
  ctx.quadraticCurveTo(-0.1 * s, 0.08 * s, 0.08 * s, 0.02 * s)
  ctx.stroke()
}

function bigDigit(ctx: Ctx, digit: string, s: number, fill: string, offset: string): void {
  ctx.font = `italic 900 ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.fillStyle = offset
  ctx.fillText(digit, s * 0.06, s * 0.06)
  ctx.strokeStyle = INK
  ctx.lineWidth = s * 0.07
  ctx.strokeText(digit, 0, 0)
  ctx.fillStyle = fill
  ctx.fillText(digit, 0, 0)
}

function shout(ctx: Ctx, text: string, x: number, y: number, size: number, t: number): void {
  ctx.font = `italic 900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const letters = [...text]
  const widths = letters.map((l) => ctx.measureText(l).width)
  let px = x - widths.reduce((a, b) => a + b, 0) / 2
  letters.forEach((l, i) => {
    const dy = Math.sin(t * 11 + i * 0.9) * size * 0.06
    ctx.fillStyle = INK
    ctx.fillText(l, px + size * 0.06, y + dy + size * 0.07)
    ctx.strokeStyle = INK
    ctx.lineWidth = size * 0.12
    ctx.strokeText(l, px, y + dy)
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ffe94d'
    ctx.fillText(l, px, y + dy)
    px += widths[i]
  })
}

function pow(ctx: Ctx, x: number, y: number, r: number, t: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(t * 4) * 0.15)
  ctx.scale(1 + Math.sin(t * 9) * 0.05, 1 + Math.sin(t * 9) * 0.05)
  starPath(ctx, 0, 0, r, r * 0.6, 12)
  ctx.fillStyle = '#ff2f7a'
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = r * 0.07
  ctx.stroke()
  ctx.restore()
}

export const sixSevenShow: Show = {
  duration: 5.6,
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      const s = Math.min(w, h) * 0.34
      burst(ctx, w, h, t, outCubic(span(t, 0, 0.45)))
      pow(ctx, w * 0.12, h * 0.18, s * 0.28, t)
      pow(ctx, w * 0.88, h * 0.22, s * 0.22, t + 1)
      const rise = outBack(span(t, 0.15, 0.7))
      const phase = Math.max(0, t - 0.5) * Math.PI * 2 * 1.7
      for (const side of [-1, 1]) {
        const bob = side * Math.sin(phase) * s * 0.32
        const x = w / 2 + side * Math.min(w * 0.22, s * 1.05)
        const y = h * 0.58 + bob + (1 - rise) * h * 0.6
        ctx.save()
        ctx.translate(x - side * s * 0.15, y + s * 0.12)
        ctx.scale(-side, 1)
        palm(ctx, s, side < 0 ? '#3a8bff' : '#ff4f9a')
        ctx.restore()
        ctx.save()
        ctx.translate(x, y - s * 0.42)
        ctx.rotate(side * Math.sin(phase) * 0.12)
        bigDigit(ctx, side < 0 ? '6' : '7', s * 0.95, side < 0 ? '#ffe94d' : '#ffffff', side < 0 ? '#00c8ff' : '#ff2fa8')
        ctx.restore()
      }
      shout(ctx, g.say({ en: 'SIX SEVEN!', uk: 'ШІСТЬ-СІМ!' }), w / 2, h * 0.88, Math.min(w * 0.11, h * 0.12), t)
    }
  }
}
