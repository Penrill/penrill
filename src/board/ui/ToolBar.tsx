import * as Headless from '@headlessui/react'
import { Bars2Icon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import { IMAGE_ACCEPT } from '../engine/images'
import { useEditor, useSession } from '../editorContext'
import { useT, type MessageKey } from '../i18n'
import { shortcutKey, type ShortcutId } from '../shortcuts'
import { HIGHLIGHTER_COLORS, HIGHLIGHTER_SIZES, PEN_COLORS, PEN_SIZES, prefsStore, type Tool, usePrefs } from '../store'
import {
  isInsertOnlyBar,
  projectEdgeBarItems,
  type ConcreteToolId,
  type SelectToolId,
  type ToolbarItemId
} from '../toolbarLayout'
import {
  flyoutAnchor,
  isVerticalDock,
  penDirection,
  placeToolInDock,
  removeItemFromDocks,
  type DockEdge
} from '../workspaceLayout'
import {
  AnchoredPopover,
  BarDivider,
  ChromeBarProvider,
  FlyoutPanel,
  InsertButton,
  ScrollableBar,
  ToolButton,
  useChromeBar
} from './chrome'
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
  TextIcon,
  UndoIcon
} from './icons'
import { GraphPanel, InstrumentsPanel, ShapesPanel, useInstrumentRows } from './InsertMenus'
import { EraserOptionsCard, InkOptionsCard, SelectOptionsCard, TextOptionsCard } from './ToolOptions'
import { TOOL_LABELS, TOOL_SHORTCUTS, ToolMiniIcon } from './toolMeta'
import { useWorkspaceCustomize } from './WorkspaceCustomizer'

/** The three ways to select; may collapse into one button or show individually. */
export const SELECT_MODES: { tool: Tool & SelectToolId; shortcut: ShortcutId; label: MessageKey; icon: ReactNode }[] = [
  { tool: 'select', shortcut: 'lasso', label: 'select.lasso', icon: <LassoIcon /> },
  { tool: 'brushSelect', shortcut: 'brushSelect', label: 'select.brush', icon: <BrushSelectIcon /> },
  { tool: 'move', shortcut: 'move', label: 'select.move', icon: <MoveIcon /> }
]

export const isSelectMode = (tool: Tool): boolean => SELECT_MODES.some((m) => m.tool === tool)

/** Select directly on pen release. Some iPad taps deliver pointerup without a click.
 * Keep native click activation for the keyboard, mouse and touch. */
function useToolActivation(select: () => void) {
  const penDown = useRef<number | null>(null)
  const handled = useRef(false)
  return {
    onPointerDown(e: PointerEvent<HTMLButtonElement>) {
      handled.current = false
      penDown.current = e.pointerType === 'pen' && e.button === 0 ? e.pointerId : null
    },
    onPointerCancel() {
      penDown.current = null
    },
    onPointerUp(e: PointerEvent<HTMLButtonElement>) {
      if (penDown.current !== e.pointerId) return
      penDown.current = null
      const button = e.currentTarget
      if (!button.contains(button.ownerDocument.elementFromPoint(e.clientX, e.clientY))) return
      handled.current = true
      select()
    },
    onClick(e: MouseEvent<HTMLButtonElement>) {
      if (!handled.current || e.detail === 0) select()
      handled.current = false
    }
  }
}

const RailTool = forwardRef<
  HTMLButtonElement,
  Omit<ComponentProps<typeof ToolButton>, 'onSelect'> & { onSelect: () => void }
>(function RailTool({ onSelect, ...props }, ref) {
  const activation = useToolActivation(onSelect)
  return <ToolButton ref={ref} {...props} {...activation} />
})

/** A pen, highlighter or eraser oriented toward the canvas; the active one slides out cleanly. */
const TrayItem = forwardRef<
  HTMLButtonElement,
  {
    edge: DockEdge
    label: string
    shortcut?: string
    active: boolean
    popoverOpen?: boolean
    hasPopover?: boolean
    onClick: () => void
    onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void
    children: ReactNode
  }
