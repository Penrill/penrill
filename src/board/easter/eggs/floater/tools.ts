/** School things floating in low gravity, drawn centred on (0, 0) at size `s`. */

type Ctx = CanvasRenderingContext2D

function pencil(ctx: Ctx, s: number): void {
  ctx.fillStyle = '#ffc928'
  ctx.fillRect(-s * 0.5, -s * 0.07, s * 0.8, s * 0.14)
  ctx.fillStyle = '#e8a800'
  ctx.fillRect(-s * 0.5, s * 0.02, s * 0.8, s * 0.05)
  ctx.fillStyle = '#c9cfd8'
  ctx.fillRect(-s * 0.58, -s * 0.07, s * 0.1, s * 0.14)
  ctx.fillStyle = '#ff8fa3'
  ctx.beginPath()
  ctx.roundRect(-s * 0.72, -s * 0.07, s * 0.15, s * 0.14, s * 0.04)
  ctx.fill()
  ctx.fillStyle = '#f2d2a0'
  ctx.beginPath()
  ctx.moveTo(s * 0.3, -s * 0.07)
  ctx.lineTo(s * 0.52, 0)
  ctx.lineTo(s * 0.3, s * 0.07)
  ctx.fill()
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.moveTo(s * 0.45, -s * 0.022)
  ctx.lineTo(s * 0.52, 0)
  ctx.lineTo(s * 0.45, s * 0.022)
  ctx.fill()
}

function ruler(ctx: Ctx, s: number): void {
  ctx.fillStyle = 'rgba(255, 228, 120, 0.85)'
  ctx.strokeStyle = 'rgba(160, 120, 20, 0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(-s * 0.6, -s * 0.1, s * 1.2, s * 0.2, s * 0.02)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i <= 20; i++) {
    const x = -s * 0.55 + (i / 20) * s * 1.1
    ctx.moveTo(x, -s * 0.1)
    ctx.lineTo(x, -s * 0.1 + (i % 5 === 0 ? s * 0.09 : s * 0.05))
  }
  ctx.stroke()
}

function setSquare(ctx: Ctx, s: number): void {
  ctx.fillStyle = 'rgba(120, 190, 255, 0.45)'
  ctx.strokeStyle = 'rgba(40, 110, 200, 0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-s * 0.45, s * 0.35)
  ctx.lineTo(s * 0.45, s * 0.35)
  ctx.lineTo(-s * 0.45, -s * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-s * 0.3, s * 0.22)
  ctx.lineTo(s * 0.1, s * 0.22)
  ctx.lineTo(-s * 0.3, -s * 0.12)
  ctx.closePath()
  ctx.stroke()
}

function protractor(ctx: Ctx, s: number): void {
  ctx.fillStyle = 'rgba(255, 160, 210, 0.45)'
  ctx.strokeStyle = 'rgba(200, 60, 130, 0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, s * 0.2, s * 0.5, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI
    ctx.moveTo(Math.cos(a) * s * 0.5, s * 0.2 + Math.sin(a) * s * 0.5)
    ctx.lineTo(Math.cos(a) * s * 0.42, s * 0.2 + Math.sin(a) * s * 0.42)
  }
  ctx.stroke()
}

function ball(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(-s * 0.12, -s * 0.12, s * 0.02, 0, 0, s * 0.3)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#ff6b6b')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2)
  ctx.fill()
}

function eraser(ctx: Ctx, s: number): void {
  ctx.fillStyle = '#ff9fb3'
  ctx.beginPath()
  ctx.roundRect(-s * 0.3, -s * 0.13, s * 0.36, s * 0.26, s * 0.04)
  ctx.fill()
  ctx.fillStyle = '#5a8dee'
  ctx.beginPath()
  ctx.roundRect(s * 0.02, -s * 0.13, s * 0.28, s * 0.26, s * 0.04)
  ctx.fill()
}

export const TOOLS = [pencil, ruler, setSquare, protractor, ball, eraser]
