/**
 * Declarative layout configuration for the board chrome. Every built-in preset
 * (Default, Top bar, Right rail, Bottom dock) is just an instance of this data
 * model so users can switch presets in one click or customise each bar freely.
 *
 * Kept free of React and DOM imports so Node tests can import it directly.
 */

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'
export type InsertDock = DockEdge | 'merged'
export type OptionsMode = 'strip' | 'popover'
export type OptionsDock = 'top' | 'bottom'
export type ZoomDock = 'bottom-right' | 'bottom-left' | 'top-right'
export type WorkspacePresetId = 'default' | 'top' | 'right' | 'bottom'

export interface WorkspaceLayout {
  /** Where drawing tools (and merged insert tools) sit. */
  toolsDock: DockEdge
  /** Where insert tools sit, or 'merged' to combine them with drawing tools into one bar. */
  insertDock: InsertDock
  /** 'strip': always-visible options bar; 'popover': open on clicking the active tool. */
  optionsMode: OptionsMode
  /** Where the options strip sits when optionsMode === 'strip'. */
  optionsDock: OptionsDock
  /** Where the zoom controls sit. */
  zoomDock: ZoomDock
  /** Show text labels under icons in a standalone horizontal insert bar. */
  insertLabels: boolean
  /** Collapse lasso, brush select and move into one button, or show them separately. */
  collapseSelectTools: boolean
}

export const WORKSPACE_PRESET_IDS: readonly WorkspacePresetId[] = ['default', 'top', 'right', 'bottom']

export const WORKSPACE_PRESETS: Record<WorkspacePresetId, WorkspaceLayout> = {
  default: {
    toolsDock: 'left',
    insertDock: 'bottom',
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: true,
    collapseSelectTools: true
  },
  top: {
    toolsDock: 'top',
    insertDock: 'merged',
    optionsMode: 'popover',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: false,
    collapseSelectTools: false
  },
  right: {
    toolsDock: 'right',
    insertDock: 'bottom',
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-left',
    insertLabels: true,
    collapseSelectTools: true
  },
  bottom: {
    toolsDock: 'bottom',
    insertDock: 'merged',
    optionsMode: 'strip',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: false,
    collapseSelectTools: true
  }
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = WORKSPACE_PRESETS.default

const DOCK_EDGES: readonly DockEdge[] = ['top', 'bottom', 'left', 'right']
const INSERT_DOCKS: readonly InsertDock[] = ['top', 'bottom', 'left', 'right', 'merged']
const OPTIONS_MODES: readonly OptionsMode[] = ['strip', 'popover']
const OPTIONS_DOCKS: readonly OptionsDock[] = ['top', 'bottom']
const ZOOM_DOCKS: readonly ZoomDock[] = ['bottom-right', 'bottom-left', 'top-right']

export function cleanWorkspaceLayout(value: unknown): WorkspaceLayout {
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const def = DEFAULT_WORKSPACE_LAYOUT
  return {
    toolsDock: DOCK_EDGES.includes(o.toolsDock as DockEdge) ? (o.toolsDock as DockEdge) : def.toolsDock,
    insertDock: INSERT_DOCKS.includes(o.insertDock as InsertDock) ? (o.insertDock as InsertDock) : def.insertDock,
    optionsMode: OPTIONS_MODES.includes(o.optionsMode as OptionsMode) ? (o.optionsMode as OptionsMode) : def.optionsMode,
    optionsDock: OPTIONS_DOCKS.includes(o.optionsDock as OptionsDock) ? (o.optionsDock as OptionsDock) : def.optionsDock,
    zoomDock: ZOOM_DOCKS.includes(o.zoomDock as ZoomDock) ? (o.zoomDock as ZoomDock) : def.zoomDock,
    insertLabels: typeof o.insertLabels === 'boolean' ? o.insertLabels : def.insertLabels,
    collapseSelectTools: typeof o.collapseSelectTools === 'boolean' ? o.collapseSelectTools : def.collapseSelectTools
  }
}

export function workspaceLayoutsEqual(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  return (
    a.toolsDock === b.toolsDock &&
    a.insertDock === b.insertDock &&
    a.optionsMode === b.optionsMode &&
    a.optionsDock === b.optionsDock &&
    a.zoomDock === b.zoomDock &&
    a.insertLabels === b.insertLabels &&
    a.collapseSelectTools === b.collapseSelectTools
  )
}

/** Identify which built-in preset matches the layout, or 'custom' if any option differs. */
export function detectWorkspacePreset(layout: WorkspaceLayout): WorkspacePresetId | 'custom' {
  for (const id of WORKSPACE_PRESET_IDS) {
    if (workspaceLayoutsEqual(layout, WORKSPACE_PRESETS[id])) return id
  }
  return 'custom'
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
