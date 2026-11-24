import { ArrowPathIcon, Bars2Icon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Select } from '@penrill/ui/select'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useT, type MessageKey } from '../i18n'
import { shortcutKey } from '../shortcuts'
import { prefsStore, usePrefs } from '../store'
import { isToolbarDivider, type ConcreteToolId, type ToolbarItemId } from '../toolbarLayout'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  DOCK_EDGES,
  edgeDocksEqual,
  hiddenToolsInDocks,
  placeToolInDock,
  removeItemFromDocks,
  type DockEdge
} from '../workspaceLayout'
import { Segmented } from './chrome'
import { ToolbarSettingsIcon } from './icons'
import { TOOL_LABELS, TOOL_SHORTCUTS, ToolMiniIcon } from './toolMeta'

const EDGE_LABELS: Record<DockEdge, MessageKey> = {
  top: 'layout.edge.top',
  left: 'layout.edge.left',
  right: 'layout.edge.right',
  bottom: 'layout.edge.bottom'
}

/**
 * Settings -> Tools: inspect and edit the tools and dividers docked to any of the four screen edges
 * (reorder by dragging or arrows, move a button to another edge, add/remove dividers, show/hide tools),
 * or launch live on-board drag-and-drop customization.
 */
export function ToolbarOrderSettings({
  templates,
  onCustomizeBoard
}: {
  templates: boolean
  onCustomizeBoard?: () => void
}) {
  const t = useT()
  const docks = usePrefs((s) => s.workspaceLayout.docks)
  const [selectedEdge, setSelectedEdge] = useState<DockEdge>(() => {
    for (const edge of ['top', 'left', 'bottom', 'right'] as const) {
      if (docks[edge].length > 0) return edge
    }
    return 'top'
  })

  const edgeItems = docks[selectedEdge]
  const rows = edgeItems
    .map((id, index) => ({ id, index }))
    .filter((row) => row.id !== 'templates' || templates)

  const hiddenTools = hiddenToolsInDocks(docks, templates)
  const isDefaultDocks = edgeDocksEqual(docks, DEFAULT_WORKSPACE_LAYOUT.docks)

  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragState = useRef<{ pointerId: number; fromRowPos: number } | null>(null)
  const [draggingRowPos, setDraggingRowPos] = useState<number | null>(null)
  const [dropRowPos, setDropRowPos] = useState<number | null>(null)

  const setDocks = (nextDocks: typeof docks): void => {
    prefsStore.getState().setWorkspaceLayout({ docks: nextDocks })
  }

  const computeDropPos = (clientY: number): number => {
    for (let i = 0; i < rows.length; i++) {
      const el = rowRefs.current.get(i)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.bottom) return i
    }
    return rows.length - 1
  }

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, rowPos: number): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { pointerId: e.pointerId, fromRowPos: rowPos }
    setDraggingRowPos(rowPos)
    setDropRowPos(rowPos)
  }

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!dragState.current || dragState.current.pointerId !== e.pointerId) return
    setDropRowPos(computeDropPos(e.clientY))
  }

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, commit: boolean): void => {
    const cur = dragState.current
    if (!cur || cur.pointerId !== e.pointerId) return
    const targetRowPos = dropRowPos
    dragState.current = null
    setDraggingRowPos(null)
    setDropRowPos(null)
    if (commit && targetRowPos !== null && targetRowPos !== cur.fromRowPos) {
      const id = rows[cur.fromRowPos]?.id
      const toIndex = rows[targetRowPos]?.index
      if (id !== undefined && toIndex !== undefined) {
        const targetSlot = cur.fromRowPos < targetRowPos ? toIndex + 1 : toIndex
        setDocks(placeToolInDock(docks, id, selectedEdge, targetSlot))
      }
    }
  }

  const moveBy = (rowPos: number, delta: -1 | 1): void => {
    const nextRowPos = rowPos + delta
    if (nextRowPos < 0 || nextRowPos >= rows.length) return
    const id = rows[rowPos].id
    const targetIndex = rows[nextRowPos].index
    const slot = delta > 0 ? targetIndex + 1 : targetIndex
    setDocks(placeToolInDock(docks, id, selectedEdge, slot))
  }

  const moveToEdge = (id: ToolbarItemId, nextEdge: DockEdge): void => {
    if (nextEdge === selectedEdge) return
    setDocks(placeToolInDock(docks, id, nextEdge))
  }

  const remove = (id: ToolbarItemId): void => {
    setDocks(removeItemFromDocks(docks, id))
  }

  const addDivider = (): void => {
    setDocks(placeToolInDock(docks, 'divider', selectedEdge, 0))
  }

  const showTool = (id: ConcreteToolId): void => {
    setDocks(placeToolInDock(docks, id, selectedEdge))
  }

  const iconBtn =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors enabled:hover:bg-zinc-950/5 enabled:hover:text-zinc-950 disabled:opacity-30 dark:text-zinc-400 dark:enabled:hover:bg-white/10 dark:enabled:hover:text-white'

  const countEdgeTools = (edge: DockEdge): number =>
    docks[edge].filter((id) => !isToolbarDivider(id) && (id !== 'templates' || templates)).length

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="min-w-0 flex-1">{t('toolbar.orderHintEdges')}</Text>
        {onCustomizeBoard && (
          <Button color="blue" onClick={onCustomizeBoard}>
            <ToolbarSettingsIcon width={16} height={16} />
            {t('customize.openOnBoard')}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented<DockEdge>
          label={t('toolbar.edge')}
          value={selectedEdge}
          onChange={setSelectedEdge}
          options={(['left', 'top', 'bottom', 'right'] as const).map((edge) => ({
            value: edge,
            label: `${t(EDGE_LABELS[edge])} (${countEdgeTools(edge)})`
          }))}
        />
        <div className="flex items-center gap-2">
          <Button outline onClick={addDivider}>
            <PlusIcon data-slot="icon" />
            {t('toolbar.addDivider')}
          </Button>
          <Button plain disabled={isDefaultDocks} onClick={() => setDocks(DEFAULT_WORKSPACE_LAYOUT.docks)}>
            <ArrowPathIcon data-slot="icon" />
            {t('toolbar.reset')}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-950/15 px-4 py-6 text-center text-sm/5 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          {t('toolbar.edgeEmpty')}
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-zinc-950/10 dark:ring-white/10">
          <div className="divide-y divide-zinc-950/5 dark:divide-white/5">
            {rows.map(({ id }, rowPos) => {
              const divider = isToolbarDivider(id)
              const isDragging = draggingRowPos === rowPos
              const dropBefore = draggingRowPos !== null && dropRowPos === rowPos && rowPos < draggingRowPos
              const dropAfter = draggingRowPos !== null && dropRowPos === rowPos && rowPos > draggingRowPos
              const sc = !divider && TOOL_SHORTCUTS[id] ? shortcutKey(TOOL_SHORTCUTS[id]!) : undefined

              return (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(rowPos, el)
                    else rowRefs.current.delete(rowPos)
                  }}
                  className={clsx(
                    'relative flex items-center gap-2 px-2.5 py-2 transition-colors',
                    divider ? 'bg-zinc-950/2 dark:bg-white/2' : 'bg-white dark:bg-zinc-800/40',
                    isDragging && 'opacity-50'
                  )}
                >
                  {dropBefore && <span className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-blue-500" />}
                  {dropAfter && <span className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-500" />}

                  <button
                    type="button"
                    aria-label={t('toolbar.dragToReorder')}
                    title={t('toolbar.dragToReorder')}
                    onPointerDown={(e) => startDrag(e, rowPos)}
                    onPointerMove={moveDrag}
                    onPointerUp={(e) => endDrag(e, true)}
                    onPointerCancel={(e) => endDrag(e, false)}
                    className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 active:cursor-grabbing dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  >
                    <Bars2Icon className="size-4" />
                  </button>

                  {divider ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="h-px flex-1 bg-zinc-950/15 dark:bg-white/15" />
                      <span className="text-xs/4 font-medium text-zinc-400 dark:text-zinc-500">{t('toolbar.divider')}</span>
                      <span className="h-px flex-1 bg-zinc-950/15 dark:bg-white/15" />
                    </div>
                  ) : (
                    <>
                      <ToolMiniIcon id={id} />
                      <span className="min-w-0 flex-1 truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        {t(TOOL_LABELS[id])}
                      </span>
                      {sc && (
                        <kbd className="hidden rounded-md border border-zinc-950/10 bg-zinc-50 px-1.5 py-0.5 text-[11px]/4 font-medium text-zinc-500 sm:inline-block dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                          {sc}
                        </kbd>
                      )}
                      <div className="w-24 shrink-0">
                        <Select
                          aria-label={t('toolbar.edge')}
                          value={selectedEdge}
                          onChange={(e) => moveToEdge(id, e.target.value as DockEdge)}
                        >
                          {DOCK_EDGES.map((edge) => (
                            <option key={edge} value={edge}>
                              {t(EDGE_LABELS[edge])}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </>
                  )}

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={t('toolbar.moveUp')}
                      title={t('toolbar.moveUp')}
                      disabled={rowPos === 0}
                      onClick={() => moveBy(rowPos, -1)}
                      className={iconBtn}
                    >
                      <ChevronUpIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('toolbar.moveDown')}
                      title={t('toolbar.moveDown')}
                      disabled={rowPos === rows.length - 1}
                      onClick={() => moveBy(rowPos, 1)}
                      className={iconBtn}
                    >
                      <ChevronDownIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('toolbar.hide')}
                      title={t('toolbar.hide')}
                      onClick={() => remove(id)}
                      className={iconBtn}
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hiddenTools.length > 0 && (
        <section className="mt-8">
          <Subheading level={3}>{t('toolbar.hidden')}</Subheading>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {hiddenTools.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => showTool(id)}
                className="flex items-center gap-2.5 rounded-xl bg-zinc-950/2.5 px-3 py-2 text-left ring-1 ring-zinc-950/10 transition-colors hover:bg-zinc-950/5 dark:bg-white/2.5 dark:ring-white/10 dark:hover:bg-white/5"
              >
                <ToolMiniIcon id={id} />
                <span className="min-w-0 flex-1 truncate text-sm/5 font-medium text-zinc-700 dark:text-zinc-200">
                  {t(TOOL_LABELS[id])}
                </span>
                <span className="flex items-center gap-1 text-xs/4 font-semibold text-blue-600 dark:text-blue-400">
                  <PlusIcon className="size-3.5" />
                  {t('toolbar.show')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
