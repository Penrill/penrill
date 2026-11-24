/**
 * Every tool button, its order and optional dividers. The saved `toolbarLayout` preference holds
 * the ordered list of visible tools and `divider:<id>` separators (`null` means the built-in
 * default order with all tools shown and default group dividers).
 *
 * The same list drives both the unified (merged) toolbar and the split drawing / insert bars via
 * `projectBarItems`, so switching layouts keeps the user's custom order, hidden tools and dividers.
 */
export const DEFAULT_TOOLBAR = [
  'select', 'brushSelect', 'move', 'pan',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', 'laser',
  'text', 'formula', 'shapes', 'graph', 'templates', 'image',
  'instruments',
  'undo', 'redo'
] as const

export const SELECT_TOOLS = ['select', 'brushSelect', 'move'] as const
export type SelectToolId = (typeof SELECT_TOOLS)[number]

export const INSERT_TOOLS = ['text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates'] as const
export type InsertToolId = (typeof INSERT_TOOLS)[number]

export const DRAWING_TOOLS = [
  'select', 'brushSelect', 'move', 'pan',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', 'laser',
  'undo', 'redo'
] as const
export type DrawingToolId = (typeof DRAWING_TOOLS)[number]

export type ToolbarToolId = (typeof DEFAULT_TOOLBAR)[number] | 'divider'
export type ConcreteToolId = Exclude<ToolbarToolId, 'divider'>
export type ToolbarItemId = ToolbarToolId | `divider:${string}`

/** Canonical ordered toolbar with default group dividers. */
export const DEFAULT_TOOLBAR_WITH_DIVIDERS: readonly ToolbarItemId[] = [
  'select', 'brushSelect', 'move', 'pan',
  'divider:nav',
  'pen1', 'pen2', 'pen3', 'highlighter', 'eraser',
  'divider:present',
  'laser',
  'divider:insert',
  'text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates',
  'divider:history',
  'undo', 'redo'
]

export function isToolbarDivider(id: string): id is 'divider' | `divider:${string}` {
  return id === 'divider' || /^divider:[a-zA-Z0-9-]+$/.test(id)
}

export function isInsertTool(id: string): id is InsertToolId {
  return (INSERT_TOOLS as readonly string[]).includes(id)
}

export function isSelectTool(id: string): id is SelectToolId {
  return (SELECT_TOOLS as readonly string[]).includes(id)
}

export function toolbarToolId(id: ToolbarItemId): ToolbarToolId {
  return isToolbarDivider(id) ? 'divider' : (id as ToolbarToolId)
}

/** Instruments had a button each up to 0.10.0; they now share one dropdown. */
const OLD_INSTRUMENT_BUTTONS = ['ruler', 'square45', 'square60', 'protractor', 'compass']

export function cleanToolbarLayout(value: unknown): ToolbarItemId[] | null {
  if (!Array.isArray(value)) return null
  // A saved layout with the old instrument buttons gets the dropdown where the first of them was.
  const ids = value.map((id) => (typeof id === 'string' && OLD_INSTRUMENT_BUTTONS.includes(id) ? 'instruments' : id))
  return [
    ...new Set(
      ids.filter(
        (id): id is ToolbarItemId =>
          typeof id === 'string' && (DEFAULT_TOOLBAR.some((tool) => tool === id) || /^divider:[a-zA-Z0-9-]+$/.test(id))
      )
    )
  ]
}

/** Drop leading, trailing and adjacent dividers. */
export function sanitizeDividers(items: readonly ToolbarItemId[]): ToolbarItemId[] {
  const out: ToolbarItemId[] = []
  for (const item of items) {
    if (isToolbarDivider(item)) {
      if (out.length === 0 || isToolbarDivider(out[out.length - 1])) continue
    }
    out.push(item)
  }
  while (out.length > 0 && isToolbarDivider(out[out.length - 1])) out.pop()
  return out
}

/** Concrete list of items for editing or rendering (`null` resolves to the built-in default). */
export function resolveToolbarItems(layout: readonly ToolbarItemId[] | null): ToolbarItemId[] {
  return layout ? [...layout] : [...DEFAULT_TOOLBAR_WITH_DIVIDERS]
}

