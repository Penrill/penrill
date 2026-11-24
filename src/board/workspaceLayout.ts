/**
 * Declarative 4-edge layout configuration for the board chrome and custom user presets.
 * Any tool or divider can sit on any screen edge (top, bottom, left, right), while built-in
 * and user-saved presets are plain WorkspaceLayout snapshots.
 *
 * Kept free of React and DOM imports so Node tests can import it directly.
 */
import {
  cleanToolbarLayout,
  DEFAULT_TOOLBAR,
  DEFAULT_TOOLBAR_WITH_DIVIDERS,
  insertDefaultDividers,
  isInsertTool,
  isToolbarDivider,
  resolveToolbarItems,
  sanitizeDividers,
  type ConcreteToolId,
  type ToolbarItemId
} from './toolbarLayout'

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'
export type EdgeDocks = Record<DockEdge, ToolbarItemId[]>
export type OptionsMode = 'strip' | 'popover'
export type OptionsDock = DockEdge
export type ZoomDock = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type WorkspacePresetId = 'default' | 'top' | 'left' | 'right' | 'bottom'

export const DOCK_EDGES: readonly DockEdge[] = ['top', 'bottom', 'left', 'right']
export const ZOOM_DOCKS: readonly ZoomDock[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']
export const WORKSPACE_PRESET_IDS: readonly WorkspacePresetId[] = ['default', 'top', 'left', 'right', 'bottom']

export interface WorkspaceLayout {
  /** Ordered tools and dividers docked to each screen edge. Each tool sits on at most one edge. */
  docks: EdgeDocks
  /** 'strip': always-visible options bar; 'popover': open on clicking the active tool. */
  optionsMode: OptionsMode
  /** Where the options strip sits when optionsMode === 'strip'. */
  optionsDock: OptionsDock
  /** Where the zoom controls sit. */
  zoomDock: ZoomDock
  /** Show text labels under icons on horizontal insert-only bars. */
  insertLabels: boolean
  /** Collapse lasso, brush select and move into one button when multiple sit on the same bar. */
  collapseSelectTools: boolean
  /** Show short single-key shortcut badges (1, 2, 3, E, V...) in the corner of toolbar buttons. */
  showShortcutBadges: boolean
}

export interface CustomWorkspacePreset {
  id: string
  name: string
  layout: WorkspaceLayout
  updatedAt: number
}

export const DEFAULT_DRAWING_DOCK: readonly ToolbarItemId[] = [
  'select', 'brushSelect', 'move', 'pan',
  'divider:nav',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser',
  'divider:present',
  'laser',
  'divider:history',
  'undo', 'redo'
]

export const DEFAULT_INSERT_DOCK: readonly ToolbarItemId[] = [
  'text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates'
]

export function emptyEdgeDocks(): EdgeDocks {
  return { top: [], bottom: [], left: [], right: [] }
}

export function cloneEdgeDocks(docks: EdgeDocks): EdgeDocks {
  return {
    top: [...docks.top],
    bottom: [...docks.bottom],
    left: [...docks.left],
    right: [...docks.right]
  }
}

export function cloneWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  return {
    ...layout,
    docks: cloneEdgeDocks(layout.docks)
  }
}

