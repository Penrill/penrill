import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '../../editor'
import { useEditor } from '../../editorContext'
import type { Egg, Gfx, Show, Text } from './egg'
import { useUk } from './lang'
import { onPlay } from './play'
import './stage.css'

/**
 * The stage: a full-screen canvas on <body>, outside the app, that runs one show at a time at the
 * screen's frame rate. Being outside the app, a show can move the app itself (shake it, float it,
 * swallow it) while it stays put. A click ends the show early, unless it lets the pointer through.
 */
export function Stage() {
  const editor = useEditor()
  const uk = useUk()
  const [run, setRun] = useState<{ egg: Egg; data: unknown; n: number } | null>(null)
  useEffect(() => onPlay((egg, data) => setRun((r) => ({ egg, data, n: (r?.n ?? 0) + 1 }))), [])
  if (!run) return null
  return createPortal(<Run key={run.n} show={run.egg.show} data={run.data} uk={uk} editor={editor} end={() => setRun(null)} />, document.body)
}

/** Board coordinates → screen pixels, through the camera and the board canvas's place on screen. */
function boardToScreen(editor: Editor): Gfx['toScreen'] {
  const box = document.querySelector('.board-canvas')?.getBoundingClientRect()
  const cam = editor.camera
  return (x, y) => [(x - cam.x) * cam.zoom + (box?.left ?? 0), (y - cam.y) * cam.zoom + (box?.top ?? 0)]
}

function Run({ show, data, uk, editor, end }: { show: Show; data: unknown; uk: boolean; editor: Editor; end: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let w = 0
    let h = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const fit = (): void => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    fit()
    const g: Gfx = {
      ctx,
      get w() {
        return w
      },
      get h() {
        return h
      },
      uk,
      say: (text: Text) => (uk ? text.uk : text.en),
      data,
      toScreen: boardToScreen(editor),
      zoom: editor.camera.zoom
    }
    const frame = show.start(g)
    const app = document.querySelector<HTMLElement>('.app')
    const start = performance.now()
    let last = start
    let raf = 0
    const tick = (now: number): void => {
      const t = (now - start) / 1000
      if (t >= show.duration) return end()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = 1
      frame(t, dt)
      canvas.style.opacity = String(Math.min(1, (show.duration - t) / 0.6))
      if (app && show.app) {
        const look = show.app(t)
        app.style.transform = look?.transform ?? ''
        app.style.filter = look?.filter ?? ''
        app.style.transformOrigin = look?.origin ?? ''
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', fit)
      if (app && show.app) {
        app.style.transform = ''
        app.style.filter = ''
        app.style.transformOrigin = ''
      }
    }
  }, [])
  return (
    <canvas
      ref={ref}
      className={`egg-stage${show.passThrough ? ' egg-pass' : ''}`}
      aria-hidden
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        end()
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    />
  )
}
