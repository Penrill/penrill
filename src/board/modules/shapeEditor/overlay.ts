import type { Camera } from '@penrill/core/types'
import { ACCENT, accent } from '../../engine/accent'
import type { ShapeEditorOverlayState } from '../../registry'
import { ADD_HANDLE_R, ORBIT_HANDLE_R, SHAPE_HANDLE_R } from './controller'

const CONTROL_COLOR = '#f59f00'

/** Draw direct shape handles (vertices, parameter diamonds, 3D orbit badge, add-vertex midpoints), edge highlights and snap guides. */
export function drawShapeEditorOverlay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  state: ShapeEditorOverlayState
): void {
  const { handles, hotHandle, activeHandle, hotEdge, activeEdge, guides } = state
  if (!handles.length && !guides?.length && !hotEdge && !activeEdge) return

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sx = (x: number): number => (x - cam.x) * cam.zoom
  const sy = (y: number): number => (y - cam.y) * cam.zoom

  // Hovered or active edge highlight so clickable sides feel tangible without adding clutter.
  for (const [edge, strong] of [[hotEdge, false], [activeEdge, true]] as const) {
    if (!edge) continue
    ctx.beginPath()
    ctx.moveTo(sx(edge.a[0]), sy(edge.a[1]))
    ctx.lineTo(sx(edge.b[0]), sy(edge.b[1]))
    ctx.lineCap = 'round'
    ctx.lineWidth = strong ? 8 : 7
    ctx.strokeStyle = accent(strong ? 0.28 : 0.18)
    ctx.stroke()
    ctx.lineWidth = strong ? 2.2 : 1.6
    ctx.strokeStyle = strong ? ACCENT : accent(0.75)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  if (guides?.length) {
    for (const g of guides) {
      if (g.points.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(sx(g.points[0][0]), sy(g.points[0][1]))
      for (let i = 1; i < g.points.length; i++) ctx.lineTo(sx(g.points[i][0]), sy(g.points[i][1]))
      if (g.kind === 'rightAngle') {
        ctx.setLineDash([])
        ctx.lineWidth = 1.6
        ctx.strokeStyle = ACCENT
      } else {
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1.25
        ctx.strokeStyle = accent(0.55)
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // Draw add-vertex dots first so primary vertices, controls and orbit sit cleanly on top.
  for (const h of handles) {
    if (h.kind !== 'addVertex') continue
    const x = sx(h.x), y = sy(h.y)
    const hot = hotHandle === h.id
    const r = hot ? ADD_HANDLE_R + 1.5 : ADD_HANDLE_R
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = hot ? ACCENT : 'rgba(255, 255, 255, 0.88)'
    ctx.fill()
    ctx.lineWidth = 1.4
    ctx.strokeStyle = hot ? '#fff' : accent(0.7)
    ctx.stroke()
    const arm = hot ? 3 : 2.5
    ctx.beginPath()
    ctx.moveTo(x - arm, y)
    ctx.lineTo(x + arm, y)
    ctx.moveTo(x, y - arm)
    ctx.lineTo(x, y + arm)
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.strokeStyle = hot ? '#fff' : ACCENT
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  for (const h of handles) {
    if (h.kind === 'addVertex') continue
    const x = sx(h.x), y = sy(h.y)
    const active = activeHandle === h.id
    const hot = hotHandle === h.id || active
    if (h.kind === 'orbit') {
      const r = hot ? ORBIT_HANDLE_R + 1.5 : ORBIT_HANDLE_R
      if (active) {
        ctx.beginPath()
        ctx.arc(x, y, r + 5, 0, Math.PI * 2)
        ctx.fillStyle = accent(0.22)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = active ? ACCENT : '#fff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = active ? '#fff' : ACCENT
      ctx.stroke()
      // Crisp miniature 3D-orbit glyph inside the badge (horizontal + vertical tilted ellipses).
      const stroke = active ? '#fff' : ACCENT
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.55, r * 0.24, -0.35, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.24, r * 0.55, -0.35, 0, Math.PI * 2)
      ctx.stroke()
    } else if (h.kind === 'control') {
      const half = hot ? 6.5 : 5.5
      ctx.beginPath()
      ctx.moveTo(x, y - half)
      ctx.lineTo(x + half, y)
      ctx.lineTo(x, y + half)
      ctx.lineTo(x - half, y)
      ctx.closePath()
      ctx.fillStyle = CONTROL_COLOR
      ctx.fill()
      ctx.lineWidth = 1.6
      ctx.strokeStyle = '#fff'
      ctx.stroke()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
      ctx.stroke()
    } else {
      if (active) {
        ctx.beginPath()
        ctx.arc(x, y, SHAPE_HANDLE_R + 5.5, 0, Math.PI * 2)
        ctx.fillStyle = accent(0.2)
        ctx.fill()
      }
      const r = hot ? SHAPE_HANDLE_R + 1.5 : SHAPE_HANDLE_R
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = active ? ACCENT : '#fff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = active ? '#fff' : ACCENT
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, hot ? 2.8 : 2.2, 0, Math.PI * 2)
      ctx.fillStyle = active ? '#fff' : ACCENT
      ctx.fill()
    }
  }

  ctx.restore()
}
