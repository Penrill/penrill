import { starPath } from '../../gfx/paint'

/** The reel symbols of the slot machine, drawn as vectors centred on (0, 0) in a cell of height `s`. */

export const SEVEN = 0
type Ctx = CanvasRenderingContext2D

function seven(ctx: Ctx, s: number): void {
  ctx.save()
  ctx.transform(1, 0, -0.14, 1, 0, 0)
  ctx.font = `900 ${s * 0.8}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ffd34d'
  ctx.lineWidth = s * 0.07
  ctx.strokeText('7', 0, s * 0.04)
  const g = ctx.createLinearGradient(0, -s * 0.35, 0, s * 0.35)
  g.addColorStop(0, '#ff6b6b')
  g.addColorStop(0.5, '#e8102a')
  g.addColorStop(1, '#9c0014')
  ctx.fillStyle = g
  ctx.fillText('7', 0, s * 0.04)
  ctx.restore()
}

function cherry(ctx: Ctx, s: number): void {
  ctx.strokeStyle = '#2f7d32'
  ctx.lineWidth = s * 0.045
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.15, s * 0.08)
  ctx.quadraticCurveTo(-s * 0.08, -s * 0.2, s * 0.06, -s * 0.3)
  ctx.moveTo(s * 0.15, s * 0.12)
  ctx.quadraticCurveTo(s * 0.12, -s * 0.1, s * 0.06, -s * 0.3)
  ctx.stroke()
  ctx.fillStyle = '#4caf50'
  ctx.beginPath()
  ctx.ellipse(s * 0.17, -s * 0.3, s * 0.12, s * 0.05, -0.4, 0, Math.PI * 2)
  ctx.fill()
  for (const [x, y] of [
    [-s * 0.15, s * 0.16],
    [s * 0.15, s * 0.2]
  ]) {
    const g = ctx.createRadialGradient(x - s * 0.06, y - s * 0.06, s * 0.02, x, y, s * 0.18)
    g.addColorStop(0, '#ff8a8a')
    g.addColorStop(0.5, '#e01b34')
    g.addColorStop(1, '#8a0016')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, s * 0.17, 0, Math.PI * 2)
    ctx.fill()
  }
}

function bell(ctx: Ctx, s: number): void {
  const g = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, 0)
  g.addColorStop(0, '#b8860b')
  g.addColorStop(0.4, '#ffe680')
  g.addColorStop(1, '#c08a10')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-s * 0.3, s * 0.18)
  ctx.bezierCurveTo(-s * 0.25, -s * 0.05, -s * 0.2, -s * 0.3, 0, -s * 0.3)
  ctx.bezierCurveTo(s * 0.2, -s * 0.3, s * 0.25, -s * 0.05, s * 0.3, s * 0.18)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#a87808'
  ctx.beginPath()
  ctx.roundRect(-s * 0.34, s * 0.15, s * 0.68, s * 0.08, s * 0.04)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, s * 0.28, s * 0.06, 0, Math.PI * 2)
  ctx.arc(0, -s * 0.33, s * 0.045, 0, Math.PI * 2)
  ctx.fill()
}

function bar(ctx: Ctx, s: number): void {
  ctx.fillStyle = '#1c1c22'
  ctx.strokeStyle = '#ffd34d'
  ctx.lineWidth = s * 0.03
  ctx.beginPath()
  ctx.roundRect(-s * 0.36, -s * 0.15, s * 0.72, s * 0.3, s * 0.06)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 ${s * 0.21}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('BAR', 0, s * 0.01)
}

function diamond(ctx: Ctx, s: number): void {
  const pts: Array<[number, number]> = [
    [-s * 0.3, -s * 0.08],
    [-s * 0.15, -s * 0.27],
    [s * 0.15, -s * 0.27],
    [s * 0.3, -s * 0.08],
    [0, s * 0.3]
  ]
  const g = ctx.createLinearGradient(0, -s * 0.27, 0, s * 0.3)
  g.addColorStop(0, '#c9f6ff')
  g.addColorStop(0.5, '#33c3e8')
  g.addColorStop(1, '#0a6f9c')
  ctx.fillStyle = g
  ctx.beginPath()
  pts.forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.lineWidth = s * 0.015
  ctx.beginPath()
  ctx.moveTo(-s * 0.3, -s * 0.08)
  ctx.lineTo(s * 0.3, -s * 0.08)
  ctx.moveTo(-s * 0.08, -s * 0.08)
  ctx.lineTo(0, s * 0.3)
  ctx.lineTo(s * 0.08, -s * 0.08)
  ctx.stroke()
}

function star(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(-s * 0.05, -s * 0.08, s * 0.02, 0, 0, s * 0.32)
  g.addColorStop(0, '#fff7c2')
  g.addColorStop(1, '#f5a800')
  ctx.fillStyle = g
  starPath(ctx, 0, s * 0.02, s * 0.32, s * 0.14)
  ctx.fill()
}

const PAINT = [seven, cherry, bell, bar, diamond, star]

/** The order of symbols round each reel. */
export const STRIP = [1, 2, 3, SEVEN, 4, 5, 2, 1, 3, 4]

export function symbol(ctx: Ctx, kind: number, s: number): void {
  ctx.save()
  PAINT[kind](ctx, s)
  ctx.restore()
}
