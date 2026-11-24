import type { Camera } from '@penrill/core/types'
import { ACCENT, accent } from '../../engine/accent'
import type { ShapeEditorOverlayState } from '../../registry'
import { ADD_HANDLE_R, ORBIT_HANDLE_R, SHAPE_HANDLE_R } from './controller'

const CONTROL_COLOR = '#f59f00'

/** Draw direct shape handles (vertices, parameter diamonds, 3D orbit/gizmo rings, add-vertex midpoints), edge highlights and snap guides. */
export function drawShapeEditorOverlay(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
  state: ShapeEditorOverlayState
): void {
  const { handles, hotHandle, activeHandle, hotEdge, activeEdge, guides, gizmo3d, gizmoArc, gizmoActive } = state
  if (!handles.length && !guides?.length && !hotEdge && !activeEdge && !gizmo3d) return

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

  // Optional Blender-style 3-axis 3D rotation gizmo (Red X, Green Y, Blue Z + outer view-roll ring).
  if (gizmo3d) {
    const draggingRing = gizmoArc?.id ?? null
    const traceRuns = (runs: readonly (readonly [number, number][])[]): void => {
      ctx.beginPath()
      for (const pts of runs) {
        if (pts.length < 2) continue
        ctx.moveTo(sx(pts[0][0]), sy(pts[0][1]))
        for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]))
      }
    }

    // 1. Back halves of the 3D great circles (subtle dashed depth cue).
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const ring of gizmo3d.rings) {
      if (!ring.backPts.length) continue
      const isActive = draggingRing === ring.id || hotHandle === ring.id
      const dimmed = draggingRing !== null && draggingRing !== ring.id
      ctx.save()
      ctx.globalAlpha = dimmed ? 0.08 : isActive ? 0.42 : 0.22
      ctx.strokeStyle = ring.color
      ctx.lineWidth = isActive ? 2 : 1.4
      ctx.setLineDash([4, 4])
      traceRuns(ring.backPts)
      ctx.stroke()
      ctx.restore()
    }

    // 2. Active Blender-style 3D sweep sector wedge while dragging a ring.
    if (gizmoArc && gizmoArc.sectorPts.length >= 3) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(sx(gizmoArc.sectorPts[0][0]), sy(gizmoArc.sectorPts[0][1]))
      for (let i = 1; i < gizmoArc.sectorPts.length; i++) {
        ctx.lineTo(sx(gizmoArc.sectorPts[i][0]), sy(gizmoArc.sectorPts[i][1]))
      }
      ctx.closePath()
      ctx.globalAlpha = 0.16
      ctx.fillStyle = gizmoArc.color
      ctx.fill()

      // Start radial line (dashed) and current radial line (solid).
      const cx = sx(gizmoArc.center[0]), cy = sy(gizmoArc.center[1])
      ctx.globalAlpha = 0.65
      ctx.strokeStyle = gizmoArc.color
      ctx.lineWidth = 1.4
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(sx(gizmoArc.startPt[0]), sy(gizmoArc.startPt[1]))
      ctx.stroke()

      ctx.setLineDash([])
      ctx.globalAlpha = 0.92
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(sx(gizmoArc.endPt[0]), sy(gizmoArc.endPt[1]))
      ctx.stroke()
      ctx.restore()
    }

    // 3. Front halves of the 3D rings (outer view-roll first, then X/Y/Z crisp on top).
    const ordered = [...gizmo3d.rings].sort((a, b) => (a.id === 'rotView' ? -1 : b.id === 'rotView' ? 1 : 0))
    for (const ring of ordered) {
      if (!ring.frontPts.length) continue
      const isHot = hotHandle === ring.id || draggingRing === ring.id
      const dimmed = draggingRing !== null && draggingRing !== ring.id
      ctx.save()
      if (ring.id === 'rotView') {
        ctx.globalAlpha = dimmed ? 0.12 : isHot ? 0.85 : 0.38
        ctx.lineWidth = isHot ? 2.6 : 1.5
      } else {
        ctx.globalAlpha = dimmed ? 0.16 : isHot ? 1 : 0.82
        ctx.lineWidth = isHot ? 3.2 : 2.1
      }
      ctx.strokeStyle = ring.color
      ctx.setLineDash([])
      traceRuns(ring.frontPts)
      ctx.stroke()
      ctx.restore()
    }

    // 4. Clickable positive X / Y / Z axis pole pills (tap snaps to side view; drag rotates the ring).
    for (const ring of gizmo3d.rings) {
      if (!ring.pole || !ring.label) continue
      const poleId = ring.id === 'rotX' ? 'poleX' : ring.id === 'rotY' ? 'poleY' : 'poleZ'
      const poleHot = hotHandle === poleId
      const dimmed = draggingRing !== null && draggingRing !== ring.id
      const isHot = poleHot || hotHandle === ring.id || draggingRing === ring.id
      const px = sx(ring.pole.pos[0]), py = sy(ring.pole.pos[1])
      const r = poleHot ? 9.2 : isHot ? 8.5 : 7.2
      ctx.save()
      ctx.globalAlpha = dimmed ? 0.18 : poleHot ? 1 : ring.pole.depth < -1e-4 ? 0.45 : 0.94
      if (poleHot) {
        ctx.beginPath()
        ctx.arc(px, py, r + 3.5, 0, Math.PI * 2)
        ctx.fillStyle = ring.color
        ctx.globalAlpha = 0.24
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = ring.color
      ctx.fill()
      ctx.lineWidth = poleHot ? 2 : 1.4
      ctx.strokeStyle = '#fff'
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = '700 9.5px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ring.label, px, py + 0.5)
      ctx.restore()
    }

    // 5. Compact color-coded X / Y / Z angle HUD pill beneath the 3D rotation rings.
    const [ex, ey, ez] = gizmo3d.eulerDeg
    const hudEntries: { axis: string; val: string; color: string }[] = [
      { axis: 'X', val: `${ex}°`, color: '#ff6b6b' },
      { axis: 'Y', val: `${ey}°`, color: '#51cf66' },
      { axis: 'Z', val: `${ez}°`, color: '#4dabf7' }
    ]
    ctx.save()
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, system-ui, sans-serif'
    const gap = 8
    const segs = hudEntries.map((e) => {
      const aw = ctx.measureText(e.axis).width
      const vw = ctx.measureText(e.val).width
      return { ...e, aw, vw, total: aw + 3 + vw }
    })
    const padX = 9
    const pillH = 21
    const pillW = padX * 2 + segs.reduce((s, g) => s + g.total, 0) + gap * (segs.length - 1)
    const pillX = sx(gizmo3d.center[0]) - pillW / 2
    const pillY = sy(gizmo3d.center[1]) + gizmo3d.outerRadius * cam.zoom + 10
    const rad = pillH / 2
    ctx.beginPath()
    ctx.moveTo(pillX + rad, pillY)
    ctx.lineTo(pillX + pillW - rad, pillY)
    ctx.arc(pillX + pillW - rad, pillY + rad, rad, -Math.PI / 2, Math.PI / 2)
    ctx.lineTo(pillX + rad, pillY + pillH)
    ctx.arc(pillX + rad, pillY + rad, rad, Math.PI / 2, (Math.PI * 3) / 2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(24, 24, 27, 0.8)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let curX = pillX + padX
    const textY = pillY + pillH / 2 + 0.5
    for (const seg of segs) {
      ctx.fillStyle = seg.color
      ctx.fillText(seg.axis, curX, textY)
      curX += seg.aw + 3
      ctx.fillStyle = '#f4f4f5'
      ctx.fillText(seg.val, curX, textY)
      curX += seg.vw + gap
    }
    ctx.restore()

    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
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

  // Sort primary handles back-to-front by 3D depth so closer vertices sit cleanly above back-face vertices.
  const primaryHandles = handles
    .filter((h) => h.kind !== 'addVertex' && h.kind !== 'gizmoRing' && h.kind !== 'gizmoPole')
    .sort((a, b) => {
      const rank = (h: typeof a): number => (h.kind === 'orbit' ? 2 : activeHandle === h.id || hotHandle === h.id ? 1 : 0)
      return rank(a) - rank(b) || (a.depth ?? 0) - (b.depth ?? 0)
    })

  for (const h of primaryHandles) {
    const x = sx(h.x), y = sy(h.y)
    const active = activeHandle === h.id
    const hot = hotHandle === h.id || active
    if (h.kind === 'orbit') {
      const lit = active || !!gizmoActive
      const r = hot ? ORBIT_HANDLE_R + 1.5 : ORBIT_HANDLE_R
      if (lit) {
        ctx.beginPath()
        ctx.arc(x, y, r + 4.5, 0, Math.PI * 2)
        ctx.fillStyle = accent(active ? 0.24 : 0.16)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = lit ? ACCENT : '#fff'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = lit ? '#fff' : ACCENT
      ctx.stroke()
      // Crisp miniature 3D-orbit glyph inside the badge (horizontal + vertical tilted ellipses).
      const stroke = lit ? '#fff' : ACCENT
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