/** True when `items` matches the built-in default order and divider positions (ignoring divider IDs). */
export function isDefaultToolbarLayout(items: readonly ToolbarItemId[]): boolean {
  if (items.length !== DEFAULT_TOOLBAR_WITH_DIVIDERS.length) return false
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const b = DEFAULT_TOOLBAR_WITH_DIVIDERS[i]
    if (isToolbarDivider(a) && isToolbarDivider(b)) continue
    if (a !== b) return false
  }
  return true
}

function defaultGroupOf(id: ConcreteToolId): number {
  if (id === 'select' || id === 'brushSelect' || id === 'move' || id === 'pan') return 0
  if (id === 'pen1' || id === 'pen2' || id === 'pen3' || id === 'highlighter' || id === 'eraser') return 1
  if (id === 'laser') return 2
  if (isInsertTool(id)) return 3
  return 4
}

/**
 * Migrate a flat v0.13 layout (no dividers) by restoring natural group dividers between distinct
 * default groups, while keeping the exact visible tools and their order.
 */
export function insertDefaultDividers(layout: readonly ToolbarItemId[]): ToolbarItemId[] {
  if (layout.some((id) => isToolbarDivider(id))) return [...layout]
  const out: ToolbarItemId[] = []
  let prevGroup: number | null = null
  let dividerCount = 0
  for (const item of layout) {
    if (isToolbarDivider(item)) continue
    const group = defaultGroupOf(item)
    if (prevGroup !== null && group !== prevGroup) {
      out.push(`divider:g${++dividerCount}`)
    }
    out.push(item)
    prevGroup = group
  }
  return out
}

/** Whether a tool button is shown, by the saved layout (null shows everything). */
export function isToolShown(layout: readonly ToolbarItemId[] | null, id: ToolbarToolId): boolean {
  return !layout || layout.includes(id)
}

function makeDividerId(existing: readonly ToolbarItemId[], hint?: string): `divider:${string}` {
  const used = new Set(existing)
  if (hint) {
    const candidate = `divider:${hint}` as `divider:${string}`
    if (!used.has(candidate)) return candidate
  }
  let n = 1
  while (used.has(`divider:d${n}`)) n++
  return `divider:d${n}`
}

/**
 * Show or hide one tool while preserving the user's custom order and dividers.
 * Returns `null` when the resulting list matches the built-in default again.
 */
export function withToolShown(
  layout: readonly ToolbarItemId[] | null,
  id: ToolbarToolId,
  shown: boolean
): ToolbarItemId[] | null {
  if (isToolbarDivider(id)) return layout ? [...layout] : null
  const current = resolveToolbarItems(layout)
  if (!shown) {
    const next = sanitizeDividers(current.filter((item) => item !== id))
    return isDefaultToolbarLayout(next) ? null : next
  }
  if (current.includes(id)) return isDefaultToolbarLayout(current) ? null : current

  const defIdx = DEFAULT_TOOLBAR_WITH_DIVIDERS.indexOf(id)
  if (defIdx < 0) return current

  // Find boundaries of `id`'s default group (between dividers).
  let groupStart = defIdx
  while (groupStart > 0 && !isToolbarDivider(DEFAULT_TOOLBAR_WITH_DIVIDERS[groupStart - 1])) groupStart--
  let groupEnd = defIdx
  while (groupEnd < DEFAULT_TOOLBAR_WITH_DIVIDERS.length - 1 && !isToolbarDivider(DEFAULT_TOOLBAR_WITH_DIVIDERS[groupEnd + 1])) groupEnd++

  const next = [...current]
  let inserted = false

  // 1. Prefer inserting right after the nearest visible preceding tool in the same default group.
  for (let i = defIdx - 1; i >= groupStart; i--) {
    const pos = next.indexOf(DEFAULT_TOOLBAR_WITH_DIVIDERS[i])
    if (pos >= 0) {
      next.splice(pos + 1, 0, id)
      inserted = true
      break
    }
  }

  // 2. Otherwise right before the nearest visible following tool in the same default group.
  if (!inserted) {
    for (let i = defIdx + 1; i <= groupEnd; i++) {
      const pos = next.indexOf(DEFAULT_TOOLBAR_WITH_DIVIDERS[i])
      if (pos >= 0) {
        next.splice(pos, 0, id)
        inserted = true
        break
      }
    }
  }

  // 3. The entire default group was hidden: place after the nearest preceding visible tool and
  // restore separating dividers around the newly re-introduced group.
  if (!inserted) {
    let prevPos = -1
    for (let i = defIdx - 1; i >= 0; i--) {
      const candidate = DEFAULT_TOOLBAR_WITH_DIVIDERS[i]
      if (isToolbarDivider(candidate)) continue
      const pos = next.indexOf(candidate)
      if (pos >= 0) {
        prevPos = pos
        break
      }
    }
    if (prevPos >= 0) {
      let at = prevPos + 1
      if (at < next.length && isToolbarDivider(next[at])) at++
      const toInsert: ToolbarItemId[] = []
      if (at > 0 && !isToolbarDivider(next[at - 1])) toInsert.push(makeDividerId(next))
      toInsert.push(id)
      if (at < next.length && !isToolbarDivider(next[at])) toInsert.push(makeDividerId([...next, ...toInsert]))
      next.splice(at, 0, ...toInsert)
    } else {
      const toInsert: ToolbarItemId[] = [id]
      if (next.length > 0 && !isToolbarDivider(next[0])) toInsert.push(makeDividerId(next))
      next.splice(0, 0, ...toInsert)
    }
  }

  const cleaned = sanitizeDividers(next)
  return isDefaultToolbarLayout(cleaned) ? null : cleaned
}

