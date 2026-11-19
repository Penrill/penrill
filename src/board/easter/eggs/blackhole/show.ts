import type { AppLook, Show } from '../../core/egg'
import { inCubic, outCubic, outElastic, span } from '../../gfx/ease'
import { additive, caption, glow, hsla } from '../../gfx/paint'
import { rng } from '../../gfx/rng'

/**
 * Division by zero opens a black hole: an accretion disk of a thousand glowing grains swirls round a
 * black sphere with a bright photon ring, stars streak inwards, and the whole app is pulled in,
 * spiralling, until it is spat back out with a flash.
 */
const SWALLOW = [1, 4.4]
const BACK = 6.2

interface Grain {
  r: number
  a: number
  speed: number
  size: number
}

/** Hot near the hole, cooler further out. */
const heat = (k: number, a: number): string => (k < 0.25 ? `rgba(255, 246, 225, ${a})` : hsla(32 - k * 22, 100, 70 - k * 22, a))

export const blackholeShow: Show = {
  duration: 8.4,
  toastAt: 7.4,
  app: (t) => swallow(t),
  start(g) {
    const { ctx } = g
    const r = rng(0)
    const grains: Grain[] = Array.from({ length: 1800 }, () => ({ r: r.range(1.15, 3.6), a: r.range(0, Math.PI * 2), speed: r.range(0.8, 1.2), size: r.range(0.6, 1.8) }))
    const streaks = Array.from({ length: 140 }, () => ({ a: r.range(0, Math.PI * 2), d: r.range(0.3, 1.4), v: r.range(0.15, 0.4) }))
    return (t, dt) => {
      const { w, h } = g
      const cx = w / 2
      const cy = h / 2
      const space = span(t, 0, 1.4)
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2)
      bg.addColorStop(0, `rgba(10, 6, 20, ${0.95 * space})`)
      bg.addColorStop(1, `rgba(2, 2, 8, ${0.97 * space})`)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      const R = Math.min(w, h) * 0.085 * outCubic(span(t, 0.2, 1.4)) * (1 - 0.15 * span(t, BACK, BACK + 0.4))
      if (R < 1) return
      // Stars falling in.
      const far = Math.hypot(w, h) / 2
      additive(ctx, () => {
        ctx.lineCap = 'round'
        for (const s of streaks) {
          s.d -= s.v * dt * (1 + 2 / Math.max(0.2, s.d))
          if (s.d < R / far) s.d = 1.4
          const x = cx + Math.cos(s.a) * s.d * far
          const y = cy + Math.sin(s.a) * s.d * far
          const len = Math.min(60, 8 / s.d)
          ctx.strokeStyle = `rgba(200, 215, 255, ${0.5 * space})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + Math.cos(s.a) * len, y + Math.sin(s.a) * len)
          ctx.stroke()
        }
      })
      // The disk, tilted: the far half behind the hole, the near half in front.
      const tilt = 0.26
      for (const p of grains) {
        p.a += (p.speed * 2.2 * dt) / p.r ** 1.5
        p.r -= dt * 0.03 * (t > 1.4 ? 1 : 0)
        if (p.r < 1.1) p.r = 3.6
      }
      const paintDisk = (front: boolean): void =>
        additive(ctx, () => {
          // The glowing body of the disk under the grains, squashed by the tilt.
          ctx.save()
          ctx.translate(cx, cy)
          ctx.scale(1, tilt)
          ctx.beginPath()
          ctx.rect(-w, front ? 0 : -h * 4, w * 2, h * 4)
          ctx.clip()
          const body = ctx.createRadialGradient(0, 0, R * 1.2, 0, 0, R * 6)
          body.addColorStop(0, 'rgba(255, 244, 214, 0.85)')
          body.addColorStop(0.18, 'rgba(255, 176, 74, 0.55)')
          body.addColorStop(0.5, 'rgba(214, 74, 24, 0.2)')
          body.addColorStop(1, 'rgba(120, 20, 10, 0)')
          ctx.fillStyle = body
          ctx.beginPath()
          ctx.arc(0, 0, R * 6, 0, Math.PI * 2)
          ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2, true)
          ctx.fill()
          ctx.restore()
          for (const p of grains) {
            const y = Math.sin(p.a)
            if (y > 0 !== front) continue
            const k = (p.r - 1.1) / 2.5
            const doppler = 0.55 + 0.45 * Math.cos(p.a + 0.4)
            ctx.fillStyle = heat(k, (0.25 + 0.75 * doppler) * (1 - k * 0.6))
            ctx.beginPath()
            ctx.arc(cx + Math.cos(p.a) * p.r * R * 1.6, cy + y * p.r * R * 1.6 * tilt, p.size * (0.6 + doppler * 0.6), 0, Math.PI * 2)
            ctx.fill()
          }
        })
      paintDisk(false)
      // The light bent over the top and under the bottom of the hole.
      additive(ctx, () => {
        ctx.lineWidth = R * 0.16
        ctx.shadowColor = '#ff9a3a'
        ctx.shadowBlur = R * 0.8
        const lens = ctx.createLinearGradient(0, cy - R * 1.4, 0, cy + R * 1.4)
        lens.addColorStop(0, 'rgba(255, 214, 150, 0.75)')
        lens.addColorStop(0.5, 'rgba(255, 150, 60, 0.15)')
        lens.addColorStop(1, 'rgba(255, 190, 110, 0.45)')
        ctx.strokeStyle = lens
        ctx.beginPath()
        ctx.ellipse(cx, cy, R * 1.42, R * 1.3, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.shadowBlur = 0
      })
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()
      additive(ctx, () => {
        ctx.strokeStyle = 'rgba(255, 236, 200, 0.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2)
        ctx.stroke()
      })
      paintDisk(true)
      // Spat back out.
      const flash = 1 - span(t, BACK, BACK + 0.6)
      if (t > BACK) {
        additive(ctx, () => glow(ctx, cx, cy, Math.min(w, h) * (0.2 + (1 - flash) * 0.9), '#ffffff', flash))
        ctx.strokeStyle = `rgba(255, 255, 255, ${flash})`
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(cx, cy, R + (1 - flash) * far, 0, Math.PI * 2)
        ctx.stroke()
      }
      caption(ctx, '÷ 0', cx, cy - R * 3.4, Math.min(w, h) * 0.07, '#ffd9a8', span(t, 0.8, 1.4) * (1 - span(t, 3.6, 4.2)), 800)
      caption(ctx, g.say({ en: 'You can’t divide by zero. Now you know why.', uk: 'Ділити на нуль не можна. Тепер ясно чому.' }), cx, h * 0.84, Math.min(w, h) * 0.035, '#ffe3c4', span(t, 6.6, 7.2))
    }
  }
}

/** The app spirals into the hole, waits there, and comes back with a spring. */
function swallow(t: number): AppLook {
  if (t < SWALLOW[0]) return {}
  const inward = inCubic(span(t, SWALLOW[0], SWALLOW[1]))
  const back = outElastic(span(t, BACK, BACK + 1.2))
  const scale = Math.max(0.001, (1 - inward) * (1 - back) + back)
  const turn = inward * 540 * (1 - back)
  return {
    transform: `scale(${scale}) rotate(${turn}deg)`,
    filter: inward > 0 && back < 1 ? `blur(${inward * 4 * (1 - back)}px) brightness(${1 - inward * 0.4 * (1 - back)})` : '',
    origin: '50% 50%'
  }
}