export const WORKSPACE_PRESETS: Record<WorkspacePresetId, WorkspaceLayout> = {
  default: {
    docks: {
      top: [...DEFAULT_DRAWING_DOCK],
      bottom: [],
      left: [...DEFAULT_INSERT_DOCK],
      right: []
    },
    optionsMode: 'popover',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: true,
    collapseSelectTools: true,
    showShortcutBadges: false
  },
  top: {
    docks: {
      top: [...DEFAULT_TOOLBAR_WITH_DIVIDERS],
      bottom: [],
      left: [],
      right: []
    },
    optionsMode: 'popover',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: false,
    collapseSelectTools: false,
    showShortcutBadges: true
  },
  left: {
    docks: {
      top: [],
      bottom: [...DEFAULT_INSERT_DOCK],
      left: [...DEFAULT_DRAWING_DOCK],
      right: []
    },
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: true,
    collapseSelectTools: true,
    showShortcutBadges: false
  },
  right: {
    docks: {
      top: [],
      bottom: [...DEFAULT_INSERT_DOCK],
      left: [],
      right: [...DEFAULT_DRAWING_DOCK]
    },
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-left',
    insertLabels: true,
    collapseSelectTools: true,
    showShortcutBadges: false
  },
  bottom: {
    docks: {
      top: [],
      bottom: [...DEFAULT_TOOLBAR_WITH_DIVIDERS],
      left: [],
      right: []
    },
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: false,
    collapseSelectTools: true,
    showShortcutBadges: false
  }
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = WORKSPACE_PRESETS.default

const OPTIONS_MODES: readonly OptionsMode[] = ['strip', 'popover']
const OPTIONS_DOCKS: readonly OptionsDock[] = DOCK_EDGES

/** Sanitize a 4-edge docks map, ensuring each tool and divider ID appears at most once globally. */
export function cleanEdgeDocks(value: unknown, fallback: EdgeDocks = DEFAULT_WORKSPACE_LAYOUT.docks): EdgeDocks {
  if (!value || typeof value !== 'object') return cloneEdgeDocks(fallback)
  const raw = value as Record<string, unknown>
  const hasAnyEdge = DOCK_EDGES.some((edge) => Array.isArray(raw[edge]))
  if (!hasAnyEdge) return cloneEdgeDocks(fallback)

  const seenTools = new Set<string>()
  const seenDividers = new Set<string>()
  const out = emptyEdgeDocks()
  let extraDivider = 0

  for (const edge of DOCK_EDGES) {
    const cleaned = cleanToolbarLayout(raw[edge]) ?? []
    const items: ToolbarItemId[] = []
    for (const item of cleaned) {
      if (isToolbarDivider(item)) {
        let divId = item === 'divider' ? (`divider:m${++extraDivider}` as ToolbarItemId) : item
        while (seenDividers.has(divId)) divId = `divider:m${++extraDivider}` as ToolbarItemId
        seenDividers.add(divId)
        items.push(divId)
      } else if (!seenTools.has(item)) {
        seenTools.add(item)
        items.push(item)
      }
    }
    out[edge] = items
  }
  return out
}

/** Generate a unique `divider:<id>` not present on any of the four screen edges. */
export function makeUniqueDividerId(docks: EdgeDocks, hint?: string): `divider:${string}` {
  const used = new Set<string>()
  for (const edge of DOCK_EDGES) {
    for (const item of docks[edge]) {
      if (isToolbarDivider(item)) used.add(item)
    }
  }
  if (hint) {
    const candidate = `divider:${hint}` as `divider:${string}`
    if (!used.has(candidate)) return candidate
  }
  let n = 1
  while (used.has(`divider:d${n}`)) n++
  return `divider:d${n}`
}

/**
 * Migrate legacy v1/v2/v3 workspaceLayout + flat toolbarLayout settings into the v4 4-edge model.
 */
export function migrateLegacyLayout(legacyLayout: unknown, legacyToolbarLayout: unknown): WorkspaceLayout {
  const o = (legacyLayout && typeof legacyLayout === 'object' ? legacyLayout : {}) as Record<string, unknown>
  const def = DEFAULT_WORKSPACE_LAYOUT

  const hasExplicitV3 = typeof o.toolsDock === 'string' || typeof o.insertDock === 'string'
  const toolsDock: DockEdge = DOCK_EDGES.includes(o.toolsDock as DockEdge)
    ? (o.toolsDock as DockEdge)
    : hasExplicitV3
      ? 'left'
      : 'top'
  const rawInsertDock = o.insertDock
  const insertDock: DockEdge | 'merged' =
    rawInsertDock === 'merged' || DOCK_EDGES.includes(rawInsertDock as DockEdge)
      ? (rawInsertDock as DockEdge | 'merged')
      : hasExplicitV3
        ? 'bottom'
        : 'left'

  const cleanedFlat = cleanToolbarLayout(legacyToolbarLayout)
  const flatItems = cleanedFlat
    ? cleanedFlat.some((id) => isToolbarDivider(id))
      ? cleanedFlat
      : insertDefaultDividers(cleanedFlat)
    : resolveToolbarItems(null)

  const docks = emptyEdgeDocks()
  if (insertDock === 'merged') {
    docks[toolsDock] = sanitizeDividers(flatItems)
  } else if (insertDock === toolsDock) {
    docks[toolsDock] = sanitizeDividers(flatItems)
  } else {
    const drawingItems = sanitizeDividers(flatItems.filter((id) => isToolbarDivider(id) || !isInsertTool(id)))
    const insertItems = sanitizeDividers(flatItems.filter((id) => isToolbarDivider(id) || isInsertTool(id)))
    docks[toolsDock] = drawingItems
    docks[insertDock] = insertItems
  }

  return {
    docks: cleanEdgeDocks(docks),
    optionsMode: OPTIONS_MODES.includes(o.optionsMode as OptionsMode) ? (o.optionsMode as OptionsMode) : def.optionsMode,
    optionsDock: OPTIONS_DOCKS.includes(o.optionsDock as OptionsDock) ? (o.optionsDock as OptionsDock) : def.optionsDock,
    zoomDock: ZOOM_DOCKS.includes(o.zoomDock as ZoomDock) ? (o.zoomDock as ZoomDock) : def.zoomDock,
    insertLabels: typeof o.insertLabels === 'boolean' ? o.insertLabels : def.insertLabels,
    collapseSelectTools: typeof o.collapseSelectTools === 'boolean' ? o.collapseSelectTools : def.collapseSelectTools,
    showShortcutBadges: typeof o.showShortcutBadges === 'boolean' ? o.showShortcutBadges : def.showShortcutBadges
  }
}

export function cleanWorkspaceLayout(value: unknown, legacyToolbarLayout?: unknown): WorkspaceLayout {
  if (!value || typeof value !== 'object') {
    if (Array.isArray(legacyToolbarLayout)) return migrateLegacyLayout(null, legacyToolbarLayout)
    return cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT)
  }
  const o = value as Record<string, unknown>
  // Support migrating persisted v3 objects that stored toolsDock / insertDock instead of docks.
  if (!o.docks && (typeof o.toolsDock === 'string' || typeof o.insertDock === 'string')) {
    return migrateLegacyLayout(o, legacyToolbarLayout)
  }
  const def = DEFAULT_WORKSPACE_LAYOUT
  return {
    docks: cleanEdgeDocks(o.docks, def.docks),
    optionsMode: OPTIONS_MODES.includes(o.optionsMode as OptionsMode) ? (o.optionsMode as OptionsMode) : def.optionsMode,
    optionsDock: OPTIONS_DOCKS.includes(o.optionsDock as OptionsDock) ? (o.optionsDock as OptionsDock) : def.optionsDock,
    zoomDock: ZOOM_DOCKS.includes(o.zoomDock as ZoomDock) ? (o.zoomDock as ZoomDock) : def.zoomDock,
    insertLabels: typeof o.insertLabels === 'boolean' ? o.insertLabels : def.insertLabels,
    collapseSelectTools: typeof o.collapseSelectTools === 'boolean' ? o.collapseSelectTools : def.collapseSelectTools,
    showShortcutBadges: typeof o.showShortcutBadges === 'boolean' ? o.showShortcutBadges : def.showShortcutBadges
  }
}

