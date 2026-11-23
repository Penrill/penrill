import { screenToWorld } from '@penrill/core/camera'
import type { Point } from '@penrill/core/types'
import type { JsonObject, Peer } from '@penrill/sync/protocol'
import { create } from 'zustand'
import type { Editor } from '../../../board/editor'
import type { LiveStroke } from '../../../board/engine/renderer'
import { glideStep, Pacer, releaseCount } from './motion'

export interface PeerCursor extends Peer {
  x: number
  y: number
}

export const usePeerCursors = create<{ cursors: PeerCursor[] }>(() => ({ cursors: [] }))

interface InkPacket {
  id: string
  offset: number
  points: Point[]
  style?: Omit<LiveStroke, 'points' | 'parts'>
  finish?: 'commit' | 'cancel'
}

const CHUNK = 256
const MAX_STROKES = 256
const MAX_POINTS = 200_000
const COMMIT_GRACE_MS = 30_000
/** A cursor that moves further than this on screen in one go jumps there instead of gliding across the board. */
const JUMP_PX = 2000
const MAX_FRAME_MS = 100

interface PeerStroke {
  client: string
  id: string
  /** Points that arrived but are not drawn yet; they are fed in over the next frames. */
  queue: Point[]
  timeout?: ReturnType<typeof setTimeout>
}

export class Presence {
  private readonly editor: Editor
  private readonly send: (data: JsonObject) => void
  private readonly cursors = new Map<string, PeerCursor>()
  private readonly targets = new Map<string, { x: number; y: number }>()
  private readonly strokes = new Map<string, PeerStroke>()
  private readonly recentCommits = new Map<string, number>()
  private sent: { id: string; points: Point[]; count: number } | null = null
  private screen: { x: number; y: number } | null = null
  private cursorDirty = false
  private outgoing: InkPacket[] = []
  private readonly pacer: Pacer
  private animation = 0
  private lastFrame = 0
  private canvas: HTMLCanvasElement | null = null
  private readonly stopScene: () => void
  private readonly stopCamera: () => void

