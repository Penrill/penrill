import type { Show } from '../../core/egg'
import { outCubic, outElastic, span } from '../../gfx/ease'
import { additive, backdrop, rays, sparkle, title } from '../../gfx/paint'
import { coin, confetti, confettiBurst, particle, step, type Particle } from '../../gfx/particles'
import { rng } from '../../gfx/rng'
import { layout, machine } from './machine'
import { SEVEN, STRIP } from './symbols'

/**
 * The lever is pulled, the reels spin and land one after another on three sevens; then a flash,
 * turning rays, a gold title, a fountain of coins and confetti from both corners.
 */
const SPIN = 0.85
const STOPS = [2.15, 2.7, 3.25]
const HIT = 3.3
/** Each reel travels whole turns of the strip and lands on the seven. */
const TARGETS = [3, 4, 5].map((turns) => turns * STRIP.length + STRIP.indexOf(SEVEN))

function reelAt(t: number, i: number): { pos: number; speed: number } {
  const len = STOPS[i] - SPIN
  const p = span(t, SPIN, STOPS[i])
  const after = t - STOPS[i]
  const settle = after > 0 ? 0.3 * Math.exp(-after * 8) * Math.sin(after * 22) : 0
  return { pos: TARGETS[i] * outCubic(p) - settle, speed: p < 1 ? (TARGETS[i] * 3 * (1 - p) ** 2) / len : 0 }
}

export const jackpotShow: Show = {
  duration: 10,
  toastAt: 7.6,
  start(g) {
    const { ctx } = g
    const r = rng(777)
    let coins: Particle[] = []
    let bits: Particle[] = []
    let fountain = 0
    let rain = 0
    let burst = 0
    return (t, dt) => {
      const { w, h } = g
      const mw = Math.min(w * 0.56, h * 0.56, 540)
      const cx = w / 2
      const cy = h * 0.56
      const won = t >= HIT
      backdrop(ctx, w, h, 0.85 * span(t, 0, 0.5), '#12020a', 0.6)
      if (won) additive(ctx, () => rays(ctx, cx, cy, 20, Math.hypot(w, h), t * 0.22, '#ffcf4a', 0.28 * span(t, HIT, HIT + 0.5)))

      const pop = outElastic(span(t, 0, 0.9))
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop)
      ctx.translate(-cx, -cy)
      const reels = [0, 1, 2].map((i) => reelAt(t, i))
      const pull = span(t, 0.25, 0.6) - span(t, 0.75, 1.2)
      machine(ctx, cx, cy, mw, { t, pos: reels.map((x) => x.pos), speed: reels.map((x) => x.speed), win: won ? 1 : 0, pull })
      ctx.restore()

      // Coins: a fountain out of the tray, then a shower from the top.
      const tray = layout(cx, cy, mw).tray
      if (won && t < HIT + 1.8) fountain += dt * 46
      if (t > HIT + 0.4 && t < HIT + 4) rain += dt * 20
      for (; fountain >= 1; fountain--)
        coins.push(particle({ x: tray.x + tray.w / 2 + r.spread(tray.w * 0.3), y: tray.y, vx: r.spread(420), vy: -r.range(900, 1400), life: 4, size: r.range(11, 18), flip: r.range(0, 6), flipSpeed: r.range(7, 13), spin: r.spread(3) }))
      for (; rain >= 1; rain--)
        coins.push(particle({ x: r.range(0, w), y: -30, vx: r.spread(60), vy: r.range(80, 300), life: 4, size: r.range(10, 17), flip: r.range(0, 6), flipSpeed: r.range(6, 12) }))
      coins = step(coins, dt, { gravity: 1500 })
      for (const c of coins) coin(ctx, c)

      // Confetti from both bottom corners, twice.
      if ((won && burst === 0) || (t > HIT + 1.7 && burst === 1)) {
        burst++
        bits.push(...confettiBurst(r, 80, 0, h, -Math.PI / 3, 0.35, 1500), ...confettiBurst(r, 80, w, h, (-Math.PI * 2) / 3, 0.35, 1500))
      }
      bits = step(bits, dt, { gravity: 480, drag: 1.1, flutter: 160 })
      for (const b of bits) confetti(ctx, b)

      if (won) {
        const k = outElastic(span(t, HIT + 0.1, HIT + 1.2))
        const ty = cy - mw * 0.66
        ctx.save()
        ctx.translate(cx, ty)
        ctx.scale(k, k)
        ctx.rotate(Math.sin(t * 3) * 0.03)
        title(ctx, 'JACKPOT!', 0, 0, { size: mw * 0.2, fill: ['#fffbe0', '#ffd54a', '#e08a00'], outline: '#5a2a00', outlineWidth: 0.1, glow: '#ffb300', depth: '#3a1200', spacing: 0.04 })
        ctx.restore()
        for (let i = 0; i < 6; i++) {
          const a = t * 1.3 + (i * Math.PI) / 3
          sparkle(ctx, cx + Math.cos(a) * mw * 0.55, ty + Math.sin(a) * mw * 0.12, mw * 0.03 * (0.6 + 0.4 * Math.sin(t * 6 + i)), '#fff6c8', k)
        }
        ctx.fillStyle = `rgba(255, 250, 230, ${0.85 * (1 - span(t, HIT, HIT + 0.45))})`
        ctx.fillRect(0, 0, w, h)
      }
    }
  }
}
