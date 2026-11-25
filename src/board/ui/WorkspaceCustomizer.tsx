import { ArrowPathIcon, BookmarkIcon, CheckIcon, Squares2X2Icon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Switch } from '@penrill/ui/switch'
import clsx from 'clsx'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useSession } from '../editorContext'
import { useT, type MessageKey } from '../i18n'
import { shortcutKey } from '../shortcuts'
import { prefsStore, usePrefs } from '../store'
import { isToolbarDivider, type ToolbarItemId } from '../toolbarLayout'
import {
  addToolToPreferredDock,
  cloneWorkspaceLayout,
  DEFAULT_WORKSPACE_LAYOUT,
  DOCK_EDGES,
  hiddenToolsInDocks,
  isVerticalDock,
  matchWorkspacePreset,
  moveWholeDock,
  placeToolInDock,
  removeItemFromDocks,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESETS,
  workspaceLayoutsEqual,
  ZOOM_DOCKS,
  type DockEdge,
  type OptionsDock,
  type OptionsMode,
  type WorkspaceLayout,
  type WorkspacePresetId,
  type ZoomDock
} from '../workspaceLayout'
import { Segmented } from './chrome'
import { TOOL_LABELS, TOOL_SHORTCUTS, ToolMiniIcon } from './toolMeta'

export type DragPayload =
  | { kind: 'item'; id: ToolbarItemId; fromEdge: DockEdge | 'palette' }
  | { kind: 'bar'; fromEdge: DockEdge }
  | { kind: 'options' }
  | { kind: 'zoom' }

export type DropTarget =
  | { kind: 'edge-slot'; edge: DockEdge; index: number }
  | { kind: 'edge-bar'; edge: DockEdge }
  | { kind: 'options-edge'; edge: OptionsDock }
  | { kind: 'zoom-corner'; corner: ZoomDock }
  | { kind: 'palette' }
  | null

export interface WorkspaceCustomizeContextValue {
  active: boolean
  layout: WorkspaceLayout
  dragging: DragPayload | null
  dropTarget: DropTarget
  /** Suppress immediate click right after a drag gesture finishes. */
  suppressClickRef: { current: boolean }
  updateDraft: (fn: (prev: WorkspaceLayout) => WorkspaceLayout) => void
  startDrag: (e: ReactPointerEvent, payload: DragPayload) => void
  registerEdgeEl: (edge: DockEdge, el: HTMLElement | null) => void
  registerEdgeViewport: (edge: DockEdge, el: HTMLElement | null) => void
  registerOptionsZone: (edge: OptionsDock, el: HTMLElement | null) => void
  registerZoomZone: (corner: ZoomDock, el: HTMLElement | null) => void
  registerPaletteEl: (el: HTMLElement | null) => void
  activeCustomPresetId: string | null
  setActiveCustomPresetId: (id: string | null) => void
  commit: () => void
  cancel: () => void
}

const noop = (): void => {}

const WorkspaceCustomizeContext = createContext<WorkspaceCustomizeContextValue | null>(null)

export function useWorkspaceCustomize(): WorkspaceCustomizeContextValue {
  const ctx = useContext(WorkspaceCustomizeContext)
  const savedLayout = usePrefs((s) => s.workspaceLayout)
  if (ctx) return ctx
  return {
    active: false,
    layout: savedLayout,
    dragging: null,
    dropTarget: null,
    suppressClickRef: { current: false },
    updateDraft: noop,
    startDrag: noop,
    registerEdgeEl: noop,
    registerEdgeViewport: noop,
    registerOptionsZone: noop,
    registerZoomZone: noop,
    registerPaletteEl: noop,
    activeCustomPresetId: null,
    setActiveCustomPresetId: noop,
    commit: noop,
    cancel: noop
  }
}

function insideRect(rect: DOMRect, x: number, y: number, pad: number): boolean {
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad
}

function distToRect(rect: DOMRect, x: number, y: number): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