  constructor(editor: Editor, send: (data: JsonObject) => void) {
    this.editor = editor
    this.send = send
    this.pacer = new Pacer(() => this.flush())
    editor.shareInk = (id, stroke, finished, committed) => this.shareInk(id, stroke, finished, committed)
    this.stopScene = editor.scene.subscribe(() => this.sceneChanged())
    this.stopCamera = editor.session.subscribe((state, previous) => {
      if (this.screen && state.camera !== previous.camera) this.scheduleCursor()
    })
  }

  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas
    const move = (event: PointerEvent) => {
      this.screen = { x: event.clientX, y: event.clientY }
      this.scheduleCursor()
    }
    const leave = () => {
      this.screen = null
      this.scheduleCursor(true)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointercancel', leave)
    window.addEventListener('blur', leave)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointercancel', leave)
      window.removeEventListener('blur', leave)
      if (this.canvas === canvas) this.canvas = null
    }
  }

  setPeers(peers: Peer[]): void {
    const present = new Set(peers.map(peer => peer.client))
    for (const client of this.cursors.keys()) if (!present.has(client)) this.dropCursor(client)
    for (const [key, stroke] of this.strokes) if (!present.has(stroke.client)) this.removeStroke(key)
    this.sent = null
    this.scheduleCursor()
    this.publish()
  }

  receive(peer: Peer, data: JsonObject): void {
    if ('cursor' in data) {
      const cursor = data.cursor as { x?: unknown; y?: unknown } | null
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) this.moveCursor(peer, cursor.x as number, cursor.y as number)
      else this.dropCursor(peer.client)
      this.publish()
    }
    if (data.ink && typeof data.ink === 'object') this.receiveInk(peer.client, data.ink as unknown as InkPacket)
  }

  dispose(): void {
    this.editor.shareInk = undefined
    this.stopScene()
    this.stopCamera()
    this.pacer.dispose()
    cancelAnimationFrame(this.animation)
    this.animation = 0
    for (const key of [...this.strokes.keys()]) this.removeStroke(key)
    this.cursors.clear()
    this.targets.clear()
    this.publish()
  }

  private publish(): void {
    usePeerCursors.setState({ cursors: [...this.cursors.values()] })
  }

  /** Cursors go out with the next paced send; leaving the board goes out at once. */
  private scheduleCursor(urgent = false): void {
    this.cursorDirty = true
    this.pacer.poke(urgent)
  }

  private flush(): void {
    let cursor: JsonObject | undefined
    if (this.cursorDirty && this.canvas) {
      this.cursorDirty = false
      const rect = this.canvas.getBoundingClientRect()
      const at = this.screen && screenToWorld(this.editor.camera, this.screen.x - rect.left, this.screen.y - rect.top)
      cursor = { cursor: at ? { x: at.x, y: at.y } : null }
    }
    const ink = this.outgoing
    this.outgoing = []
    for (const packet of ink) {
      this.send({ ...cursor, ink: packet as unknown as JsonObject })
      cursor = undefined
    }
    if (cursor) this.send(cursor)
  }

  /** Queues a packet for the next send, joined to the one before when it carries on the same stroke. */
  private queueInk(ink: InkPacket): void {
    const last = this.outgoing.at(-1)
    if (last && last.id === ink.id && !last.finish && !ink.style && last.offset + last.points.length === ink.offset &&
        last.points.length + ink.points.length <= CHUNK) {
      last.points.push(...ink.points)
      last.finish = ink.finish
    } else {
      this.outgoing.push(ink)
    }
    this.pacer.poke(!!ink.finish)
  }

  private shareInk(id: string, stroke: LiveStroke, finished: boolean, committed: boolean): void {
    const reset = this.sent?.id !== id || this.sent.points !== stroke.points
    let offset = reset ? 0 : this.sent!.count
    if (offset === stroke.points.length && !finished) return
    const { points, parts: _parts, ...style } = stroke
    do {
      const chunk = points.slice(offset, offset + CHUNK)
      const ink: InkPacket = { id, offset, points: chunk }
      if (offset === 0) ink.style = style
      if (offset + chunk.length === points.length && finished) ink.finish = committed ? 'commit' : 'cancel'
      this.queueInk(ink)
      offset += chunk.length
    } while (offset < points.length)
    if (finished && committed) this.recentCommits.set(id, performance.now())
    this.sent = finished ? null : { id, points, count: offset }
  }

  private receiveInk(client: string, ink: InkPacket): void {
    if (typeof ink.id !== 'string' || ink.id.length > 128 || !Array.isArray(ink.points) || ink.points.length > CHUNK ||
        !ink.points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) return
    const key = client + '/' + ink.id
    if (ink.finish === 'cancel') {
      this.removeStroke(key)
      return
    }
    let stroke = this.editor.peerInk.get(key)
    if (ink.offset === 0) {
      const style = ink.style
      if (!style || !['pen', 'highlighter'].includes(style.tool) || typeof style.color !== 'string' ||
          !Number.isFinite(style.size) || style.size <= 0 || style.size > 4096) return
      if (!stroke && this.strokes.size >= MAX_STROKES) return
      clearTimeout(this.strokes.get(key)?.timeout)
      stroke = {
        tool: style.tool, color: style.color, size: style.size, pressure: !!style.pressure,
        dash: style.dash, geom: style.geom, startCap: style.startCap, endCap: style.endCap, points: []
      }
      this.editor.peerInk.set(key, stroke)
      this.strokes.set(key, { client, id: ink.id, queue: [] })
    }
    const peer = this.strokes.get(key)
    if (!stroke || !peer || stroke.points.length + peer.queue.length !== ink.offset || ink.offset > MAX_POINTS) return
    peer.queue.push(...ink.points)
    if (ink.finish === 'commit') {
      stroke.points.push(...peer.queue.splice(0))
      if (this.editor.scene.getById([ink.id]).length) this.removeStroke(key)
      else peer.timeout = setTimeout(() => this.removeStroke(key), COMMIT_GRACE_MS)
      this.editor.requestRender(false)
    }
    this.animate()
  }

  private moveCursor(peer: Peer, x: number, y: number): void {
    const shown = this.cursors.get(peer.client)
    const zoom = this.editor.camera.zoom
    if (!shown || Math.hypot(x - shown.x, y - shown.y) * zoom > JUMP_PX) {
      this.cursors.set(peer.client, { ...peer, x, y })
      this.targets.delete(peer.client)
      return
    }
    this.cursors.set(peer.client, { ...peer, x: shown.x, y: shown.y })
    this.targets.set(peer.client, { x, y })
    this.animate()
  }

  private dropCursor(client: string): void {
    this.cursors.delete(client)
    this.targets.delete(client)
  }

  /** Eases cursors toward where they were last seen and feeds queued ink in, one display frame at a time. */
  private animate(): void {
    if (this.animation) return
    this.lastFrame = performance.now()
    const step = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, now - this.lastFrame)
      this.lastFrame = now
      this.animation = 0
      if (this.targets.size) {
        const share = glideStep(dt)
        const zoom = this.editor.camera.zoom
        for (const [client, target] of this.targets) {
          const shown = this.cursors.get(client)
          if (!shown) {
            this.targets.delete(client)
            continue
          }
          const near = Math.hypot(target.x - shown.x, target.y - shown.y) * zoom < 0.5
          if (near) this.targets.delete(client)
          this.cursors.set(client, near
            ? { ...shown, x: target.x, y: target.y }
            : { ...shown, x: shown.x + (target.x - shown.x) * share, y: shown.y + (target.y - shown.y) * share })
        }
        this.publish()
      }
      let feeding = false
      for (const [key, peer] of this.strokes) {
        if (!peer.queue.length) continue
        this.editor.peerInk.get(key)?.points.push(...peer.queue.splice(0, releaseCount(peer.queue.length, dt)))
        feeding ||= peer.queue.length > 0
        this.editor.requestRender(false)
      }
      if (this.targets.size || feeding) this.animation = requestAnimationFrame(step)
    }
    this.animation = requestAnimationFrame(step)
  }

  private removeStroke(key: string): void {
    clearTimeout(this.strokes.get(key)?.timeout)
    this.strokes.delete(key)
    this.editor.peerInk.delete(key)
    this.editor.requestRender(false)
  }

  private sceneChanged(): void {
    const now = performance.now()
    if (this.recentCommits.size) {
      const present = new Set(this.editor.scene.getById(this.recentCommits.keys()).map(item => item.id))
      for (const [id, time] of this.recentCommits) {
        if (!present.has(id)) this.queueInk({ id, offset: 0, points: [], finish: 'cancel' })
        if (!present.has(id) || now - time > COMMIT_GRACE_MS) this.recentCommits.delete(id)
      }
    }
    if (!this.strokes.size) return
    const landed = new Set(this.editor.scene.getById(Array.from(this.strokes.values(), stroke => stroke.id)).map(item => item.id))
    for (const [key, stroke] of this.strokes) if (landed.has(stroke.id)) this.removeStroke(key)
  }
}
