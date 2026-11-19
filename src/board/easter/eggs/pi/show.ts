import type { Show } from '../../core/egg'
import { inOutCubic, outBack, shown, span } from '../../gfx/ease'
import { additive, backdrop, caption, glow, hsla } from '../../gfx/paint'

/**
 * π, shown rather than told: a circle one unit across rolls one full turn along a number line and
 * lays its rim down as a gold line that ends just past 3. Then the digits of π wind out in a spiral
 * round a glowing π.
 */
const DIGITS =
  '3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647093844609550582231725359408128481117450284102701938521105559644622948954930381964428810975665933446128475648233786783165271201909145648566923460348610454326648213393607260249141273'

type Ctx = CanvasRenderingContext2D

function roll(ctx: Ctx, w: number, h: number, t: number, uk: boolean): void {
  const D = Math.min(w * 0.17, h * 0.22)
  const R = D / 2
  const y0 = h * 0.64
  const x0 = w / 2 - (Math.PI * D) / 2
  const th = inOutCubic(span(t, 0.9, 3.1)) * Math.PI * 2
  const cx = x0 + th * R
  const cy = y0 - R
  ctx.lineCap = 'round'
  // The number line with whole diameters marked.
  ctx.strokeStyle = 'rgba(200, 215, 255, 0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x0 - D * 0.6, y0)
  ctx.lineTo(x0 + Math.PI * D + D * 0.6, y0)
  ctx.stroke()
  ctx.font = `600 ${D * 0.2}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let k = 0; k <= 3; k++) {
    const x = x0 + k * D
    ctx.beginPath()
    ctx.moveTo(x, y0 - 6)
    ctx.lineTo(x, y0 + 6)
    ctx.stroke()
    ctx.fillStyle = 'rgba(210, 222, 255, 0.8)'
    ctx.fillText(String(k), x, y0 + 12)
  }
  // The rim laid down so far, in gold.
  additive(ctx, () => {
    ctx.strokeStyle = '#ffc94a'
    ctx.lineWidth = 5
    ctx.shadowColor = '#ffb300'
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(cx, y0)
    ctx.stroke()
    ctx.shadowBlur = 0
  })
  // The circle: what's left of the gold rim, the diameter and the starting point.
  ctx.strokeStyle = 'rgba(230, 238, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#ffc94a'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(cx, cy, R, Math.PI / 2 + th, Math.PI / 2 + Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R)
  ctx.lineTo(cx - Math.cos(th) * R, cy - Math.sin(th) * R)
  ctx.stroke()
  const mx = cx + Math.cos(Math.PI / 2 + th) * R
  const my = cy + Math.sin(Math.PI / 2 + th) * R
  additive(ctx, () => glow(ctx, mx, my, 18, '#ffd36b', 0.9))
  caption(ctx, 'd = 1', cx, cy - R - D * 0.22, D * 0.18, '#a9d2ff', 1 - span(t, 2.8, 3.2))
  const done = span(t, 3.1, 3.5)
  caption(ctx, 'π ≈ 3.14159…', x0 + Math.PI * D, y0 - D * 0.35, D * 0.24, '#ffd36b', done, 800)
  caption(ctx, uk ? 'стільки діаметрів уміщається в колі' : 'that many diameters go round a circle', w / 2, y0 + D * 0.65, D * 0.16, '#cfdcff', done * 0.9, 500)
}

function spiral(ctx: Ctx, w: number, h: number, t: number): void {
  const cx = w / 2
  const cy = h * 0.46
  const shownCount = Math.min(DIGITS.length, Math.floor((t - 3.6) * 70))
  if (shownCount <= 0) return
  const unit = Math.min(w, h) / 60
  const ring = unit * 2.3
  const b = ring / (Math.PI * 2)
  const turn = -t * 0.18
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let k = 0; k < shownCount; k++) {
    const arc = (k + 6) * unit * 1.7
    const th = Math.sqrt((2 * arc) / b)
    const r = b * th
    const x = cx + Math.cos(th + turn) * r
    const y = cy + Math.sin(th + turn) * r
    const age = (shownCount - k) / 70
    const fresh = Math.max(0, 1 - age * 2.5)
    const size = unit * (1.25 + r / (Math.min(w, h) * 0.6)) * (1 + fresh * 0.6)
    ctx.font = `700 ${size}px "SF Mono", Menlo, Consolas, monospace`
    ctx.fillStyle = hsla(45 + (k / DIGITS.length) * 150, 90, 62 + fresh * 30, 0.95)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(th + turn + Math.PI / 2)
    ctx.fillText(DIGITS[k], 0, 0)
    ctx.restore()
  }
  const k = outBack(span(t, 3.7, 4.4))
  additive(ctx, () => glow(ctx, cx, cy, unit * 14 * k, '#ffb84a', 0.55))
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(k, k)
  ctx.font = `italic 700 ${unit * 11}px Georgia, "Times New Roman", serif`
  ctx.fillStyle = '#fff3c4'
  ctx.shadowColor = '#ffae00'
  ctx.shadowBlur = unit * 4
  ctx.fillText('π', 0, unit * 0.5)
  ctx.restore()
}

export const piShow: Show = {
  duration: 9,
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      backdrop(ctx, w, h, 0.93 * span(t, 0, 0.5), '#060a22', 0.85)
      const first = shown(t, 0.1, 4.2, 0.5)
      if (first > 0) {
        ctx.save()
        ctx.globalAlpha = first
        roll(ctx, w, h, t, g.uk)
        ctx.restore()
      }
      spiral(ctx, w, h, t)
      caption(ctx, g.say({ en: 'Archimedes’ constant', uk: 'Число Архімеда' }), w / 2, h * 0.9, Math.min(w, h) * 0.04, '#ffe3a3', span(t, 4.5, 5.2), 700)
    }
  }
}