/**
 * Provides live draft state and a unified pointer drag-and-drop controller across all 4 edges,
 * tool options bar, zoom corners and central palette whenever `customizingWorkspace` is active.
 */
export function WorkspaceCustomizeProvider({ children }: { children: ReactNode }) {
  const editor = useEditor()
  const active = useSession((s) => s.customizingWorkspace)
  const savedLayout = usePrefs((s) => s.workspaceLayout)
  const customPresets = usePrefs((s) => s.customPresets)

  const [draft, setDraft] = useState<WorkspaceLayout>(() => cloneWorkspaceLayout(savedLayout))
  const [activeCustomPresetId, setActiveCustomPresetId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft
  const dropRef = useRef<DropTarget>(null)
  dropRef.current = dropTarget

  const gestureRef = useRef<{ payload: DragPayload; pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)

  const edgeEls = useRef<Partial<Record<DockEdge, HTMLElement | null>>>({})
  const edgeViewports = useRef<Partial<Record<DockEdge, HTMLElement | null>>>({})
  const optionsZones = useRef<Partial<Record<OptionsDock, HTMLElement | null>>>({})
  const zoomZones = useRef<Partial<Record<ZoomDock, HTMLElement | null>>>({})
  const paletteEl = useRef<HTMLElement | null>(null)

  // Initialize fresh draft whenever entering customize mode.
  useEffect(() => {
    if (!active) {
      setDragging(null)
      setDragPoint(null)
      setDropTarget(null)
      gestureRef.current = null
      return
    }
    const fresh = cloneWorkspaceLayout(prefsStore.getState().workspaceLayout)
    setDraft(fresh)
    const matched = matchWorkspacePreset(fresh, prefsStore.getState().customPresets)
    setActiveCustomPresetId(matched.kind === 'custom' ? matched.preset.id : null)
  }, [active])

  // Clear stale activeCustomPresetId if that preset gets deleted.
  useEffect(() => {
    if (activeCustomPresetId && !customPresets.some((p) => p.id === activeCustomPresetId)) {
      setActiveCustomPresetId(null)
    }
  }, [activeCustomPresetId, customPresets])

  const updateDraft = useCallback((fn: (prev: WorkspaceLayout) => WorkspaceLayout) => {
    setDraft((prev) => fn(prev))
  }, [])

  const commit = useCallback(() => {
    prefsStore.getState().replaceWorkspaceLayout(draftRef.current)
    editor.session.setState({ customizingWorkspace: false })
  }, [editor])

  const cancel = useCallback(() => {
    editor.session.setState({ customizingWorkspace: false })
  }, [editor])

  const registerEdgeEl = useCallback((edge: DockEdge, el: HTMLElement | null) => {
    edgeEls.current[edge] = el
  }, [])

  const registerEdgeViewport = useCallback((edge: DockEdge, el: HTMLElement | null) => {
    edgeViewports.current[edge] = el
  }, [])

  const registerOptionsZone = useCallback((edge: OptionsDock, el: HTMLElement | null) => {
    optionsZones.current[edge] = el
  }, [])

  const registerZoomZone = useCallback((corner: ZoomDock, el: HTMLElement | null) => {
    zoomZones.current[corner] = el
  }, [])

  const registerPaletteEl = useCallback((el: HTMLElement | null) => {
    paletteEl.current = el
  }, [])

  const computeDropTarget = useCallback((payload: DragPayload, clientX: number, clientY: number): DropTarget => {
    if (payload.kind === 'item') {
      // Find the edge hit (or closest edge within generous padding).
      let hitEdge: DockEdge | null = null
      let bestDist = Infinity
      for (const edge of DOCK_EDGES) {
        const el = edgeEls.current[edge]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (insideRect(rect, clientX, clientY, 28)) {
          const d = distToRect(rect, clientX, clientY)
          if (d < bestDist) {
            bestDist = d
            hitEdge = edge
          }
        }
      }
      if (hitEdge) {
        const vp = edgeViewports.current[hitEdge]
        const vertical = isVerticalDock(hitEdge)
        if (vp) {
          const vpRect = vp.getBoundingClientRect()
          if (vertical) {
            if (clientY < vpRect.top + 28) vp.scrollTop -= 16
            else if (clientY > vpRect.bottom - 28) vp.scrollTop += 16
          } else {
            if (clientX < vpRect.left + 28) vp.scrollLeft -= 16
            else if (clientX > vpRect.right - 28) vp.scrollLeft += 16
          }
        }
        const edgeContainer = edgeEls.current[hitEdge]
        const slotEls = edgeContainer ? Array.from(edgeContainer.querySelectorAll<HTMLElement>('[data-customize-slot]')) : []
        let index = slotEls.length
        for (let i = 0; i < slotEls.length; i++) {
          const r = slotEls[i].getBoundingClientRect()
          if (vertical ? clientY < r.top + r.height / 2 : clientX < r.left + r.width / 2) {
            index = i
            break
          }
        }
        return { kind: 'edge-slot', edge: hitEdge, index }
      }
      return payload.fromEdge !== 'palette' ? { kind: 'palette' } : null
    }

    if (payload.kind === 'bar') {
      let hitEdge: DockEdge | null = null
      let bestDist = Infinity
      for (const edge of DOCK_EDGES) {
        if (edge === payload.fromEdge) continue
        const el = edgeEls.current[edge]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (insideRect(rect, clientX, clientY, 44)) {
          const d = distToRect(rect, clientX, clientY)
          if (d < bestDist) {
            bestDist = d
            hitEdge = edge
          }
        }
      }
      return hitEdge ? { kind: 'edge-bar', edge: hitEdge } : null
    }

    if (payload.kind === 'options') {
      let best: OptionsDock | null = null
      let bestDist = Infinity
      for (const edge of DOCK_EDGES) {
        const el = optionsZones.current[edge]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (insideRect(rect, clientX, clientY, 48)) {
          const d = distToRect(rect, clientX, clientY)
          if (d < bestDist) {
            bestDist = d
            best = edge
          }
        }
      }
      if (best) return { kind: 'options-edge', edge: best }
      // Fallback: snap to the closest screen edge when dragged toward the perimeter.
      const edgeDistances: [OptionsDock, number][] = [
        ['top', clientY],
        ['bottom', window.innerHeight - clientY],
        ['left', clientX],
        ['right', window.innerWidth - clientX]
      ]
      edgeDistances.sort((a, b) => a[1] - b[1])
      return edgeDistances[0][1] < 160 ? { kind: 'options-edge', edge: edgeDistances[0][0] } : null
    }

    if (payload.kind === 'zoom') {
      let best: ZoomDock | null = null
      let bestDist = Infinity
      for (const corner of ZOOM_DOCKS) {
        const el = zoomZones.current[corner]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const d = distToRect(rect, clientX, clientY)
        if (d < 160 && d < bestDist) {
          bestDist = d
          best = corner
        }
      }
      return best ? { kind: 'zoom-corner', corner: best } : null
    }

    return null
  }, [])

  const startDrag = useCallback((e: ReactPointerEvent, payload: DragPayload) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    gestureRef.current = { payload, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }, [])

  useEffect(() => {
    if (!active) return
    const endGesture = (): void => {
      gestureRef.current = null
      setDragging(null)
      setDragPoint(null)
      setDropTarget(null)
    }
    const onMove = (e: PointerEvent): void => {
      const g = gestureRef.current
      if (!g || g.pointerId !== e.pointerId) return
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return
      g.moved = true
      e.preventDefault()
      setDragging(g.payload)
      setDragPoint({ x: e.clientX, y: e.clientY })
      setDropTarget(computeDropTarget(g.payload, e.clientX, e.clientY))
    }
    const onUp = (e: PointerEvent): void => {
      const g = gestureRef.current
      if (!g || g.pointerId !== e.pointerId) return
      if (g.moved) {
        suppressClickRef.current = true
        const target = computeDropTarget(g.payload, e.clientX, e.clientY)
        if (g.payload.kind === 'item') {
          const itemId = g.payload.id
          if (target?.kind === 'edge-slot') {
            setDraft((prev) => ({ ...prev, docks: placeToolInDock(prev.docks, itemId, target.edge, target.index) }))
          } else if (target?.kind === 'palette' && g.payload.fromEdge !== 'palette') {
            setDraft((prev) => ({ ...prev, docks: removeItemFromDocks(prev.docks, itemId) }))
          }
        } else if (g.payload.kind === 'bar' && target?.kind === 'edge-bar') {
          const from = g.payload.fromEdge
          setDraft((prev) => ({ ...prev, docks: moveWholeDock(prev.docks, from, target.edge) }))
        } else if (g.payload.kind === 'options' && target?.kind === 'options-edge') {
          setDraft((prev) => ({ ...prev, optionsDock: target.edge }))
        } else if (g.payload.kind === 'zoom' && target?.kind === 'zoom-corner') {
          setDraft((prev) => ({ ...prev, zoomDock: target.corner }))
        }
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      endGesture()
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endGesture)
    window.addEventListener('blur', endGesture)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endGesture)
      window.removeEventListener('blur', endGesture)
    }
  }, [active, computeDropTarget])

  // Escape exits customize mode cleanly without firing board-level Escape handlers.
  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return
      if (document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      cancel()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, cancel])

  const value: WorkspaceCustomizeContextValue = {
    active,
    layout: active ? draft : savedLayout,
    dragging,
    dropTarget,
    suppressClickRef,
    updateDraft,
    startDrag,
    registerEdgeEl,
    registerEdgeViewport,
    registerOptionsZone,
    registerZoomZone,
    registerPaletteEl,
    activeCustomPresetId,
    setActiveCustomPresetId,
    commit,
    cancel
  }

  return (
    <WorkspaceCustomizeContext.Provider value={value}>
      {children}
      {active && dragging && dragPoint && <DragGhost payload={dragging} point={dragPoint} />}
    </WorkspaceCustomizeContext.Provider>
  )
}