>(function TrayItem(
  { edge, label, shortcut, active, popoverOpen, hasPopover, onClick, onContextMenu, children },
  ref
) {
  const activation = useToolActivation(onClick)
  const { showShortcuts } = useChromeBar()
  const vertical = isVerticalDock(edge)
  const showKey = showShortcuts && !!shortcut && shortcut.length <= 2
  const motionClass =
    edge === 'left'
      ? active
        ? 'translate-x-2.5'
        : '-translate-x-1.5 group-hover:translate-x-0'
      : edge === 'right'
        ? active
          ? '-translate-x-2.5'
          : 'translate-x-1.5 group-hover:translate-x-0'
        : edge === 'top'
          ? active
            ? 'translate-y-1'
            : '-translate-y-1.5 group-hover:translate-y-0'
          : active
            ? '-translate-y-1'
            : 'translate-y-1.5 group-hover:translate-y-0'

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      aria-haspopup={hasPopover ? 'dialog' : undefined}
      aria-expanded={hasPopover ? popoverOpen : undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      onContextMenu={onContextMenu}
      {...activation}
      className={clsx(
        'group relative flex shrink-0 rounded-xl transition-colors',
        vertical ? 'h-9 w-12 items-center overflow-visible' : 'h-10 w-9 justify-center overflow-hidden',
        edge === 'right' && 'justify-end',
        edge === 'top' && 'items-start',
        edge === 'bottom' && 'items-end',
        active ? 'bg-blue-500/12 dark:bg-blue-500/25' : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
      )}
    >
      <span className={clsx('block transition-transform duration-200 ease-out motion-reduce:transition-none', motionClass)}>
        {children}
      </span>
      {showKey && (
        <kbd
          aria-hidden
          className={clsx(
            'pointer-events-none absolute rounded px-0.5 text-[9px]/3 font-semibold text-zinc-400 dark:text-zinc-500',
            edge === 'right' ? 'bottom-0.5 left-0.5' : 'right-0.5 bottom-0.5'
          )}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  )
})

function InsertFlyout({
  edge,
  icon,
  label,
  active,
  className,
  children
}: {
  edge: DockEdge
  icon: ReactNode
  label: string
  active?: boolean
  className?: string
  children: (close: () => void) => ReactNode
}) {
  return (
    <Headless.Popover className="flex">
      <Headless.PopoverButton as={InsertButton} icon={icon} label={label} active={active} />
      <FlyoutPanel anchor={flyoutAnchor(edge)} className={className}>
        {({ close }) => <>{children(close)}</>}
      </FlyoutPanel>
    </Headless.Popover>
  )
}

type PopoverKind = 'pen0' | 'pen1' | 'pen2' | 'highlighter' | 'eraser' | 'text' | 'selectGroup' | 'shapeStyle'

export interface ToolBarProps {
  edge: DockEdge
  items: readonly ToolbarItemId[]
  templates?: ReactNode
  /** Show text labels under icons on horizontal bars that contain only insert tools. */
  insertLabels?: boolean
  /** Open tool options in a popover when clicking an already-active tool (or right-clicking). */
  popoverOptions?: boolean
  /** Collapse lasso, brush select and move into a single button when multiple sit on this bar. */
  collapseSelectTools?: boolean
  /** Show short single-key shortcut badges on toolbar buttons. */
  showShortcutBadges?: boolean
}

/**
 * Adaptive board toolbar: renders any ordered list of tools and dividers docked to any of the
 * four screen edges. Supports normal interaction and live drag-and-drop editing in Customize Mode.
 */
export function ToolBar({
  edge,
  items: rawItems,
  templates,
  insertLabels = false,
  popoverOptions = false,
  collapseSelectTools = true,
  showShortcutBadges = false
}: ToolBarProps) {
  const editor = useEditor()
  const t = useT()
  const customize = useWorkspaceCustomize()
  const customizing = customize.active

  const { tool, activePen, canUndo, canRedo, formulaEdit } = useSession(
    useShallow((s) => ({
      tool: s.tool,
      activePen: s.activePen,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      formulaEdit: s.formulaEdit
    }))
  )
  const { pens, highlighter } = usePrefs(useShallow((s) => ({ pens: s.pens, highlighter: s.highlighter })))
  const { setTool, selectPen } = editor.session.getState()
  const { updatePen, updateHighlighter } = prefsStore.getState()
  const instrumentsOn = useInstrumentRows().some((r) => r.on)
  const fileRef = useRef<HTMLInputElement>(null)

  const vertical = isVerticalDock(edge)
  const insertOnly = isInsertOnlyBar(rawItems)
  const compact = customizing || vertical || !insertLabels || !insertOnly
  const dir = penDirection(edge)

  // Remember the last-used selection mode for the collapsed Select button.
  const lastSelect = useRef<SelectToolId>('select')
  useEffect(() => {
    if (isSelectMode(tool)) lastSelect.current = tool as SelectToolId
  }, [tool])

  // Controlled popover for tool options in popover mode.
  const [openPopover, setOpenPopover] = useState<PopoverKind | null>(null)
  const buttonRefs = useRef<Partial<Record<PopoverKind, HTMLButtonElement | null>>>({})
  const anchorRef = useRef<HTMLElement | null>(null)
  const prevState = useRef({ tool, activePen })

  useEffect(() => {
    if (prevState.current.tool !== tool || prevState.current.activePen !== activePen) {
      prevState.current = { tool, activePen }
      setOpenPopover(null)
    }
  }, [tool, activePen])

  useEffect(() => {
    if (!popoverOptions || formulaEdit || customizing) setOpenPopover(null)
  }, [popoverOptions, formulaEdit, edge, customizing])

  const bindRef = (kind: PopoverKind) => (el: HTMLButtonElement | null) => {
    buttonRefs.current[kind] = el
  }

  const togglePopover = (kind: PopoverKind): void => {
    setOpenPopover((cur) => (cur === kind ? null : kind))
  }

  const onContextOpen = (kind: PopoverKind) => (e: MouseEvent<HTMLButtonElement>): void => {
    if (!popoverOptions || customizing) return
    e.preventDefault()
    togglePopover(kind)
  }

  const projected = projectEdgeBarItems(rawItems, {
    templates: !!templates,
    collapseSelect: collapseSelectTools,
    customizing
  })

  const canInsertImages = rawItems.includes('image')
  const barLabel = t(insertOnly ? 'insert.label' : 'rail.label')

  // Highlight bar when a whole bar is being dragged over this edge.
  const mergeHighlight = customize.dropTarget?.kind === 'edge-bar' && customize.dropTarget.edge === edge
  const barDragging = customize.dragging?.kind === 'bar' && customize.dragging.fromEdge === edge

  if (customizing) {
    const slotDropIndex =
      customize.dropTarget?.kind === 'edge-slot' && customize.dropTarget.edge === edge
        ? customize.dropTarget.index
        : null

    const handleKey = (e: KeyboardEvent<HTMLButtonElement>, id: ToolbarItemId, slotIndex: number): void => {
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault()
        customize.updateDraft((prev) => ({ ...prev, docks: removeItemFromDocks(prev.docks, id) }))
        return
      }
      const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft'
      const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
      if (e.code === prevKey && slotIndex > 0) {
        e.preventDefault()
        customize.updateDraft((prev) => ({ ...prev, docks: placeToolInDock(prev.docks, id, edge, slotIndex - 1) }))
      } else if (e.code === nextKey && slotIndex < projected.length - 1) {
        e.preventDefault()
        customize.updateDraft((prev) => ({ ...prev, docks: placeToolInDock(prev.docks, id, edge, slotIndex + 2) }))
      }
    }

    return (
      <ChromeBarProvider edge={edge} compact showShortcuts={showShortcutBadges}>
        <div className="relative flex items-center justify-center">
          <ScrollableBar
            vertical={vertical}
            label={barLabel}
            onBarEl={(el) => customize.registerEdgeEl(edge, el)}
            onViewportEl={(el) => customize.registerEdgeViewport(edge, el)}
            className={clsx(
              'transition-all',
              barDragging && 'opacity-45',
              mergeHighlight && 'ring-2! ring-blue-500! dark:ring-blue-400!'
            )}
          >
            {/* Whole-bar drag handle */}
            <button
              type="button"
              draggable={false}
              aria-label={t('customize.dragBar')}
              title={t('customize.dragBar')}
              onPointerDown={(e) => customize.startDrag(e, { kind: 'bar', fromEdge: edge })}
              className={clsx(
                'flex shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700 active:cursor-grabbing dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200',
                vertical ? 'h-7 w-10' : 'h-10 w-7'
              )}
            >
              <Bars2Icon className={clsx('size-4', !vertical && 'rotate-90')} />
            </button>

            {projected.map((entry, idx) => {
              const itemId: ToolbarItemId = entry.kind === 'divider' ? (entry.id as ToolbarItemId) : entry.kind === 'tool' ? entry.id : 'select'
              const isItemDragged = customize.dragging?.kind === 'item' && customize.dragging.id === itemId
              const showBefore = slotDropIndex === idx
              const showAfter = idx === projected.length - 1 && slotDropIndex !== null && slotDropIndex >= projected.length
              const isDivider = entry.kind === 'divider'
              const sc = !isDivider && entry.kind === 'tool' && TOOL_SHORTCUTS[entry.id] ? shortcutKey(TOOL_SHORTCUTS[entry.id]!) : undefined
              const showKey = showShortcutBadges && !!sc && sc.length <= 2

              return (
                <div
                  key={itemId}
                  data-customize-slot={idx}
                  className={clsx('relative flex shrink-0 items-center justify-center', isItemDragged && 'opacity-30')}
                >
                  {showBefore && (
                    <span
                      aria-hidden
                      className={clsx(
                        'pointer-events-none absolute z-10 rounded-full bg-blue-500',
                        vertical ? 'inset-x-1 -top-0.5 h-0.5' : 'inset-y-1 -left-0.5 w-0.5'
                      )}
                    />
                  )}
                  {showAfter && (
                    <span
                      aria-hidden
                      className={clsx(
                        'pointer-events-none absolute z-10 rounded-full bg-blue-500',
                        vertical ? 'inset-x-1 -bottom-0.5 h-0.5' : 'inset-y-1 -right-0.5 w-0.5'
                      )}
                    />
                  )}
                  <button
                    type="button"
                    draggable={false}
                    aria-label={isDivider ? t('toolbar.divider') : entry.kind === 'tool' ? t(TOOL_LABELS[entry.id]) : ''}
                    title={isDivider ? t('toolbar.divider') : entry.kind === 'tool' ? t(TOOL_LABELS[entry.id]) : ''}
                    onPointerDown={(e) => customize.startDrag(e, { kind: 'item', id: itemId, fromEdge: edge })}
                    onKeyDown={(e) => handleKey(e, itemId, idx)}
                    className={clsx(
                      'relative flex shrink-0 cursor-grab touch-none items-center justify-center rounded-xl transition-colors hover:bg-zinc-950/5 active:cursor-grabbing dark:hover:bg-white/10',
                      isDivider
                        ? vertical
                          ? 'h-5 w-10'
                          : 'h-10 w-5'
                        : 'size-10'
                    )}
                  >
                    {isDivider ? (
                      <span
                        className={clsx(
                          'rounded-full bg-zinc-400/70 dark:bg-zinc-500/70',
                          vertical ? 'h-0.5 w-6' : 'h-6 w-0.5'
                        )}
                      />
                    ) : entry.kind === 'tool' ? (
                      <>
                        <ToolMiniIcon id={entry.id} />
                        {showKey && (
                          <kbd
                            aria-hidden
                            className="pointer-events-none absolute right-0.5 bottom-0.5 rounded px-0.5 text-[9px]/3 font-semibold text-zinc-400 dark:text-zinc-500"
                          >
                            {sc}
                          </kbd>
                        )}
                      </>
                    ) : null}
                  </button>
                </div>
              )
            })}
          </ScrollableBar>

          {mergeHighlight && (
            <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-md bg-blue-600 px-2 py-0.5 text-[11px]/4 font-semibold whitespace-nowrap text-white shadow">
              {t('customize.mergeBarHere')}
            </span>
          )}
        </div>
      </ChromeBarProvider>
    )
  }

  const renderSelectButton = (id: SelectToolId): ReactNode => {
    const mode = SELECT_MODES.find((m) => m.tool === id)
    if (!mode) return null
    return (
      <RailTool
        key={id}
        label={t(mode.label)}
        shortcut={shortcutKey(mode.shortcut)}
        active={tool === id}
        onSelect={() => {
          setTool(id)
          setOpenPopover(null)
        }}
      >
        {mode.icon}
      </RailTool>
    )
  }

  const renderTool = (id: ConcreteToolId): ReactNode => {
    if (id === 'select' || id === 'brushSelect' || id === 'move') return renderSelectButton(id)

    if (id === 'pan') {
      return (
        <RailTool
          key="pan"
          label={t('tool.pan')}
          active={tool === 'pan'}
          onSelect={() => {
            setTool('pan')
            setOpenPopover(null)
          }}
        >
          <HandIcon />
        </RailTool>
      )
    }

    if (id === 'pen1' || id === 'pen2' || id === 'pen3') {
      const index = id === 'pen1' ? 0 : id === 'pen2' ? 1 : 2
      const kind: PopoverKind = index === 0 ? 'pen0' : index === 1 ? 'pen1' : 'pen2'
      const active = tool === 'pen' && activePen === index
      return (
        <TrayItem
          key={id}
          ref={bindRef(kind)}
          edge={edge}
          label={t(`toolbar.pen${index + 1}` as MessageKey)}
          shortcut={shortcutKey(id)}
          active={active}
          hasPopover={popoverOptions}
          popoverOpen={openPopover === kind}
          onContextMenu={onContextOpen(kind)}
          onClick={() => {
            if (active && popoverOptions) togglePopover(kind)
            else {
              selectPen(index)
              setOpenPopover(null)
            }
          }}
        >
          <PenIcon color={pens[index].color} direction={dir} />
        </TrayItem>
      )
    }

    if (id === 'highlighter') {
      const active = tool === 'highlighter'
      return (
        <TrayItem
          key="highlighter"
          ref={bindRef('highlighter')}
          edge={edge}
          label={t('toolbar.highlighter')}
          shortcut={shortcutKey('highlighter')}
          active={active}
          hasPopover={popoverOptions}
          popoverOpen={openPopover === 'highlighter'}
          onContextMenu={onContextOpen('highlighter')}
          onClick={() => {
            if (active && popoverOptions) togglePopover('highlighter')
            else {
              setTool('highlighter')
              setOpenPopover(null)
            }
          }}
        >
          <PenIcon color={highlighter.color} highlighter direction={dir} />
        </TrayItem>
      )
    }

    if (id === 'eraser') {
      const active = tool === 'eraser'
      return (
        <TrayItem
          key="eraser"
          ref={bindRef('eraser')}
          edge={edge}
          label={t('toolbar.eraser')}
          shortcut={shortcutKey('eraser')}
          active={active}
          hasPopover={popoverOptions}
          popoverOpen={openPopover === 'eraser'}
          onContextMenu={onContextOpen('eraser')}
          onClick={() => {
            if (active && popoverOptions) togglePopover('eraser')
            else {
              setTool('eraser')
              setOpenPopover(null)
            }
          }}
        >
          <EraserIcon direction={dir} />
        </TrayItem>
      )
    }

    if (id === 'laser') {
      return (
        <RailTool
          key="laser"
          label={t('toolbar.laser')}
          shortcut={shortcutKey('laser')}
          active={tool === 'laser'}
          onSelect={() => {
            setTool('laser')
            setOpenPopover(null)
          }}
        >
          <LaserIcon />
        </RailTool>
      )
    }

    if (id === 'undo') {
      return (
        <ToolButton key="undo" label={t('toolbar.undo')} shortcut={shortcutKey('undo')} disabled={!canUndo} onClick={() => editor.undo()}>
          <UndoIcon />
        </ToolButton>
      )
    }

    if (id === 'redo') {
      return (
        <ToolButton key="redo" label={t('toolbar.redo')} shortcut={shortcutKey('redo')} disabled={!canRedo} onClick={() => editor.redo()}>
          <RedoIcon />
        </ToolButton>
      )
    }

    if (id === 'text') {
      const active = tool === 'text'
      return (
        <InsertButton
          key="text"
          ref={bindRef('text')}
          icon={<TextIcon />}
          label={t('insert.text')}
          active={active}
          aria-haspopup={popoverOptions ? 'dialog' : undefined}
          aria-expanded={popoverOptions ? openPopover === 'text' : undefined}
          onContextMenu={onContextOpen('text')}
          onClick={() => {
            if (active && popoverOptions) togglePopover('text')
            else {
              setTool('text')
              setOpenPopover(null)
            }
          }}
        />
      )
    }

    if (id === 'formula') {
      return (
        <InsertButton
          key="formula"
          icon={<FormulaIcon />}
          label={t('insert.formula')}
          onClick={() => {
            setOpenPopover(null)
            editor.startFormula()
          }}
        />
      )
    }

    if (id === 'shapes') {
      return (
        <div key="shapes" className="contents">
          <InsertFlyout edge={edge} icon={<ShapesIcon />} label={t('insert.shapes')} active={tool === 'shape'} className="insert-flyout">
            {(close) => <ShapesPanel close={close} />}
          </InsertFlyout>
          {popoverOptions && tool === 'shape' && (
            <ToolButton
              ref={bindRef('shapeStyle')}
              label={t('toolbar.shapeStyle')}
              active={openPopover === 'shapeStyle'}
              aria-haspopup="dialog"
              aria-expanded={openPopover === 'shapeStyle'}
              onClick={() => togglePopover('shapeStyle')}
            >
              <span
                style={{ background: pens[activePen].color }}
                className="size-5 rounded-full ring-2 ring-zinc-950/15 ring-inset dark:ring-white/25"
              />
            </ToolButton>
          )}
        </div>
      )
    }

    if (id === 'graph') {
      return (
        <InsertFlyout key="graph" edge={edge} icon={<AxesIcon />} label={t('insert.graph')} className="insert-flyout">
          {(close) => <GraphPanel close={close} />}
        </InsertFlyout>
      )
    }

    if (id === 'instruments') {
      return (
        <InsertFlyout
          key="instruments"
          edge={edge}
          icon={<RulerIcon />}
          label={t('insert.instruments')}
          active={instrumentsOn}
          className="insert-flyout w-72"
        >
          {(close) => <InstrumentsPanel close={close} />}
        </InsertFlyout>
      )
    }

    if (id === 'image') {
      return (
        <InsertButton
          key="image"
          icon={<ImageIcon />}
          label={t('insert.image')}
          title={t('tool.image')}
          onClick={() => fileRef.current?.click()}
        />
      )
    }

    if (id === 'templates' && templates) {
      return (
        <div key="templates" className="contents">
          {templates}
        </div>
      )
    }

    return null
  }

  let selectGroupModes: SelectToolId[] = []
  const rendered = projected.map((entry) => {
    if (entry.kind === 'divider') return <BarDivider key={entry.id} vertical={!vertical} />
    if (entry.kind === 'selectGroup') {
      selectGroupModes = entry.modes
      const selecting = isSelectMode(tool)
      const currentModeId =
        selecting && entry.modes.includes(tool as SelectToolId)
          ? (tool as SelectToolId)
          : entry.modes.includes(lastSelect.current)
            ? lastSelect.current
            : entry.modes[0]
      const mode = SELECT_MODES.find((m) => m.tool === currentModeId) ?? SELECT_MODES[0]
      const canOpenSelectPopover = popoverOptions && entry.modes.length > 1
      return (
        <RailTool
          key="select-group"
          ref={bindRef('selectGroup')}
          label={t(mode.label)}
          shortcut={shortcutKey(mode.shortcut)}
          active={selecting}
          aria-haspopup={canOpenSelectPopover ? 'dialog' : undefined}
          aria-expanded={canOpenSelectPopover ? openPopover === 'selectGroup' : undefined}
          onContextMenu={canOpenSelectPopover ? onContextOpen('selectGroup') : undefined}
          onSelect={() => {
            if (selecting && canOpenSelectPopover) togglePopover('selectGroup')
            else {
              setTool(mode.tool)
              setOpenPopover(null)
            }
          }}
        >
          {mode.icon}
        </RailTool>
      )
    }
    return renderTool(entry.id)
  })

  if (openPopover) {
    anchorRef.current = buttonRefs.current[openPopover] ?? null
  } else {
    anchorRef.current = null
  }

  let popoverContent: ReactNode = null
  if (popoverOptions && openPopover) {
    if (openPopover === 'pen0' || openPopover === 'pen1' || openPopover === 'pen2') {
      const idx = openPopover === 'pen0' ? 0 : openPopover === 'pen1' ? 1 : 2
      popoverContent = (
        <InkOptionsCard
          title={t(`toolbar.pen${idx + 1}` as MessageKey)}
          slot={pens[idx]}
          colors={PEN_COLORS}
          sizes={PEN_SIZES}
          onChange={(patch) => updatePen(idx, patch)}
        />
      )
    } else if (openPopover === 'shapeStyle') {
      popoverContent = (
        <InkOptionsCard
          title={t('options.style')}
          slot={pens[activePen]}
          colors={PEN_COLORS}
          sizes={PEN_SIZES}
          onChange={(patch) => updatePen(activePen, patch)}
        />
      )
    } else if (openPopover === 'highlighter') {
      popoverContent = (
        <InkOptionsCard
          title={t('toolbar.highlighter')}
          slot={highlighter}
          colors={HIGHLIGHTER_COLORS}
          sizes={HIGHLIGHTER_SIZES}
          onChange={updateHighlighter}
        />
      )
    } else if (openPopover === 'eraser') {
      popoverContent = <EraserOptionsCard />
    } else if (openPopover === 'text') {
      popoverContent = <TextOptionsCard />
    } else if (openPopover === 'selectGroup' && selectGroupModes.length > 1) {
      popoverContent = <SelectOptionsCard modes={selectGroupModes} onSelect={() => setOpenPopover(null)} />
    }
  }

  return (
    <ChromeBarProvider edge={edge} compact={compact} showShortcuts={showShortcutBadges}>
      {projected.length > 0 && (
        <ScrollableBar vertical={vertical} label={barLabel}>
          {rendered}
        </ScrollableBar>
      )}
      {canInsertImages && (
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void editor.insertImages(files)
          }}
        />
      )}
      {popoverContent && anchorRef.current && openPopover && (
        <AnchoredPopover key={openPopover} anchorRef={anchorRef} edge={edge} onClose={() => setOpenPopover(null)}>
          {popoverContent}
        </AnchoredPopover>
      )}
    </ChromeBarProvider>
  )
}
