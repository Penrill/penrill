import { additive, glow } from '../../gfx/paint'
import { STRIP, symbol } from './symbols'

/** The slot machine: a lacquered cabinet with a light-bulb marquee, three reels and a lever. */

type Ctx = CanvasRenderingContext2D

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Where the machine and its parts are, for a machine of width `mw` centred at (cx, cy). */
export function layout(cx: number, cy: number, mw: number): { body: Box; marquee: Box; window: Box; tray: Box; pivot: [number, number] } {
  const mh = mw * 0.82
  const body = { x: cx - mw / 2, y: cy - mh / 2, w: mw, h: mh }
  return {
    body,
    marquee: { x: body.x + mw * 0.12, y: body.y - mh * 0.2, w: mw * 0.76, h: mh * 0.24 },
    window: { x: body.x + mw * 0.08, y: body.y + mh * 0.14, w: mw * 0.84, h: mh * 0.46 },
    tray: { x: body.x + mw * 0.26, y: body.y + mh * 0.8, w: mw * 0.48, h: mh * 0.1 },
    pivot: [body.x + mw + mw * 0.035, body.y + mh * 0.5]
  }
}

function gold(ctx: Ctx, b: Box): CanvasGradient {
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
  g.addColorStop(0, '#fff1a8')
  g.addColorStop(0.4, '#e2b23a')
  g.addColorStop(1, '#a8740c')
  return g
}

function panel(ctx: Ctx, b: Box, r: number, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, r)
  ctx.fill()
  ctx.strokeStyle = gold(ctx, b)
  ctx.lineWidth = Math.max(3, b.w * 0.012)
  ctx.stroke()
}

/** Bulbs round the marquee; `lit(i)` says which are on. */
function bulbs(ctx: Ctx, b: Box, lit: (i: number) => boolean): void {
  const pts: Array<[number, number]> = []
  const across = 11
  const down = 3
  for (let i = 0; i <= across; i++) pts.push([b.x + (b.w * i) / across, b.y])
  for (let i = 1; i <= down; i++) pts.push([b.x + b.w, b.y + (b.h * i) / down])
  for (let i = across - 1; i >= 0; i--) pts.push([b.x + (b.w * i) / across, b.y + b.h])
  for (let i = down - 1; i >= 1; i--) pts.push([b.x, b.y + (b.h * i) / down])
  const r = b.w * 0.016
  pts.forEach(([x, y], i) => {
    const on = lit(i)
    ctx.fillStyle = on ? '#fff6cf' : '#7a5a1c'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    if (on) additive(ctx, () => glow(ctx, x, y, r * 5, '#ffcf4a', 0.75))
  })
}

/** One reel at `pos` (in symbols); `speed` in symbols per second smears it while it spins. */
function reel(ctx: Ctx, b: Box, pos: number, speed: number, win: number): void {
  const cell = b.h / 3
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  g.addColorStop(0, '#9c9aa0')
  g.addColorStop(0.5, '#fbfaf6')
  g.addColorStop(1, '#9c9aa0')
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, b.w * 0.06)
  ctx.clip()
  ctx.fillStyle = g
  ctx.fillRect(b.x, b.y, b.w, b.h)
  const base = Math.floor(pos)
  const smear = Math.min(1, Math.max(0, (speed - 2) / 10))
  for (let j = base - 2; j <= base + 2; j++) {
    const off = j - pos
    const y = cy + off * cell
    const squash = Math.max(0.2, 1 - 0.16 * off * off)
    const kind = STRIP[((j % STRIP.length) + STRIP.length) % STRIP.length]
    const copies = smear > 0 ? 3 : 1
    for (let k = 0; k < copies; k++) {
      ctx.save()
      ctx.globalAlpha = (1 - 0.3 * Math.abs(off)) * (copies > 1 ? 0.45 : 1)
      ctx.translate(cx, y + (k - 1) * cell * 0.22 * smear)
      ctx.scale(1, squash * (1 + smear * 0.5))
      symbol(ctx, kind, cell * 0.95)
      ctx.restore()
    }
  }
  const shade = ctx.createLinearGradient(0, b.y, 0, b.y + b.h)
  shade.addColorStop(0, 'rgba(20, 10, 20, 0.55)')
  shade.addColorStop(0.3, 'rgba(20, 10, 20, 0)')
  shade.addColorStop(0.7, 'rgba(20, 10, 20, 0)')
  shade.addColorStop(1, 'rgba(20, 10, 20, 0.55)')
  ctx.fillStyle = shade
  ctx.fillRect(b.x, b.y, b.w, b.h)
  ctx.restore()
  if (win > 0) additive(ctx, () => glow(ctx, cx, cy, cell * 0.9, '#ffd34d', 0.55 * win))
}