function DragGhost({ payload, point }: { payload: DragPayload; point: { x: number; y: number } }) {
  const t = useT()
  let icon: ReactNode = null
  let label = ''
  if (payload.kind === 'item') {
    if (isToolbarDivider(payload.id)) {
      icon = <span className="h-5 w-0.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
      label = t('toolbar.divider')
    } else {
      icon = <ToolMiniIcon id={payload.id} />
      label = t(TOOL_LABELS[payload.id])
    }
  } else if (payload.kind === 'bar') {
    icon = <Squares2X2Icon className="size-4 text-blue-600 dark:text-blue-400" />
    label = t(`layout.edge.${payload.fromEdge}` as MessageKey)
  } else if (payload.kind === 'options') {
    label = t('options.label')
  } else if (payload.kind === 'zoom') {
    label = t('layout.zoomPosition')
  }

  return createPortal(
    <div
      aria-hidden
      style={{ left: point.x, top: point.y }}
      className="pointer-events-none fixed z-[95] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm/5 font-medium text-zinc-950 shadow-xl ring-2 ring-blue-500 dark:bg-zinc-800 dark:text-white dark:ring-blue-400"
    >
      {icon}
      <span>{label}</span>
    </div>,
    document.body
  )
}

/** Drop zone placeholder shown on an empty edge while customizing so users can drag tools or bars there. */
export function EmptyEdgeDropZone({ edge }: { edge: DockEdge }) {
  const t = useT()
  const { dragging, dropTarget, registerEdgeEl } = useWorkspaceCustomize()
  const vertical = isVerticalDock(edge)
  const highlighted =
    (dropTarget?.kind === 'edge-slot' && dropTarget.edge === edge) ||
    (dropTarget?.kind === 'edge-bar' && dropTarget.edge === edge)
  const accepting = dragging?.kind === 'item' || (dragging?.kind === 'bar' && dragging.fromEdge !== edge)
  const label =
    dragging?.kind === 'bar' ? t('customize.moveBarHere') : t('customize.dropHere')

  return (
    <div
      ref={(el) => registerEdgeEl(edge, el)}
      className={clsx(
        'pointer-events-auto flex items-center justify-center rounded-2xl border-2 border-dashed text-xs/4 font-medium transition-colors select-none',
        vertical ? 'h-44 w-14 px-1 text-center' : 'h-12 min-w-44 px-4',
        highlighted
          ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:border-blue-400 dark:bg-blue-500/25 dark:text-blue-200'
          : accepting
            ? 'border-blue-400/70 bg-white/90 text-zinc-700 dark:border-blue-400/50 dark:bg-zinc-800/90 dark:text-zinc-200'
            : 'border-zinc-950/20 bg-white/75 text-zinc-500 dark:border-white/20 dark:bg-zinc-800/75 dark:text-zinc-400'
      )}
    >
      <span className={vertical ? '[writing-mode:vertical-rl] rotate-180' : undefined}>{label}</span>
    </div>
  )
}

