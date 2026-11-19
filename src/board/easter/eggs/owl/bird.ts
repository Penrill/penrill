/** The owl, drawn centred on its body; `s` is its height. */

type Ctx = CanvasRenderingContext2D

export interface OwlPose {
  /** 0 folded, 1 wings raised. */
  wing: number
  /** 0 eyes open, 1 shut. */
  blink: number
  /** Head tilt, rad. */
  tilt: number
  perched: boolean
}

function wingShape(ctx: Ctx, s: number, side: number, lift: number): void {
  ctx.save()
  ctx.translate(side * s * 0.24, -s * 0.12)
  ctx.rotate(side * (0.15 - lift * 1.9))
  const g = ctx.createLinearGradient(0, 0, 0, s * 0.6)
  g.addColorStop(0, '#6d4524')
  g.addColorStop(1, '#3f2612')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(side * s * 0.06, s * 0.24, s * 0.13, s * 0.36, side * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(240, 210, 160, 0.35)'
  ctx.lineWidth = s * 0.012
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.arc(side * s * 0.06, s * (0.1 + i * 0.12), s * 0.1, 0.4, Math.PI - 0.4)
    ctx.stroke()
  }
  ctx.restore()
}

export function owl(ctx: Ctx, s: number, p: OwlPose): void {
  wingShape(ctx, s, -1, p.wing)
  wingShape(ctx, s, 1, p.wing)
  const body = ctx.createRadialGradient(-s * 0.1, -s * 0.15, s * 0.05, 0, 0, s * 0.55)
  body.addColorStop(0, '#9a6a3a')
  body.addColorStop(1, '#4d3016')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.32, s * 0.44, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e2c597'
  ctx.beginPath()
  ctx.ellipse(0, s * 0.1, s * 0.21, s * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(110, 70, 30, 0.6)'
  ctx.lineWidth = s * 0.014
  for (let row = 0; row < 4; row++)
    for (let k = -1; k <= 1; k++) {
      const x = k * s * 0.09 + (row % 2) * s * 0.045
      const y = -s * 0.05 + row * s * 0.08
      ctx.beginPath()
      ctx.moveTo(x - s * 0.025, y)
      ctx.lineTo(x, y + s * 0.025)
      ctx.lineTo(x + s * 0.025, y)
      ctx.stroke()
    }
  if (p.perched) {
    ctx.fillStyle = '#f0a020'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(side * s * 0.1, s * 0.43, s * 0.07, s * 0.035, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Head.
  ctx.save()
  ctx.translate(0, -s * 0.4)
  ctx.rotate(p.tilt)
  ctx.fillStyle = '#7a4f28'
  ctx.beginPath()
  ctx.moveTo(-s * 0.26, -s * 0.12)
  ctx.lineTo(-s * 0.22, -s * 0.34)
  ctx.lineTo(-s * 0.1, -s * 0.2)
  ctx.lineTo(s * 0.1, -s * 0.2)
  ctx.lineTo(s * 0.22, -s * 0.34)
  ctx.lineTo(s * 0.26, -s * 0.12)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.3, s * 0.24, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const side of [-1, 1]) {
    const x = side * s * 0.12
    ctx.fillStyle = '#ead3a8'
    ctx.beginPath()
    ctx.arc(x, 0, s * 0.125, 0, Math.PI * 2)
    ctx.fill()
    const eye = ctx.createRadialGradient(x, 0, 0, x, 0, s * 0.085)
    eye.addColorStop(0, '#ffe066')
    eye.addColorStop(1, '#ff9a00')
    ctx.fillStyle = eye
    ctx.beginPath()
    ctx.arc(x, 0, s * 0.085, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#120a04'
    ctx.beginPath()
    ctx.arc(x + side * s * 0.008, s * 0.006, s * 0.048, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x - s * 0.02, -s * 0.022, s * 0.016, 0, Math.PI * 2)
    ctx.fill()
    if (p.blink > 0) {
      ctx.fillStyle = '#7a4f28'
      ctx.beginPath()
      ctx.ellipse(x, -s * 0.09 + p.blink * s * 0.09, s * 0.095, s * 0.095 * p.blink, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.fillStyle = '#f0a020'
  ctx.beginPath()
  ctx.moveTo(-s * 0.035, s * 0.06)
  ctx.lineTo(s * 0.035, s * 0.06)
  ctx.lineTo(0, s * 0.14)
  ctx.fill()
  ctx.restore()
}