function edgeItemsEqual(a: readonly ToolbarItemId[], b: readonly ToolbarItemId[]): boolean {
  const sa = sanitizeDividers(a)
  const sb = sanitizeDividers(b)
  if (sa.length !== sb.length) return false
  for (let i = 0; i < sa.length; i++) {
    if (isToolbarDivider(sa[i]) && isToolbarDivider(sb[i])) continue
    if (sa[i] !== sb[i]) return false
  }
  return true
}

export function edgeDocksEqual(a: EdgeDocks, b: EdgeDocks): boolean {
  return DOCK_EDGES.every((edge) => edgeItemsEqual(a[edge], b[edge]))
}

export function workspaceLayoutsEqual(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  return (
    edgeDocksEqual(a.docks, b.docks) &&
    a.optionsMode === b.optionsMode &&
    a.optionsDock === b.optionsDock &&
    a.zoomDock === b.zoomDock &&
    a.insertLabels === b.insertLabels &&
    a.collapseSelectTools === b.collapseSelectTools &&
    a.showShortcutBadges === b.showShortcutBadges
  )
}

/** Identify which built-in preset matches the layout, or 'custom' if any option differs. */
export function detectWorkspacePreset(layout: WorkspaceLayout): WorkspacePresetId | 'custom' {
  for (const id of WORKSPACE_PRESET_IDS) {
    if (workspaceLayoutsEqual(layout, WORKSPACE_PRESETS[id])) return id
  }
  return 'custom'
}