/** Drop zone shown on top/bottom/left/right while dragging the ToolOptions strip. */
export function OptionsDropZone({ edge }: { edge: OptionsDock }) {
  const t = useT()
  const { dragging, dropTarget, registerOptionsZone } = useWorkspaceCustomize()
  if (dragging?.kind !== 'options') return null
  const vertical = isVerticalDock(edge)
  const highlighted = dropTarget?.kind === 'options-edge' && dropTarget.edge === edge
  return (
    <div
      ref={(el) => registerOptionsZone(edge, el)}
      className={clsx(
        'pointer-events-auto flex items-center justify-center rounded-2xl border-2 border-dashed text-xs/4 font-semibold transition-colors select-none',
        vertical ? 'h-40 w-14 px-1 text-center' : 'h-11 min-w-52 px-4',
        highlighted
          ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:border-blue-400 dark:bg-blue-500/25 dark:text-blue-200'
          : 'border-blue-400/60 bg-white/90 text-zinc-700 dark:border-blue-400/50 dark:bg-zinc-800/90 dark:text-zinc-200'
      )}
    >
      <span className={vertical ? '[writing-mode:vertical-rl] rotate-180' : undefined}>
        {t('options.label')} ({t(`layout.edge.${edge}` as MessageKey)})
      </span>
    </div>
  )
}

