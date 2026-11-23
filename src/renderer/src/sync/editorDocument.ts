import type { Item } from '@penrill/core/types'
import { diffItem, sameJson } from '@penrill/sync/board'
import type { Change, Op, WireItem } from '@penrill/sync/protocol'
import type { ViewDelta } from '@penrill/sync/replica'
import type { DocumentPort } from '@penrill/sync/session'
import type { Editor } from '../../../board/editor'
import { bgPattern, isBackgroundKind, withPattern } from '../../../board/engine/surface'
import { prefsStore } from '../../../board/store'
import { fromWire, toWire } from './wire'

export interface TitlePort {
  get(): string
  set(title: string): void
  subscribe(listener: () => void): () => void
}

const CAPTURE_MS = 50

export class EditorDocument implements DocumentPort {
  private readonly known = new Map<string, { item: Item; wire: WireItem }>()
  private readonly editor: Editor
  private readonly titles: TitlePort
  private readonly emit: (change: Change) => void
  private title = ''
  private background = ''
  private timer: ReturnType<typeof setTimeout> | null = null
  private applying = false
  private unsubscribe: (() => void)[] = []

  constructor(editor: Editor, titles: TitlePort, emit: (change: Change) => void) {
    this.editor = editor
    this.titles = titles
    this.emit = emit
  }

  attach(): void {
    for (const item of this.editor.scene.getItems()) this.known.set(item.id, { item, wire: toWire(item) })
    this.title = this.titles.get()
    this.background = bgPattern(prefsStore.getState().background)
    const changed = () => {
      if (!this.applying) this.schedule()
    }
    this.unsubscribe = [
      this.editor.scene.subscribe(local => {
        if (local) changed()
      }),
      prefsStore.subscribe((state, previous) => {
        if (bgPattern(state.background) !== bgPattern(previous.background)) changed()
      }),
      this.titles.subscribe(changed)
    ]
  }

  detach(): void {
    this.flush()
    for (const stop of this.unsubscribe) stop()
    this.unsubscribe = []
  }

  ids(): Iterable<string> {
    return this.known.keys()
  }

  item(id: string): WireItem | undefined {
    return this.known.get(id)?.wire
  }

  meta(): { title: string; background: string } {
    return { title: this.title, background: this.background }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const ops: Op[] = []
    const present = new Set<string>()
    for (const item of this.editor.scene.getItems()) {
      present.add(item.id)
      const known = this.known.get(item.id)
      if (known?.item === item) continue
      const wire = toWire(item)
      this.known.set(item.id, { item, wire })
      const op = known ? diffItem(known.wire, wire) : { op: 'put' as const, item: wire }
      if (op) ops.push(op)
    }
    for (const id of [...this.known.keys()]) {
      if (present.has(id)) continue
      this.known.delete(id)
      ops.push({ op: 'delete', id })
    }
    const title = this.titles.get()
    const background = bgPattern(prefsStore.getState().background)
    if (title !== this.title || background !== this.background) {
      ops.push({ op: 'meta', ...(title !== this.title ? { title } : {}), ...(background !== this.background ? { background } : {}) })
      this.title = title
      this.background = background
    }
    if (ops.length) this.emit({ id: crypto.randomUUID(), ops })
  }

  apply(delta: ViewDelta): void {
    const upserts: Item[] = []
    const removed: string[] = []
    for (const [id, wire] of delta.items) {
      const known = this.known.get(id)
      if (!wire) {
        if (known) removed.push(id)
        this.known.delete(id)
        continue
      }
      const item = fromWire(wire)
      if (!item) continue
      const local = toWire(item)
      if (known && sameJson(known.wire, local)) continue
      upserts.push(item)
      this.known.set(id, { item, wire: local })
    }
    this.applying = true
    try {
      if (upserts.length || removed.length) {
        this.editor.scene.applyRemote(upserts, removed)
        const gone = new Set(removed)
        const selected = this.editor.session.getState().selectedIds
        if (selected.some(id => gone.has(id))) this.editor.session.setState({ selectedIds: selected.filter(id => !gone.has(id)) })
      }
      if (isBackgroundKind(delta.background) && bgPattern(delta.background) !== this.background) {
        const pattern = bgPattern(delta.background)
        this.background = pattern
        prefsStore.setState(({ background }) => ({ background: withPattern(background, pattern) }))
      }
      if (delta.title !== undefined && delta.title !== this.title) {
        this.title = delta.title
        this.titles.set(delta.title)
      }
    } finally {
      this.applying = false
    }
  }

  private schedule(): void {
    this.timer ??= setTimeout(() => this.flush(), CAPTURE_MS)
  }
}
