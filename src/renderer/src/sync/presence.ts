import { screenToWorld } from '@penrill/core/camera'
import type { Point } from '@penrill/core/types'
import type { JsonObject, Peer } from '@penrill/sync/protocol'
import { create } from 'zustand'
import type { Editor } from '../../../board/editor'
import type { LiveStroke } from '../../../board/engine/renderer'

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

export class Presence {
  private readonly editor: Editor
  private readonly send: (data: JsonObject) => void
  private readonly cursors = new Map<string, PeerCursor>()
  private readonly strokes = new Map<string, { client: string; id: string; timeout?: ReturnType<typeof setTimeout> }>()
  private readonly recentCommits = new Map<string, number>()
  private sent: { id: string; points: Point[]; count: number } | null = null
  private screen: { x: number; y: number } | null = null
  private frame = 0
  private canvas: HTMLCanvasElement | null = null
  private readonly stopScene: () => void
  private readonly stopCamera: () => void

  constructor(editor: Editor, send: (data: JsonObject) => void) {
    this.editor = editor
    this.send = send
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
      this.scheduleCursor()
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
    for (const client of this.cursors.keys()) if (!present.has(client)) this.cursors.delete(client)
    for (const [key, stroke] of this.strokes) if (!present.has(stroke.client)) this.removeStroke(key)
    this.sent = null
    this.scheduleCursor()
    this.publish()
  }

  receive(peer: Peer, data: JsonObject): void {
    if ('cursor' in data) {
      const cursor = data.cursor as { x?: unknown; y?: unknown } | null
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) this.cursors.set(peer.client, { ...peer, x: cursor.x as number, y: cursor.y as number })
      else this.cursors.delete(peer.client)
      this.publish()
    }
    if (data.ink && typeof data.ink === 'object') this.receiveInk(peer.client, data.ink as unknown as InkPacket)
  }

  dispose(): void {
    this.editor.shareInk = undefined
    this.stopScene()
    this.stopCamera()
    cancelAnimationFrame(this.frame)
    for (const key of [...this.strokes.keys()]) this.removeStroke(key)
    this.cursors.clear()
    this.publish()
  }

  private publish(): void {
    usePeerCursors.setState({ cursors: [...this.cursors.values()] })
  }

  private scheduleCursor(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      const canvas = this.canvas
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const at = this.screen && screenToWorld(this.editor.camera, this.screen.x - rect.left, this.screen.y - rect.top)
      this.send({ cursor: at ? { x: at.x, y: at.y } : null })
    })
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
      this.send({ ink: ink as unknown as JsonObject })
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
      this.strokes.set(key, { client, id: ink.id })
    }
    if (!stroke || stroke.points.length !== ink.offset || ink.offset > MAX_POINTS) return
    stroke.points.push(...ink.points)
    if (ink.finish === 'commit') {
      if (this.editor.scene.getById([ink.id]).length) this.removeStroke(key)
      else this.strokes.get(key)!.timeout = setTimeout(() => this.removeStroke(key), COMMIT_GRACE_MS)
    }
    this.editor.requestRender(false)
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
        if (!present.has(id)) this.send({ ink: { id, offset: 0, points: [], finish: 'cancel' } })
        if (!present.has(id) || now - time > COMMIT_GRACE_MS) this.recentCommits.delete(id)
      }
    }
    if (!this.strokes.size) return
    const landed = new Set(this.editor.scene.getById(Array.from(this.strokes.values(), stroke => stroke.id)).map(item => item.id))
    for (const [key, stroke] of this.strokes) if (landed.has(stroke.id)) this.removeStroke(key)
  }
}