/** Drop zone shown in an unoccupied corner while dragging ZoomControls. */
export function ZoomCornerDropZone({ corner }: { corner: ZoomDock }) {
  const t = useT()
  const { dragging, dropTarget, registerZoomZone } = useWorkspaceCustomize()
  if (dragging?.kind !== 'zoom') return null
  const highlighted = dropTarget?.kind === 'zoom-corner' && dropTarget.corner === corner
  const cornerKey: Record<ZoomDock, MessageKey> = {
    'bottom-right': 'layout.zoom.bottomRight',
    'bottom-left': 'layout.zoom.bottomLeft',
    'top-right': 'layout.zoom.topRight',
    'top-left': 'layout.zoom.topLeft'
  }
  return (
    <div
      ref={(el) => registerZoomZone(corner, el)}
      className={clsx(
        'pointer-events-auto flex h-12 min-w-32 items-center justify-center rounded-2xl border-2 border-dashed px-3 text-xs/4 font-semibold transition-colors select-none',
        highlighted
          ? 'border-blue-500 bg-blue-500/15 text-blue-700 dark:border-blue-400 dark:bg-blue-500/25 dark:text-blue-200'
          : 'border-blue-400/60 bg-white/90 text-zinc-700 dark:border-blue-400/50 dark:bg-zinc-800/90 dark:text-zinc-200'
      )}
    >
      {t(cornerKey[corner])}
    </div>
  )
}

const PRESET_NAMES: Record<WorkspacePresetId, MessageKey> = {
  default: 'layout.preset.default',
  split: 'layout.preset.split',
  left: 'layout.preset.left',
  right: 'layout.preset.right',
  bottom: 'layout.preset.bottom'
}

