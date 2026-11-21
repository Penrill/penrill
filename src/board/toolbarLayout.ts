/**
 * Every tool button, in the order Settings lists them. The saved `toolbarLayout` preference is the
 * list of buttons the user shows (null: all of them). It used to be an ordered toolbar with
 * dividers; the board now places each tool itself, so only membership counts and older saved
 * layouts keep their hidden tools hidden.
 */
export const DEFAULT_TOOLBAR = [
  'select', 'brushSelect', 'move', 'pan',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', 'laser',
  'text', 'formula', 'shapes', 'graph', 'templates', 'image',
  'instruments',
  'undo', 'redo'
] as const

export type ToolbarToolId = (typeof DEFAULT_TOOLBAR)[number] | 'divider'
export type ToolbarItemId = ToolbarToolId | `divider:${string}`

export function isToolbarDivider(id: string): boolean {
  return id === 'divider' || /^divider:[a-zA-Z0-9-]+$/.test(id)
}

export function toolbarToolId(id: ToolbarItemId): ToolbarToolId {
  return isToolbarDivider(id) ? 'divider' : id as ToolbarToolId
}

/** Instruments had a button each up to 0.10.0; they now share one dropdown. */
const OLD_INSTRUMENT_BUTTONS = ['ruler', 'square45', 'square60', 'protractor', 'compass']

export function cleanToolbarLayout(value: unknown): ToolbarItemId[] | null {
  if (!Array.isArray(value)) return null
  // A saved layout with the old instrument buttons gets the dropdown where the first of them was.
  const ids = value.map((id) => (typeof id === 'string' && OLD_INSTRUMENT_BUTTONS.includes(id) ? 'instruments' : id))
  return [...new Set(ids.filter((id): id is ToolbarItemId => typeof id === 'string' && (DEFAULT_TOOLBAR.some((tool) => tool === id) || /^divider:[a-zA-Z0-9-]+$/.test(id))))]
}

/** Whether a tool button is shown, by the saved layout (null shows everything). */
export function isToolShown(layout: readonly ToolbarItemId[] | null, id: ToolbarToolId): boolean {
  return !layout || layout.includes(id)
}

/** The layout to save after showing or hiding one tool: null again once everything is shown. */
export function withToolShown(layout: readonly ToolbarItemId[] | null, id: ToolbarToolId, shown: boolean): ToolbarItemId[] | null {
  const next = DEFAULT_TOOLBAR.filter((tool) => (tool === id ? shown : isToolShown(layout, tool)))
  return next.length === DEFAULT_TOOLBAR.length ? null : [...next]
}
