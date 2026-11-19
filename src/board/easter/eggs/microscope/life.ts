/** Little water life for the microscope: cells with beating cilia, bacteria with whip tails, diatoms. */

type Ctx = CanvasRenderingContext2D

export interface Microbe {
  kind: 'cell' | 'bacterium' | 'diatom'
  x: number
  y: number
  s: number
  heading: number
  speed: number
  hue: number
  phase: number
}

function cell(ctx: Ctx, m: Microbe, t: number): void {
  const { s } = m
  const edge = (a: number): number => s * (1 + 0.08 * Math.sin(3 * a + t * 2 + m.phase) + 0.05 * Math.sin(5 * a - t * 3))
  ctx.beginPath()
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2
    ctx.lineTo(Math.cos(a) * edge(a), Math.sin(a) * edge(a) * 0.72)
  }
  const body = ctx.createRadialGradient(-s * 0.3, -s * 0.2, s * 0.1, 0, 0, s * 1.1)
  body.addColorStop(0, `hsla(${m.hue}, 70%, 82%, 0.35)`)
  body.addColorStop(1, `hsla(${m.hue}, 65%, 52%, 0.55)`)
  ctx.fillStyle = body
  ctx.fill()
  ctx.strokeStyle = `hsla(${m.hue}, 60%, 30%, 0.75)`
  ctx.lineWidth = 2
  ctx.stroke()
  // Cilia beating in a wave round the edge.
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    const bend = Math.sin(t * 9 + i * 0.7) * 0.35
    const r0 = edge(a)
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.72)
    ctx.lineTo(Math.cos(a + bend * 0.15) * (r0 + s * 0.16), Math.sin(a + bend * 0.15) * (r0 + s * 0.16) * 0.72)
  }
  ctx.stroke()
  ctx.fillStyle = `hsla(${m.hue + 40}, 45%, 32%, 0.8)`
  ctx.beginPath()
  ctx.ellipse(s * 0.2, -s * 0.05, s * 0.28, s * 0.22, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `hsla(${m.hue + 40}, 50%, 20%, 0.9)`
  ctx.beginPath()
  ctx.arc(s * 0.24, -s * 0.06, s * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `hsla(${m.hue - 30}, 60%, 40%, 0.55)`
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7 + m.phase
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.3, s * 0.08, s * 0.05, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

function bacterium(ctx: Ctx, m: Microbe, t: number): void {
  const { s } = m
  ctx.strokeStyle = `hsla(${m.hue}, 50%, 30%, 0.7)`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i <= 30; i++) {
    const x = -s * 0.8 - (i / 30) * s * 1.6
    ctx.lineTo(x, Math.sin(i * 0.6 - t * 14) * s * 0.18 * (i / 30))
  }
  ctx.stroke()
  const g = ctx.createLinearGradient(0, -s * 0.25, 0, s * 0.25)
  g.addColorStop(0, `hsla(${m.hue}, 70%, 75%, 0.9)`)
  g.addColorStop(1, `hsla(${m.hue}, 60%, 42%, 0.9)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(-s * 0.8, -s * 0.24, s * 1.6, s * 0.48, s * 0.24)
  ctx.fill()
  ctx.strokeStyle = `hsla(${m.hue}, 60%, 28%, 0.8)`
  ctx.stroke()
}

function diatom(ctx: Ctx, m: Microbe, t: number): void {
  const { s } = m
  ctx.rotate(t * 0.3 + m.phase)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s)
  g.addColorStop(0, 'rgba(255, 236, 170, 0.75)')
  g.addColorStop(1, 'rgba(190, 140, 50, 0.6)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, s, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 80, 20, 0.7)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    ctx.moveTo(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25)
    ctx.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95)
  }
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, s, 0, Math.PI * 2)
  ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2)
  ctx.stroke()
}

const PAINT = { cell, bacterium, diatom }

export function microbe(ctx: Ctx, m: Microbe, t: number): void {
  ctx.save()
  ctx.translate(m.x, m.y)
  ctx.rotate(m.heading)
  PAINT[m.kind](ctx, m, t)
  ctx.restore()
}
