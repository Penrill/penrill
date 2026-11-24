import type { ColorMap, Prim } from '@penrill/render/display'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draws a display list (@penrill/render/display) on a Canvas 2D context, on screen or offscreen. */
export function paint(ctx: Ctx, p: Prim, color: ColorMap): void {
  switch (p.kind) {
    case 'group':
      ctx.save()
      if (p.fill) ctx.fillStyle = color(p.fill)
      if (p.cap) ctx.lineCap = p.cap
      if (p.join) ctx.lineJoin = p.join
      if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity
      for (const ch of p.children) paint(ctx, ch, color)
      ctx.restore()
      return
    case 'line':
      ctx.save()
      if (p.dash?.length) ctx.setLineDash(p.dash)
      ctx.beginPath()
      ctx.moveTo(p.x1, p.y1)
      ctx.lineTo(p.x2, p.y2)
      ctx.lineWidth = p.width
      ctx.strokeStyle = color(p.color)
      ctx.stroke()
      ctx.restore()
      return
    case 'polygon':
    case 'polyline': {
      if (!p.pts.length) return
      ctx.beginPath()
      ctx.moveTo(p.pts[0][0], p.pts[0][1])
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1])
      if (p.kind === 'polygon') {
        ctx.closePath()
        if (p.opacity !== undefined && p.opacity !== 1) {
          ctx.save()
          ctx.globalAlpha *= p.opacity
          ctx.fillStyle = color(p.color)
          ctx.fill()
          ctx.restore()
        } else {
          ctx.fillStyle = color(p.color)
          ctx.fill()
        }
        return
      }
      ctx.save()
      if (p.join) ctx.lineJoin = p.join
      if (p.dash?.length) ctx.setLineDash(p.dash)
      ctx.lineWidth = p.width
      ctx.strokeStyle = color(p.color)
      ctx.stroke()
      ctx.restore()
      return
    }
    case 'circle':
      ctx.save()
      if (p.opacity !== undefined) ctx.globalAlpha *= p.opacity
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2)
      if (p.fill) {
        ctx.fillStyle = color(p.fill)
        ctx.fill()
      }
      if (p.stroke) {
        ctx.lineWidth = p.width ?? 1
        ctx.strokeStyle = color(p.stroke)
        ctx.stroke()
      }
      ctx.restore()
      return
    case 'text':
      ctx.save()
      ctx.font = `${p.italic ? 'italic ' : ''}${p.size}px ${p.family}`
      ctx.textAlign = p.align ?? 'left'
      ctx.textBaseline = p.baseline ?? 'alphabetic'
      if (p.halo) {
        ctx.strokeStyle = color(p.halo.color)
        ctx.lineWidth = p.halo.width
        ctx.lineJoin = 'round'
        ctx.strokeText(p.s, p.x, p.y)
      } else {
        if (p.color) ctx.fillStyle = color(p.color)
        ctx.fillText(p.s, p.x, p.y)
      }
      ctx.restore()
  }
}