/**
 * Backdrop and central Catalyst customization palette shown over the dimmed canvas while
 * `customizingWorkspace` is true. All 4 screen edges stay interactive above the backdrop.
 */
export function WorkspaceCustomizeOverlay({ templates }: { templates: boolean }) {
  const t = useT()
  const {
    active,
    layout,
    dragging,
    dropTarget,
    suppressClickRef,
    updateDraft,
    startDrag,
    registerPaletteEl,
    activeCustomPresetId,
    setActiveCustomPresetId,
    commit,
    cancel
  } = useWorkspaceCustomize()
  const customPresets = usePrefs((s) => s.customPresets)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const backdropDown = useRef(false)

  useEffect(() => {
    if (!active) {
      setSavingPreset(false)
      setPresetName('')
      setJustSaved(null)
    }
  }, [active])

  if (!active) return null

  const hidden = hiddenToolsInDocks(layout.docks, templates)
  const matched = matchWorkspacePreset(layout, customPresets)
  const selectValue =
    matched.kind === 'builtin'
      ? `builtin:${matched.id}`
      : matched.kind === 'custom'
        ? `custom:${matched.preset.id}`
        : '__unsaved__'

  const activeCustomPreset = activeCustomPresetId ? customPresets.find((p) => p.id === activeCustomPresetId) ?? null : null
  const canUpdateCustom = !!activeCustomPreset && !workspaceLayoutsEqual(layout, activeCustomPreset.layout)

  const handlePresetPick = (val: string): void => {
    if (val.startsWith('builtin:')) {
      const id = val.slice('builtin:'.length) as WorkspacePresetId
      if (WORKSPACE_PRESETS[id]) {
        updateDraft(() => cloneWorkspaceLayout(WORKSPACE_PRESETS[id]))
        setActiveCustomPresetId(null)
      }
    } else if (val.startsWith('custom:')) {
      const id = val.slice('custom:'.length)
      const preset = customPresets.find((p) => p.id === id)
      if (preset) {
        updateDraft(() => cloneWorkspaceLayout(preset.layout))
        setActiveCustomPresetId(preset.id)
      }
    }
  }

  const handleSavePreset = (e: FormEvent): void => {
    e.preventDefault()
    const name = presetName.trim()
    if (!name) return
    const saved = prefsStore.getState().saveCustomPreset(name, layout)
    setActiveCustomPresetId(saved.id)
    setPresetName('')
    setSavingPreset(false)
    setJustSaved(saved.name)
    window.setTimeout(() => setJustSaved(null), 2200)
  }

  const handleUpdatePreset = (): void => {
    if (!activeCustomPreset) return
    prefsStore.getState().updateCustomPreset(activeCustomPreset.id, layout)
    setJustSaved(activeCustomPreset.name)
    window.setTimeout(() => setJustSaved(null), 2200)
  }

  const removingFromBar = dragging?.kind === 'item' && dragging.fromEdge !== 'palette'
  const paletteHighlighted = dropTarget?.kind === 'palette'

  return (
    <>
      <div
        aria-hidden
        onPointerDown={(e) => {
          e.stopPropagation()
          backdropDown.current = e.target === e.currentTarget && e.button === 0 && !dragging
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          const shouldClose = backdropDown.current && !dragging && !suppressClickRef.current && e.target === e.currentTarget
          backdropDown.current = false
          if (shouldClose) commit()
        }}
        onPointerCancel={() => {
          backdropDown.current = false
        }}
        className="fixed inset-0 z-[72] bg-zinc-950/20 backdrop-blur-[1px] dark:bg-black/45"
      />
      <section
        aria-label={t('customize.title')}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-1/2 left-1/2 z-[78] flex max-h-[calc(100dvh-11rem)] w-[min(42rem,calc(100vw-10.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-2xl ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-white dark:ring-white/10"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-950/8 px-5 py-4 dark:border-white/8">
          <div className="min-w-0 flex-1">
            <h2 className="text-base/6 font-semibold">{t('customize.title')}</h2>
            <p className="mt-0.5 text-xs/5 text-zinc-500 dark:text-zinc-400">{t('customize.hint')}</p>
          </div>
          <div className="w-44 shrink-0">
            <Select
              aria-label={t('layout.presets')}
              value={selectValue}
              onChange={(e) => handlePresetPick(e.target.value)}
            >
              {selectValue === '__unsaved__' && <option value="__unsaved__">{t('layout.custom')}</option>}
              <optgroup label={t('layout.presets')}>
                {WORKSPACE_PRESET_IDS.map((id) => (
                  <option key={id} value={`builtin:${id}`}>
                    {t(PRESET_NAMES[id])}
                  </option>
                ))}
              </optgroup>
              {customPresets.length > 0 && (
                <optgroup label={t('layout.myPresets')}>
                  {customPresets.map((p) => (
                    <option key={p.id} value={`custom:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Palette of hidden tools + reusable divider; also acts as drop-to-hide area. */}
          <div
            ref={registerPaletteEl}
            className={clsx(
              'rounded-xl border-2 border-dashed p-3 transition-colors',
              paletteHighlighted
                ? 'border-blue-500 bg-blue-500/10 dark:border-blue-400 dark:bg-blue-500/15'
                : removingFromBar
                  ? 'border-blue-400/70 bg-zinc-50 dark:border-blue-400/50 dark:bg-white/5'
                  : 'border-zinc-950/12 bg-zinc-50/80 dark:border-white/12 dark:bg-white/2.5'
            )}
          >
            {removingFromBar ? (
              <div className="flex min-h-20 items-center justify-center text-sm/5 font-medium text-blue-700 dark:text-blue-300">
                {t('customize.dropToHide')}
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                {/* Reusable divider tile */}
                <button
                  type="button"
                  draggable={false}
                  onPointerDown={(e) => startDrag(e, { kind: 'item', id: 'divider', fromEdge: 'palette' })}
                  onClick={() => {
                    if (suppressClickRef.current) return
                    const target = DOCK_EDGES.find((edge) => layout.docks[edge].length > 0) ?? 'left'
                    updateDraft((prev) => ({ ...prev, docks: placeToolInDock(prev.docks, 'divider', target) }))
                  }}
                  className="flex w-20 cursor-grab touch-none flex-col items-center gap-1 rounded-xl p-1.5 text-center transition-colors hover:bg-zinc-950/5 active:cursor-grabbing dark:hover:bg-white/10"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-950/10 dark:bg-zinc-700 dark:ring-white/10">
                    <span className="h-5 w-0.5 rounded-full bg-zinc-400 dark:bg-zinc-300" />
                  </span>
                  <span className="w-full truncate text-[11px]/3.5 font-medium text-zinc-700 dark:text-zinc-200">
                    {t('toolbar.divider')}
                  </span>
                </button>

                {hidden.map((id) => {
                  const sc = TOOL_SHORTCUTS[id] ? shortcutKey(TOOL_SHORTCUTS[id]!) : undefined
                  return (
                    <button
                      key={id}
                      type="button"
                      draggable={false}
                      onPointerDown={(e) => startDrag(e, { kind: 'item', id, fromEdge: 'palette' })}
                      onClick={() => {
                        if (suppressClickRef.current) return
                        updateDraft((prev) => ({ ...prev, docks: addToolToPreferredDock(prev.docks, id) }))
                      }}
                      className="flex w-20 cursor-grab touch-none flex-col items-center gap-1 rounded-xl p-1.5 text-center transition-colors hover:bg-zinc-950/5 active:cursor-grabbing dark:hover:bg-white/10"
                    >
                      <span className="flex size-9 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-950/10 dark:bg-zinc-700 dark:ring-white/10">
                        <ToolMiniIcon id={id} />
                      </span>
                      <span className="w-full truncate text-[11px]/3.5 font-medium text-zinc-700 dark:text-zinc-200">
                        {t(TOOL_LABELS[id])}
                      </span>
                      {sc && <kbd className="text-[10px]/3 text-zinc-400 dark:text-zinc-500">{sc}</kbd>}
                    </button>
                  )
                })}

                {hidden.length === 0 && (
                  <p className="self-center px-2 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {t('customize.allPlaced')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Live style toggles */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 text-sm/5">
            <div className="flex items-center gap-2">
              <span className="text-xs/5 font-medium text-zinc-500 dark:text-zinc-400">{t('layout.toolOptions')}</span>
              <Segmented<OptionsMode>
                label={t('layout.toolOptions')}
                value={layout.optionsMode}
                onChange={(optionsMode) => updateDraft((prev) => ({ ...prev, optionsMode }))}
                options={[
                  { value: 'strip', label: t('layout.options.strip') },
                  { value: 'popover', label: t('layout.options.popover') }
                ]}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 select-none">
              <Switch
                color="blue"
                checked={layout.insertLabels}
                onChange={(insertLabels) => updateDraft((prev) => ({ ...prev, insertLabels }))}
              />
              <span className="text-xs/5 font-medium text-zinc-700 dark:text-zinc-200">{t('layout.insertLabels')}</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 select-none">
              <Switch
                color="blue"
                checked={layout.collapseSelectTools}
                onChange={(collapseSelectTools) => updateDraft((prev) => ({ ...prev, collapseSelectTools }))}
              />
              <span className="text-xs/5 font-medium text-zinc-700 dark:text-zinc-200">{t('layout.groupSelect')}</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2 select-none">
              <Switch
                color="blue"
                checked={layout.showShortcutBadges}
                onChange={(showShortcutBadges) => updateDraft((prev) => ({ ...prev, showShortcutBadges }))}
              />
              <span className="text-xs/5 font-medium text-zinc-700 dark:text-zinc-200">{t('layout.shortcutBadges')}</span>
            </label>
          </div>

          {/* Inline Save-as-Preset form */}
          {savingPreset && (
            <form
              onSubmit={handleSavePreset}
              className="flex items-center gap-2 rounded-xl bg-zinc-50 p-2.5 ring-1 ring-zinc-950/10 dark:bg-white/5 dark:ring-white/10"
            >
              <div className="min-w-0 flex-1">
                <Input
                  autoFocus
                  value={presetName}
                  placeholder={t('layout.savePresetPlaceholder')}
                  aria-label={t('layout.savePreset')}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.code === 'Escape') setSavingPreset(false)
                  }}
                />
              </div>
              <Button type="submit" color="blue" disabled={!presetName.trim()}>
                {t('common.save')}
              </Button>
              <Button type="button" plain onClick={() => setSavingPreset(false)}>
                {t('common.cancel')}
              </Button>
            </form>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-950/8 px-5 py-3 dark:border-white/8">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              outline
              onClick={() => {
                updateDraft(() => cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT))
                setActiveCustomPresetId(null)
              }}
            >
              <ArrowPathIcon data-slot="icon" />
              {t('toolbar.reset')}
            </Button>
            {!savingPreset && (
              <Button outline onClick={() => setSavingPreset(true)}>
                <BookmarkIcon data-slot="icon" />
                {t('layout.savePreset')}
              </Button>
            )}
            {canUpdateCustom && activeCustomPreset && (
              <Button outline onClick={handleUpdatePreset}>
                <CheckIcon data-slot="icon" />
                {t('layout.updatePreset', { name: activeCustomPreset.name })}
              </Button>
            )}
            {justSaved && (
              <span className="text-xs/5 font-medium text-green-700 dark:text-green-400">
                {t('layout.presetSaved', { name: justSaved })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button plain onClick={cancel}>
              {t('common.cancel')}
            </Button>
            <Button color="blue" onClick={commit}>
              {t('customize.done')}
            </Button>
          </div>
        </footer>
      </section>
    </>
  )
}
