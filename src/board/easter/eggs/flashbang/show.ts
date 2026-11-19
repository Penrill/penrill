import type { AppLook, Show } from '../../core/egg'
import { outBounce, span } from '../../gfx/ease'
import { caption, faded } from '../../gfx/paint'

/**
 * The light theme in the middle of the night: a blinding white-out that fades slowly, the app
 * blurred and over-bright behind it, a coloured afterimage drifting where the glare was, a thin
 * ringing tone, and finally a pair of sunglasses drops in to help.
 */
type Ctx = CanvasRenderingContext2D

/** How white the screen still is. */
const glare = (t: number): number => (t < 0.12 ? 1 : Math.max(0, 1 - span(t, 0.12, 3.4)) ** 1.8)

function afterimage(ctx: Ctx, w: number, h: number, t: number): void {
  const a = Math.max(0, 1 - span(t, 0.6, 5)) * Math.min(1, t * 2)
  if (a <= 0) return
  const x = w / 2 + Math.sin(t * 0.7) * w * 0.04
  const y = h / 2 + Math.cos(t * 0.5) * h * 0.03
  const r = Math.min(w, h) * 0.32
  for (const [dx, colour] of [
    [-0.08, '120, 255, 230'],
    [0.08, '255, 120, 230']
  ] as const) {
    const g = ctx.createRadialGradient(x + dx * r, y, 0, x + dx * r, y, r)
    g.addColorStop(0, `rgba(${colour}, ${0.42 * a})`)
    g.addColorStop(1, `rgba(${colour}, 0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

function sunglasses(ctx: Ctx, s: number): void {
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(side * s * 0.52, 0)
    const g = ctx.createLinearGradient(0, -s * 0.3, 0, s * 0.3)
    g.addColorStop(0, '#2a2f3a')
    g.addColorStop(1, '#06070a')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(-s * 0.46, -s * 0.24)
    ctx.lineTo(s * 0.46, -s * 0.24)
    ctx.quadraticCurveTo(s * 0.46, s * 0.3, 0, s * 0.3)
    ctx.quadraticCurveTo(-s * 0.46, s * 0.3, -s * 0.46, -s * 0.24)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = s * 0.05
    ctx.beginPath()
    ctx.moveTo(-s * 0.26, -s * 0.12)
    ctx.lineTo(-s * 0.08, s * 0.12)
    ctx.stroke()
    ctx.restore()
  }
  ctx.fillStyle = '#0a0b10'
  ctx.fillRect(-s * 0.1, -s * 0.24, s * 0.2, s * 0.07)
  ctx.fillRect(-s * 1.0, -s * 0.24, s * 2.0, s * 0.06)
}

export const flashbangShow: Show = {
  duration: 7,
  app: (t): AppLook => {
    const k = glare(t)
    return k > 0.01 ? { filter: `blur(${k * 8}px) brightness(${1 + k * 1.5})` } : {}
  },
  start(g) {
    const { ctx } = g
    return (t) => {
      const { w, h } = g
      const k = glare(t)
      ctx.fillStyle = `rgba(255, 255, 255, ${k})`
      ctx.fillRect(0, 0, w, h)
      afterimage(ctx, w, h, t)
      // The ringing in the ears.
      const ring = Math.max(0, 1 - span(t, 0.3, 4.5))
      if (ring > 0) {
        ctx.strokeStyle = `rgba(90, 100, 120, ${0.6 * ring})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h * 0.8 + Math.sin(x * 0.12 + t * 60) * 10 * ring)
        ctx.stroke()
        caption(ctx, g.say({ en: 'eeeeeeeeeeee…', uk: 'іііііііііііі…' }), w / 2, h * 0.8 - 30, 18, '#5a6378', ring, 500)
      }
      const shout = span(t, 1.6, 2)
      ctx.save()
      ctx.translate(w / 2 + (Math.random() - 0.5) * 6 * shout * (1 - span(t, 2, 3.5)), h * 0.3)
      faded(ctx, shout, () => {
        ctx.font = `900 ${Math.min(w, h) * 0.11}px system-ui, -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 10
        ctx.strokeText(g.say({ en: 'My eyes!', uk: 'Мої очі!' }), 0, 0)
        ctx.fillStyle = '#1d2033'
        ctx.fillText(g.say({ en: 'My eyes!', uk: 'Мої очі!' }), 0, 0)
      })
      ctx.restore()
      const drop = outBounce(span(t, 3.4, 4.4))
      if (t > 3.4) {
        ctx.save()
        ctx.translate(w / 2, -h * 0.2 + drop * h * 0.72)
        ctx.rotate((1 - drop) * 0.4)
        sunglasses(ctx, Math.min(w, h) * 0.16)
        ctx.restore()
      }
      caption(ctx, g.say({ en: 'Light theme at this hour? Bold.', uk: 'Світла тема о такій порі? Сміливо.' }), w / 2, h * 0.68, Math.min(w, h) * 0.035, '#1d2033', span(t, 4.4, 5), 650)
    }
  }
}
