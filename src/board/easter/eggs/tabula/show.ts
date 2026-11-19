import type { Show } from '../../core/egg'
import { outBack, span } from '../../gfx/ease'
import { additive, caption, glow, sparkle, title } from '../../gfx/paint'
import { particle, step, type Particle } from '../../gfx/particles'
import { rng } from '../../gfx/rng'

/**
 * A board wiped clean: a band of light sweeps across like a squeegee and leaves glints behind, then
 * soap bubbles with shimmering rainbow skins float up and pop, under "Tabula rasa".
 */
interface Bubble {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  popAt: number
}

type Ctx = CanvasRenderingContext2D

function bubble(ctx: Ctx, b: Bubble, t: number): void {
  const { x, y, r } = b
  const skin = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
  const hue = (t * 40 + b.phase * 60) % 360
  skin.addColorStop(0, `hsla(${hue}, 90%, 70%, 0.55)`)
  skin.addColorStop(0.5, `hsla(${hue + 120}, 90%, 70%, 0.45)`)
  skin.addColorStop(1, `hsla(${hue + 240}, 90%, 70%, 0.55)`)
  const body = ctx.createRadialGradient(x, y, r * 0.6, x, y, r)
  body.addColorStop(0, 'rgba(255, 255, 255, 0.02)')
  body.addColorStop(1, 'rgba(220, 240, 255, 0.22)')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = skin
  ctx.lineWidth = Math.max(1.2, r * 0.06)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.beginPath()
  ctx.arc(x + r * 0.4, y + r * 0.42, r * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

export const tabulaShow: Show = {
  duration: 7,
  start(g) {
    const { ctx } = g
    const r = rng(42)
    const bubbles: Bubble[] = Array.from({ length: 34 }, () => ({
      x: r.range(0, g.w),
      y: g.h + r.range(20, 500),
      r: r.range(14, 60),
      speed: r.range(60, 150),
      phase: r.range(0, 6.3),
      popAt: r.range(2.2, 6.4)
    }))
    let drops: Particle[] = []
    const glints = Array.from({ length: 26 }, () => ({ x: r(), y: r(), size: r.range(6, 16), at: 0 }))
    return (t, dt) => {
      const { w, h } = g
      ctx.fillStyle = `rgba(10, 30, 60, ${0.35 * span(t, 0, 0.4)})`
      ctx.fillRect(0, 0, w, h)
      // The squeegee of light.
      const sweep = span(t, 0.2, 1.2)
      if (sweep > 0 && sweep < 1) {
        const x = -w * 0.3 + sweep * w * 1.6
        const band = ctx.createLinearGradient(x - w * 0.18, 0, x + w * 0.06, 0)
        band.addColorStop(0, 'rgba(255, 255, 255, 0)')
        band.addColorStop(0.8, 'rgba(230, 248, 255, 0.55)')
        band.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.save()
        ctx.transform(1, 0, -0.35, 1, h * 0.17, 0)
        ctx.fillStyle = band
        ctx.fillRect(x - w * 0.18, 0, w * 0.24, h)
        ctx.restore()
      }
      for (const gl of glints) {
        const gx = gl.x * w
        if (!gl.at && sweep * w * 1.6 - w * 0.3 > gx) gl.at = t
        if (gl.at) sparkle(ctx, gx, gl.y * h, gl.size * (1 - span(t, gl.at, gl.at + 1.4)), '#ffffff', 1 - span(t, gl.at, gl.at + 1.4))
      }
      for (const b of bubbles) {
        if (t > b.popAt) {
          if (b.r > 0) {
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2
              drops.push(particle({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.5, size: 2 }))
            }
            b.r = 0
          }
          continue
        }
        if (t < 0.8) continue
        b.y -= b.speed * dt
        b.x += Math.sin(t * 1.5 + b.phase) * 20 * dt
        bubble(ctx, b, t)
      }
      drops = step(drops, dt, { gravity: 300, drag: 1 })
      additive(ctx, () => {
        for (const d of drops) {
          ctx.fillStyle = `rgba(210, 240, 255, ${1 - d.age / d.life})`
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      const k = outBack(span(t, 1.2, 1.9))
      additive(ctx, () => glow(ctx, w / 2, h * 0.42, Math.min(w, h) * 0.3 * k, '#7fd8ff', 0.35))
      ctx.save()
      ctx.translate(w / 2, h * 0.42)
      ctx.scale(k, k)
      title(ctx, 'Tabula rasa', 0, 0, { size: Math.min(w * 0.11, h * 0.13), weight: 400, font: 'Georgia, "Times New Roman", serif', fill: ['#ffffff', '#d6f1ff', '#9fd9ff'], glow: '#5ac8ff', depth: 'rgba(0, 40, 80, 0.4)' })
      ctx.restore()
      caption(ctx, g.say({ en: 'A clean slate. Start afresh.', uk: 'Чистий аркуш. Можна починати спочатку.' }), w / 2, h * 0.42 + Math.min(w * 0.11, h * 0.13) * 0.85, Math.min(w, h) * 0.035, '#e8f6ff', span(t, 1.8, 2.4), 550)
    }
  }
}