export interface MachineState {
  t: number
  /** Reel positions and speeds. */
  pos: number[]
  speed: number[]
  /** The win: lights the sevens and makes the bulbs flash together. */
  win: number
  /** Lever pulled 0..1. */
  pull: number
}

export function machine(ctx: Ctx, cx: number, cy: number, mw: number, s: MachineState): void {
  const L = layout(cx, cy, mw)
  const { body, marquee, window: win, tray } = L
  // Soft shadow on the floor.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.beginPath()
  ctx.ellipse(cx, body.y + body.h + mw * 0.04, mw * 0.55, mw * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  lever(ctx, L.pivot, mw, s.pull)
  panel(ctx, body, mw * 0.07, '#d81b3c', '#5e0717')
  // Lacquer shine down the left side.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.roundRect(body.x + mw * 0.03, body.y + mw * 0.05, mw * 0.05, body.h - mw * 0.1, mw * 0.03)
  ctx.fill()
  panel(ctx, marquee, mw * 0.05, '#5e0717', '#2a0209')
  const chase = Math.floor(s.t * 12)
  const blink = Math.floor(s.t * 7) % 2 === 0
  bulbs(ctx, marquee, (i) => (s.win > 0 ? blink : (i + chase) % 3 === 0))
  ctx.save()
  ctx.font = `900 ${marquee.h * 0.5}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = '#ffb300'
  ctx.shadowBlur = marquee.h * 0.3
  ctx.fillStyle = gold(ctx, marquee)
  ctx.fillText('LUCKY 7', cx, marquee.y + marquee.h * 0.54)
  ctx.restore()
  panel(ctx, win, mw * 0.03, '#1a0408', '#30060f')
  const gap = win.w * 0.03
  const rw = (win.w - gap * 4) / 3
  for (let i = 0; i < 3; i++) {
    reel(ctx, { x: win.x + gap + i * (rw + gap), y: win.y + gap, w: rw, h: win.h - gap * 2 }, s.pos[i], s.speed[i], s.win * (0.6 + 0.4 * Math.sin(s.t * 10)))
  }
  // The pay line.
  ctx.strokeStyle = `rgba(255, 60, 80, ${0.5 + s.win * 0.5})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(win.x + gap * 0.5, win.y + win.h / 2)
  ctx.lineTo(win.x + win.w - gap * 0.5, win.y + win.h / 2)
  ctx.stroke()
  // Buttons and the coin tray.
  ;['#ff4d6d', '#ffd34d', '#4dd2ff'].forEach((c, i) => {
    const x = body.x + body.w * (0.3 + i * 0.2)
    const y = body.y + body.h * 0.69
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x, y, mw * 0.03, 0, Math.PI * 2)
    ctx.fill()
    additive(ctx, () => glow(ctx, x, y, mw * 0.06, c, 0.35 + 0.3 * s.win))
  })
  panel(ctx, tray, mw * 0.02, '#14020a', '#3a0812')
}

function lever(ctx: Ctx, [px, py]: [number, number], mw: number, pull: number): void {
  const len = mw * 0.4
  const a = -Math.PI / 2 + 0.12 + pull * 2.2
  const ex = px + Math.cos(a) * len
  const ey = py + Math.sin(a) * len
  const g = ctx.createLinearGradient(px - 6, 0, px + 6, 0)
  g.addColorStop(0, '#8a8f99')
  g.addColorStop(0.5, '#f1f3f7')
  g.addColorStop(1, '#7a7f89')
  ctx.strokeStyle = g
  ctx.lineWidth = mw * 0.022
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  const ball = ctx.createRadialGradient(ex - mw * 0.015, ey - mw * 0.015, mw * 0.005, ex, ey, mw * 0.05)
  ball.addColorStop(0, '#ff9a9a')
  ball.addColorStop(0.5, '#e0102a')
  ball.addColorStop(1, '#7a0010')
  ctx.fillStyle = ball
  ctx.beginPath()
  ctx.arc(ex, ey, mw * 0.045, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4a4f59'
  ctx.beginPath()
  ctx.roundRect(px - mw * 0.03, py - mw * 0.05, mw * 0.06, mw * 0.1, mw * 0.02)
  ctx.fill()
}