/** Move an item in the ordered toolbar list from `fromIndex` to `toIndex`. */
export function moveToolbarItem(
  layout: readonly ToolbarItemId[] | null,
  fromIndex: number,
  toIndex: number
): ToolbarItemId[] | null {
  const items = resolveToolbarItems(layout)
  if (fromIndex < 0 || fromIndex >= items.length) return layout ? [...layout] : null
  const target = Math.max(0, Math.min(items.length - 1, toIndex))
  if (fromIndex === target) return isDefaultToolbarLayout(items) ? null : items
  const [moved] = items.splice(fromIndex, 1)
  items.splice(target, 0, moved)
  return isDefaultToolbarLayout(items) ? null : items
}

/** Insert a new divider into the toolbar list (defaults to index 0 so it is immediately visible). */
export function addToolbarDivider(
  layout: readonly ToolbarItemId[] | null,
  atIndex = 0,
  id?: string
): ToolbarItemId[] {
  const items = resolveToolbarItems(layout)
  const divider = makeDividerId(items, id)
  const pos = Math.max(0, Math.min(items.length, atIndex))
  items.splice(pos, 0, divider)
  return items
}

/** Remove one tool or specific divider from the toolbar list. */
export function removeToolbarItem(
  layout: readonly ToolbarItemId[] | null,
  id: ToolbarItemId
): ToolbarItemId[] | null {
  const items = resolveToolbarItems(layout)
  const filtered = items.filter((item) => item !== id)
  const next = isToolbarDivider(id) ? filtered : sanitizeDividers(filtered)
  return isDefaultToolbarLayout(next) ? null : next
}

export type BarScope = 'drawing' | 'insert' | 'merged'

export type ProjectedBarItem =
  | { kind: 'tool'; id: ConcreteToolId }
  | { kind: 'selectGroup'; modes: SelectToolId[] }
  | { kind: 'divider'; id: string }

/**
 * Project the unified `toolbarLayout` onto a specific bar (`drawing`, `insert` or `merged`),
 * collapsing selection modes when requested and trimming leading, trailing or adjacent dividers.
 */
export function projectBarItems(
  layout: readonly ToolbarItemId[] | null,
  scope: BarScope,
  options: { templates?: boolean; collapseSelect?: boolean } = {}
): ProjectedBarItem[] {
  const { templates = true, collapseSelect = false } = options
  const raw = resolveToolbarItems(layout)
  const visibleSelectModes = raw.filter((id): id is SelectToolId => isSelectTool(id))
  const out: ProjectedBarItem[] = []
  let selectEmitted = false

  for (const item of raw) {
    if (isToolbarDivider(item)) {
      if (out.length > 0 && out[out.length - 1].kind !== 'divider') {
        out.push({ kind: 'divider', id: item })
      }
      continue
    }
    if (item === 'templates' && !templates) continue
    if (scope === 'drawing' && isInsertTool(item)) continue
    if (scope === 'insert' && !isInsertTool(item)) continue
    if (collapseSelect && isSelectTool(item)) {
      if (!selectEmitted && visibleSelectModes.length > 0) {
        out.push({ kind: 'selectGroup', modes: visibleSelectModes })
        selectEmitted = true
      }
      continue
    }
    out.push({ kind: 'tool', id: item })
  }

  while (out.length > 0 && out[out.length - 1].kind === 'divider') out.pop()
  return out
}
