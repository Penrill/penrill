import { ArrowPathIcon, Bars2Icon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useT, type MessageKey } from '../i18n'
import { shortcutKey, type ShortcutId } from '../shortcuts'
import { prefsStore, usePrefs } from '../store'
import {
  addToolbarDivider,
  DEFAULT_TOOLBAR,
  isInsertTool,
  isToolbarDivider,
  moveToolbarItem,
  removeToolbarItem,
  resolveToolbarItems,
  withToolShown,
  type ConcreteToolId,
  type ToolbarItemId
} from '../toolbarLayout'
import {
  AxesIcon,
  BrushSelectIcon,
  EraserIcon,
  FormulaIcon,
  HandIcon,
  ImageIcon,
  LaserIcon,
  LassoIcon,
  MoveIcon,
  PenIcon,
  RedoIcon,
  RulerIcon,
  ShapesIcon,
  StampIcon,
  TextIcon,
  UndoIcon
} from './icons'

const TOOL_LABELS: Record<ConcreteToolId, MessageKey> = {
  select: 'select.lasso',
  brushSelect: 'select.brush',
  move: 'select.move',
  pan: 'toolbar.pan',
  pen1: 'toolbar.pen1',
  pen2: 'toolbar.pen2',
  pen3: 'toolbar.pen3',
  highlighter: 'toolbar.highlighter',
  eraser: 'toolbar.eraser',
  laser: 'toolbar.laser',
  undo: 'toolbar.undo',
  redo: 'toolbar.redo',
  text: 'insert.text',
  formula: 'insert.formula',
  shapes: 'insert.shapes',
  graph: 'insert.graph',
  templates: 'tpl.title',
  image: 'insert.image',
  instruments: 'toolbar.instruments'
}

const TOOL_SHORTCUTS: Partial<Record<ConcreteToolId, ShortcutId>> = {
  select: 'lasso',
  brushSelect: 'brushSelect',
  move: 'move',
  pen1: 'pen1',
  pen2: 'pen2',
  pen3: 'pen3',
  highlighter: 'highlighter',
  eraser: 'eraser',
  laser: 'laser',
  undo: 'undo',
  redo: 'redo'
}

function ToolMiniIcon({ id }: { id: ConcreteToolId }) {
  const { pens, highlighter } = usePrefs(useShallow((s) => ({ pens: s.pens, highlighter: s.highlighter })))
  const icon = ((): ReactNode => {
    switch (id) {
      case 'select': return <LassoIcon />
      case 'brushSelect': return <BrushSelectIcon />
      case 'move': return <MoveIcon />
      case 'pan': return <HandIcon />
      case 'pen1': return <PenIcon color={pens[0].color} direction="down" />
      case 'pen2': return <PenIcon color={pens[1].color} direction="down" />
      case 'pen3': return <PenIcon color={pens[2].color} direction="down" />
      case 'highlighter': return <PenIcon color={highlighter.color} highlighter direction="down" />
      case 'eraser': return <EraserIcon direction="down" />
      case 'laser': return <LaserIcon />
      case 'undo': return <UndoIcon />
      case 'redo': return <RedoIcon />
      case 'text': return <TextIcon />
      case 'formula': return <FormulaIcon />
      case 'shapes': return <ShapesIcon />
      case 'graph': return <AxesIcon />
      case 'instruments': return <RulerIcon />
      case 'image': return <ImageIcon />
      case 'templates': return <StampIcon />
    }
  })()
  return (
    <span className="flex size-6 shrink-0 items-center justify-center text-zinc-700 dark:text-zinc-200 [&>svg]:max-h-5 [&>svg]:max-w-5">
      {icon}
    </span>
  )
}

/**
 * Settings -> Tools: reorder toolbar buttons by dragging or arrow buttons, add/remove dividers,
 * and show or hide individual tools. Works identically across merged and split workspace layouts.
 */
export function ToolbarOrderSettings({ templates }: { templates: boolean }) {
  const t = useT()
  const layout = usePrefs((s) => s.toolbarLayout)
  const merged = usePrefs((s) => s.workspaceLayout.insertDock === 'merged')
  const items = resolveToolbarItems(layout)

  // Keep each visible row's true index inside `items` so edits preserve hidden `templates` cleanly.
  const rows = items
    .map((id, index) => ({ id, index }))
    .filter((row) => row.id !== 'templates' || templates)

  const hiddenTools = DEFAULT_TOOLBAR.filter((id) => (id !== 'templates' || templates) && !items.includes(id))

  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragState = useRef<{ pointerId: number; fromRowPos: number } | null>(null)
  const [draggingRowPos, setDraggingRowPos] = useState<number | null>(null)
  const [dropRowPos, setDropRowPos] = useState<number | null>(null)

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
      const fromIndex = rows[cur.fromRowPos]?.index
      const toIndex = rows[targetRowPos]?.index
      if (fromIndex !== undefined && toIndex !== undefined) {
        prefsStore.setState({ toolbarLayout: moveToolbarItem(layout, fromIndex, toIndex) })
      }
    }
  }

  const moveBy = (rowPos: number, delta: -1 | 1): void => {
    const nextRowPos = rowPos + delta
    if (nextRowPos < 0 || nextRowPos >= rows.length) return
    prefsStore.setState({
      toolbarLayout: moveToolbarItem(layout, rows[rowPos].index, rows[nextRowPos].index)
    })
  }

  const remove = (id: ToolbarItemId): void => {
    prefsStore.setState({ toolbarLayout: removeToolbarItem(layout, id) })
  }

  const addDivider = (): void => {
    prefsStore.setState({ toolbarLayout: addToolbarDivider(layout, 0) })
  }

  const showTool = (id: ConcreteToolId): void => {
    prefsStore.setState({ toolbarLayout: withToolShown(layout, id, true) })
  }

  const iconBtn =
    'flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors enabled:hover:bg-zinc-950/5 enabled:hover:text-zinc-950 disabled:opacity-30 dark:text-zinc-400 dark:enabled:hover:bg-white/10 dark:enabled:hover:text-white'

  return (
    <>
      <Text>{t(merged ? 'toolbar.orderHintMerged' : 'toolbar.orderHintSplit')}</Text>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Subheading level={3}>{t('toolbar.shown')}</Subheading>
        <div className="flex items-center gap-2">
          <Button outline onClick={addDivider}>
            <PlusIcon data-slot="icon" />
            {t('toolbar.addDivider')}
          </Button>
          <Button plain disabled={layout === null} onClick={() => prefsStore.setState({ toolbarLayout: null })}>
            <ArrowPathIcon data-slot="icon" />
            {t('toolbar.reset')}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-950/15 px-4 py-6 text-center text-sm/5 text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          {t('toolbar.empty')}
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
                    'relative flex items-center gap-2.5 px-2.5 py-2 transition-colors',
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
                      {!merged && (
                        <Badge color="zinc" className="hidden text-[11px]! sm:inline-flex">
                          {t(isInsertTool(id) ? 'insert.label' : 'rail.label')}
                        </Badge>
                      )}
                      {sc && (
                        <kbd className="rounded-md border border-zinc-950/10 bg-zinc-50 px-1.5 py-0.5 text-[11px]/4 font-medium text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                          {sc}
                        </kbd>
                      )}
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
