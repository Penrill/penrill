/** Planets for the telescope: lit from the upper left, with a soft terminator on the night side. */

type Ctx = CanvasRenderingContext2D

function sphere(ctx: Ctx, x: number, y: number, r: number, colours: [string, string, string]): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x, y, r)
  g.addColorStop(0, colours[0])
  g.addColorStop(0.55, colours[1])
  g.addColorStop(1, colours[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function nightSide(ctx: Ctx, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.6, x - r * 0.2, y - r * 0.2, r * 1.5)
  g.addColorStop(0, 'rgba(0, 0, 10, 0)')
  g.addColorStop(1, 'rgba(0, 0, 10, 0.8)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function bands(ctx: Ctx, x: number, y: number, r: number, list: Array<[number, number, string]>): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  for (const [at, width, colour] of list) {
    ctx.fillStyle = colour
    ctx.fillRect(x - r, y + at * r, r * 2, width * r)
  }
  ctx.restore()
}

export function saturn(ctx: Ctx, x: number, y: number, r: number): void {
  const ring = (front: boolean): void => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.35)
    ctx.beginPath()
    if (front) ctx.rect(-r * 3, 0, r * 6, r * 2)
    else ctx.rect(-r * 3, -r * 2, r * 6, r * 2)
    ctx.clip()
    for (const [k, a, wdt] of [
      [2.15, 0.55, r * 0.22],
      [1.8, 0.8, r * 0.3],
      [1.5, 0.45, r * 0.12]
    ]) {
      ctx.strokeStyle = `rgba(232, 208, 160, ${a})`
      ctx.lineWidth = wdt
      ctx.beginPath()
      ctx.ellipse(0, 0, r * k, r * k * 0.28, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
  ring(false)
  sphere(ctx, x, y, r, ['#fff1cc', '#e3be7c', '#8a6330'])
  bands(ctx, x, y, r, [
    [-0.5, 0.12, 'rgba(160, 110, 50, 0.3)'],
    [-0.1, 0.18, 'rgba(160, 110, 50, 0.25)'],
    [0.35, 0.1, 'rgba(160, 110, 50, 0.3)']
  ])
  nightSide(ctx, x, y, r)
  ring(true)
}

export function jupiter(ctx: Ctx, x: number, y: number, r: number): void {
  sphere(ctx, x, y, r, ['#fbe7cf', '#d9a978', '#7d5434'])
  bands(ctx, x, y, r, [
    [-0.7, 0.14, 'rgba(150, 90, 50, 0.45)'],
    [-0.35, 0.2, 'rgba(255, 240, 220, 0.35)'],
    [0.0, 0.16, 'rgba(150, 90, 50, 0.5)'],
    [0.3, 0.22, 'rgba(255, 240, 220, 0.3)'],
    [0.6, 0.12, 'rgba(150, 90, 50, 0.45)']
  ])
  ctx.fillStyle = 'rgba(190, 70, 40, 0.75)'
  ctx.beginPath()
  ctx.ellipse(x + r * 0.3, y + r * 0.42, r * 0.2, r * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  nightSide(ctx, x, y, r)
}

export function earth(ctx: Ctx, x: number, y: number, r: number, t: number): void {
  sphere(ctx, x, y, r, ['#bfe6ff', '#2f7fd6', '#123d7a'])
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(70, 170, 90, 0.9)'
  const spin = (t * 0.15) % 2
  for (const [cx, cy, rx, ry] of [
    [-0.3, -0.2, 0.35, 0.25],
    [0.35, 0.25, 0.3, 0.38],
    [-0.1, 0.55, 0.2, 0.12]
  ]) {
    ctx.beginPath()
    ctx.ellipse(x + (cx - spin + 1) * r, y + cy * r, rx * r, ry * r, 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.beginPath()
  ctx.ellipse(x + r * 0.1, y - r * 0.55, r * 0.5, r * 0.08, -0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  nightSide(ctx, x, y, r)
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.5)'
  ctx.lineWidth = r * 0.06
  ctx.beginPath()
  ctx.arc(x, y, r * 1.03, 0, Math.PI * 2)
  ctx.stroke()
  const a = t * 0.9
  sphere(ctx, x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 0.6, r * 0.22, ['#ffffff', '#b8b8b8', '#5a5a5a'])
}

export function mars(ctx: Ctx, x: number, y: number, r: number): void {
  sphere(ctx, x, y, r, ['#ffc2a0', '#d4552c', '#6e2210'])
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.1, y - r * 0.85, r * 0.3, r * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  nightSide(ctx, x, y, r)
}
