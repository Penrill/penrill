import type { AppLook, Show } from '../../core/egg'
import { outBack, outCubic, span } from '../../gfx/ease'
import { backdrop, caption, faded } from '../../gfx/paint'

/**
 * Universal gravitation: a branch swings in, an apple wobbles and drops. While it falls, faint
 * copies mark every tenth of a second, further apart each time (that's g); it lands with a squash,
 * bounces, and the whole app jolts with the thud while Newton's law writes itself above.
 */
const DROP = 1.7
const G = 9.81
/** The fall is 2.2 m long on screen, so the apple lands this long after letting go. */
const METRES = 2.2
const REACH = Math.sqrt((2 * METRES) / G)

type Ctx = CanvasRenderingContext2D

function apple(ctx: Ctx, x: number, y: number, r: number, squash = 0, alpha = 1): void {
  faded(ctx, alpha, () => {
    ctx.save()
    ctx.translate(x, y + r * squash * 0.5)
    ctx.scale(1 + squash * 0.35, 1 - squash * 0.35)
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1)
    g.addColorStop(0, '#ff8a7a')
    g.addColorStop(0.45, '#e3222f')
    g.addColorStop(1, '#7c0a14')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.7)
    ctx.bezierCurveTo(r * 0.6, -r * 1.15, r * 1.25, -r * 0.45, r * 0.95, r * 0.35)
    ctx.bezierCurveTo(r * 0.75, r * 1.0, r * 0.25, r * 1.05, 0, r * 0.88)
    ctx.bezierCurveTo(-r * 0.25, r * 1.05, -r * 0.75, r * 1.0, -r * 0.95, r * 0.35)
    ctx.bezierCurveTo(-r * 1.25, -r * 0.45, -r * 0.6, -r * 1.15, 0, -r * 0.7)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.ellipse(-r * 0.42, -r * 0.3, r * 0.14, r * 0.26, 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#5b3a1e'
    ctx.lineWidth = r * 0.1
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.62)
    ctx.quadraticCurveTo(r * 0.05, -r * 0.95, r * 0.18, -r * 1.12)
    ctx.stroke()
    ctx.fillStyle = '#4caf50'
    ctx.beginPath()
    ctx.ellipse(r * 0.42, -r * 1.0, r * 0.32, r * 0.14, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
}

function branch(ctx: Ctx, w: number, sway: number, s: number): void {
  ctx.save()
  ctx.translate(w + s * 0.2, -s * 0.15)
  ctx.rotate(sway)
  ctx.fillStyle = '#5b3a1e'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-s * 2.2, s * 0.35, -s * 3.6, s * 1.05)
  ctx.lineTo(-s * 3.55, s * 1.12)
  ctx.quadraticCurveTo(-s * 2.2, s * 0.55, 0, s * 0.35)
  ctx.fill()
  const leaves: Array<[number, number, number]> = [
    [-1.2, 0.35, -0.6],
    [-1.9, 0.62, 0.7],
    [-2.6, 0.72, -0.9],
    [-3.1, 1.1, 0.4],
    [-0.6, 0.25, 0.9]
  ]
  for (const [x, y, a] of leaves) {
    ctx.save()
    ctx.translate(x * s, y * s)
    ctx.rotate(a)
    const g = ctx.createLinearGradient(0, -s * 0.15, 0, s * 0.15)
    g.addColorStop(0, '#7bd36b')
    g.addColorStop(1, '#2e7d32')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(0, s * 0.22, s * 0.13, s * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/** Where the apple is at time `t`: hanging, falling at g, then bouncing. */
function fall(t: number, top: number, floor: number, metre: number): { y: number; squash: number; landed: number } {
  if (t < DROP) return { y: top, squash: 0, landed: -1 }
  const d = t - DROP
  const reach = Math.sqrt((2 * (floor - top)) / (G * metre))
  if (d < reach) return { y: top + 0.5 * G * metre * d * d, squash: 0, landed: -1 }
  const after = d - reach
  const bounce = Math.abs(Math.sin(after * 7)) * Math.exp(-after * 3.5) * (floor - top) * 0.18
  const squash = Math.max(0, 1 - after * 9) * 0.8
  return { y: floor - bounce, squash, landed: after }
}

export const newtonShow: Show = {
  duration: 7.6,
  app: (t) => newtonApp(t),
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      const s = Math.min(w, h) * 0.16
      backdrop(ctx, w, h, 0.86 * span(t, 0, 0.5), '#081510', 0.8)
      const swing = 1 - outBack(span(t, 0, 0.9))
      branch(ctx, w, -swing * 0.8 + Math.sin(t * 2) * 0.01, s)
      const ax = w - s * 3.35
      const top = s * 1.25 - swing * s * 2
      const floor = h - s * 0.55
      const metre = (floor - top) / METRES
      const wob = t < DROP ? Math.sin(t * 30) * span(t, 1.1, DROP) * 0.08 : 0
      const f = fall(t, top, floor, metre)
      // Strobe copies every 0.1 s of the fall: the gaps grow, that's acceleration.
      for (let k = 1; k * 0.1 < Math.min(t - DROP, 0.9); k++) {
        const d = k * 0.1
        const y = top + 0.5 * G * metre * d * d
        if (y < floor && k > 1) apple(ctx, ax, y, s * 0.42, 0, 0.16)
      }
      ctx.save()
      ctx.translate(ax, f.y)
      ctx.rotate(wob)
      apple(ctx, 0, 0, s * 0.42, f.squash)
      ctx.restore()
      if (f.landed >= 0) {
        const k = outCubic(span(f.landed, 0, 0.6))
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - k)})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(ax, floor + s * 0.4, s * (0.4 + k * 1.6), s * (0.1 + k * 0.3), 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      const law = span(t, 3.4, 4.6)
      const fx = Math.max(w * 0.25, (ax - s) / 2)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, fx - w * 0.25 + law * w * 0.5, h)
      ctx.clip()
      caption(ctx, 'F = G · m₁m₂ / r²', fx, h * 0.3, Math.min(w, h) * 0.08, '#ffffff', law > 0 ? 1 : 0, 600)
      ctx.restore()
      caption(ctx, 'g = 9.81 m/s²', fx, h * 0.3 + Math.min(w, h) * 0.09, Math.min(w, h) * 0.035, '#b8f0b0', span(t, 4.4, 5), 600)
    }
  }
}

/** The app jumps with the thud of the apple. */
function newtonApp(t: number): AppLook | null {
  const d = t - DROP - REACH
  if (d < 0 || d > 0.6) return null
  return { transform: `translateY(${Math.sin(d * 30) * Math.exp(-d * 9) * 14}px)` }
}
