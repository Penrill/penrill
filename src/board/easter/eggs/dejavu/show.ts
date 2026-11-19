import type { AppLook, Show } from '../../core/egg'
import { span } from '../../gfx/ease'
import { rng } from '../../gfx/rng'

/**
 * Déjà vu: a black cat walks across the screen, the picture glitches, and the very same cat walks
 * across again, step for step. The title shivers in split colour.
 */
const WALKS = [0.3, 3.0]
const WALK = 2.2
const GLITCH = [2.5, 2.95]

type Ctx = CanvasRenderingContext2D

function cat(ctx: Ctx, s: number, phase: number): void {
  ctx.fillStyle = '#08080c'
  ctx.strokeStyle = '#08080c'
  ctx.lineCap = 'round'
  // Tail, swaying.
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.moveTo(-s * 0.45, -s * 0.25)
  ctx.bezierCurveTo(-s * 0.75, -s * 0.3, -s * 0.7, -s * (0.75 + Math.sin(phase * 0.5) * 0.1), -s * (0.55 + Math.sin(phase * 0.5) * 0.08), -s * 0.85)
  ctx.stroke()
  // Legs: diagonal pairs in step.
  ctx.lineWidth = s * 0.08
  const legs: Array<[number, number]> = [
    [-0.32, 0],
    [-0.2, Math.PI],
    [0.25, Math.PI],
    [0.37, 0]
  ]
  for (const [x, p] of legs) {
    const swing = Math.sin(phase + p) * s * 0.12
    ctx.beginPath()
    ctx.moveTo(x * s, -s * 0.2)
    ctx.lineTo(x * s + swing, 0)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.32, s * 0.48, s * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(s * 0.52, -s * 0.5, s * 0.17, 0, Math.PI * 2)
  ctx.fill()
  for (const dx of [0.42, 0.62]) {
    ctx.beginPath()
    ctx.moveTo(s * (dx - 0.07), -s * 0.6)
    ctx.lineTo(s * dx, -s * 0.78)
    ctx.lineTo(s * (dx + 0.07), -s * 0.6)
    ctx.fill()
  }
  ctx.fillStyle = '#c8ff4a'
  ctx.beginPath()
  ctx.ellipse(s * 0.6, -s * 0.52, s * 0.035, s * 0.025, 0, 0, Math.PI * 2)
  ctx.fill()
}

function glitch(t: number): number {
  return t > GLITCH[0] && t < GLITCH[1] ? 1 : 0
}

export const dejavuShow: Show = {
  duration: 5.8,
  app: (t): AppLook => (glitch(t) ? { transform: `translateX(${Math.sin(t * 90) * 8}px)`, filter: 'hue-rotate(90deg) contrast(1.4)' } : {}),
  start(g) {
    const { ctx } = g
    const r = rng(2)
    return (t) => {
      const { w, h } = g
      ctx.fillStyle = 'rgba(10, 12, 20, 0.55)'
      ctx.fillRect(0, 0, w, h)
      const s = Math.min(w, h) * 0.2
      for (const start of WALKS) {
        const p = span(t, start, start + WALK)
        if (p <= 0 || p >= 1) continue
        const x = -s + p * (w + s * 2)
        ctx.save()
        ctx.translate(x, h * 0.72 + Math.abs(Math.sin(p * 30)) * -3)
        cat(ctx, s, p * 30)
        ctx.restore()
      }
      if (glitch(t)) {
        for (let i = 0; i < 14; i++) {
          const y = r() * h
          const bh = r.range(4, 40)
          ctx.fillStyle = r.pick(['rgba(255, 0, 80, 0.35)', 'rgba(0, 255, 220, 0.35)', 'rgba(255, 255, 255, 0.25)'])
          ctx.fillRect(r.spread(40), y, w, bh)
        }
      }
      const a = span(t, 2.4, 2.7)
      if (a > 0) {
        const size = Math.min(w, h) * 0.12
        const jitter = glitch(t) ? r.spread(10) : Math.sin(t * 40) * 1.5
        ctx.save()
        ctx.globalAlpha = a
        ctx.font = `900 ${size}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const word = g.say({ en: 'Déjà vu', uk: 'Дежавю' })
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = 'rgba(255, 0, 80, 0.85)'
        ctx.fillText(word, w / 2 - 4 + jitter, h * 0.36)
        ctx.fillStyle = 'rgba(0, 230, 255, 0.85)'
        ctx.fillText(word, w / 2 + 4 - jitter, h * 0.36)
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(word, w / 2, h * 0.36)
        ctx.restore()
      }
    }
  }
}