export type MatchedWorkspacePreset =
  | { kind: 'builtin'; id: WorkspacePresetId }
  | { kind: 'custom'; preset: CustomWorkspacePreset }
  | { kind: 'unsaved' }

/** Match a layout against built-in presets first, then user-saved presets. */
export function matchWorkspacePreset(
  layout: WorkspaceLayout,
  customPresets: readonly CustomWorkspacePreset[]
): MatchedWorkspacePreset {
  const builtin = detectWorkspacePreset(layout)
  if (builtin !== 'custom') return { kind: 'builtin', id: builtin }
  for (const preset of customPresets) {
    if (workspaceLayoutsEqual(layout, preset.layout)) return { kind: 'custom', preset }
  }
  return { kind: 'unsaved' }
}

/** All concrete tools currently placed on any screen edge. */
export function allPlacedTools(docks: EdgeDocks): Set<ConcreteToolId> {
  const set = new Set<ConcreteToolId>()
  for (const edge of DOCK_EDGES) {
    for (const item of docks[edge]) {
      if (!isToolbarDivider(item)) set.add(item)
    }
  }
  return set
}

/** Concrete tools not placed on any screen edge. */
export function hiddenToolsInDocks(docks: EdgeDocks, templates = true): ConcreteToolId[] {
  const placed = allPlacedTools(docks)
  return DEFAULT_TOOLBAR.filter((id) => (id !== 'templates' || templates) && !placed.has(id))
}

/** Find which edge and index currently hold `item`, or null if hidden. */
export function findItemInDocks(docks: EdgeDocks, item: ToolbarItemId): { edge: DockEdge; index: number } | null {
  for (const edge of DOCK_EDGES) {
    const index = docks[edge].indexOf(item)
    if (index >= 0) return { edge, index }
  }
  return null
}

/**
 * Place a tool or divider on `targetEdge` at `targetIndex` (appending when omitted).
 * Passing `'divider'` creates a fresh unique divider ID. Moving an existing item removes it from
 * its previous slot and sanitizes dividers left behind on a different source edge.
 */
export function placeToolInDock(
  docks: EdgeDocks,
  item: ToolbarItemId,
  targetEdge: DockEdge,
  targetIndex?: number
): EdgeDocks {
  const next = cloneEdgeDocks(docks)
  const entry: ToolbarItemId = item === 'divider' ? makeUniqueDividerId(next) : item
  const existing = item === 'divider' ? null : findItemInDocks(next, entry)

  let insertAt = targetIndex ?? next[targetEdge].length

  if (existing) {
    next[existing.edge].splice(existing.index, 1)
    if (existing.edge === targetEdge) {
      if (existing.index < insertAt) insertAt--
    } else if (!isToolbarDivider(entry)) {
      next[existing.edge] = sanitizeDividers(next[existing.edge])
    }
  }

  const clamped = Math.max(0, Math.min(next[targetEdge].length, insertAt))
  next[targetEdge].splice(clamped, 0, entry)
  return next
}

/** Remove one tool or specific divider from whichever edge holds it. */
export function removeItemFromDocks(docks: EdgeDocks, item: ToolbarItemId): EdgeDocks {
  const found = findItemInDocks(docks, item)
  if (!found) return cloneEdgeDocks(docks)
  const next = cloneEdgeDocks(docks)
  next[found.edge].splice(found.index, 1)
  if (!isToolbarDivider(item)) {
    next[found.edge] = sanitizeDividers(next[found.edge])
  }
  return next
}

/**
 * Move an entire edge bar to another edge. If `toEdge` already has items, merges the moved bar
 * onto the end of `toEdge` separated by a divider.
 */
export function moveWholeDock(docks: EdgeDocks, fromEdge: DockEdge, toEdge: DockEdge): EdgeDocks {
  if (fromEdge === toEdge || docks[fromEdge].length === 0) return cloneEdgeDocks(docks)
  const next = cloneEdgeDocks(docks)
  const moving = sanitizeDividers(next[fromEdge])
  next[fromEdge] = []
  if (next[toEdge].length === 0) {
    next[toEdge] = moving
  } else if (moving.length > 0) {
    const sep = makeUniqueDividerId(next)
    next[toEdge] = sanitizeDividers([...next[toEdge], sep, ...moving])
  }
  return next
}

/** Pick a natural edge for quick-adding a hidden tool (e.g. clicking a tile in the palette). */
export function preferredEdgeForTool(docks: EdgeDocks, toolId: ConcreteToolId): DockEdge {
  const insert = isInsertTool(toolId)
  const order: readonly DockEdge[] = insert ? ['left', 'bottom', 'top', 'right'] : ['top', 'left', 'right', 'bottom']
  for (const edge of order) {
    if (docks[edge].some((id) => !isToolbarDivider(id) && isInsertTool(id) === insert)) return edge
  }
  for (const edge of order) {
    if (docks[edge].length > 0) return edge
  }
  return insert ? 'left' : 'top'
}

/** Quick-add a hidden tool to the most natural bar edge. */
export function addToolToPreferredDock(docks: EdgeDocks, toolId: ConcreteToolId): EdgeDocks {
  if (findItemInDocks(docks, toolId)) return cloneEdgeDocks(docks)
  return placeToolInDock(docks, toolId, preferredEdgeForTool(docks, toolId))
}

export function cleanCustomPresets(value: unknown): CustomWorkspacePreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: CustomWorkspacePreset[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      layout: cleanWorkspaceLayout(o.layout),
      updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : Date.now()
    })
  }
  return out
}

export function isVerticalDock(edge: DockEdge): boolean {
  return edge === 'left' || edge === 'right'
}

/** Direction a flyout or popover opens from a bar docked to `edge`, always inward toward the canvas. */
export function flyoutAnchor(edge: DockEdge): 'top' | 'bottom' | 'left' | 'right' {
  if (edge === 'top') return 'bottom'
  if (edge === 'bottom') return 'top'
  if (edge === 'left') return 'right'
  return 'left'
}

/** Direction pen, highlighter and eraser tips point from a bar docked to `edge`, always toward the canvas. */
export function penDirection(edge: DockEdge): 'down' | 'up' | 'right' | 'left' {
  if (edge === 'top') return 'down'
  if (edge === 'bottom') return 'up'
  if (edge === 'left') return 'right'
  return 'left'
}
