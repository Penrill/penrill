import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditor, useSession } from '../editorContext'
import { useT, type MessageKey } from '../i18n'
import { shortcutKey, type ShortcutId } from '../shortcuts'
import { type Tool, usePrefs } from '../store'
import { isToolShown, type ToolbarToolId } from '../toolbarLayout'
import { Bar, BarDivider, ToolButton } from './chrome'
import { BrushSelectIcon, EraserIcon, HandIcon, LaserIcon, LassoIcon, MoveIcon, PenIcon, RedoIcon, UndoIcon } from './icons'

/** The three ways to select, one button in the rail; the options strip switches between them. */
export const SELECT_MODES: { tool: Tool & ToolbarToolId; shortcut: ShortcutId; label: MessageKey; icon: ReactNode }[] = [
  { tool: 'select', shortcut: 'lasso', label: 'select.lasso', icon: <LassoIcon /> },
  { tool: 'brushSelect', shortcut: 'brushSelect', label: 'select.brush', icon: <BrushSelectIcon /> },
  { tool: 'move', shortcut: 'move', label: 'select.move', icon: <MoveIcon /> }
]

export const isSelectMode = (tool: Tool): boolean => SELECT_MODES.some((m) => m.tool === tool)

/** A pen, the highlighter or the eraser lying in the tray; the one in use slides out towards the board. */
function TrayItem({ label, shortcut, active, onClick, children }: { label: string; shortcut?: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={clsx(
        'group relative flex h-9 w-12 shrink-0 items-center overflow-visible rounded-xl transition-colors',
        active ? 'bg-blue-500/12 dark:bg-blue-500/25' : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
      )}
    >
      <span
        className={clsx(
          'block transition-transform duration-200 ease-out motion-reduce:transition-none',
          active ? 'translate-x-2.5' : '-translate-x-1.5 group-hover:translate-x-0'
        )}
      >
        {children}
      </span>
    </button>
  )
}

/**
 * The drawing rail on the left: select and pan, the pen tray (three pens, highlighter, eraser),
 * the laser, then undo and redo. Only drawing lives here; things you put on the board are in the
 * insert bar, and how the current tool draws is in the options strip at the top.
 */
export function ToolRail() {
  const editor = useEditor()
  const t = useT()
  const { tool, activePen, canUndo, canRedo } = useSession(
    useShallow((s) => ({ tool: s.tool, activePen: s.activePen, canUndo: s.canUndo, canRedo: s.canRedo }))
  )
  const { pens, highlighter, layout } = usePrefs(useShallow((s) => ({ pens: s.pens, highlighter: s.highlighter, layout: s.toolbarLayout })))
  const { setTool, selectPen } = editor.session.getState()
  const show = (id: ToolbarToolId): boolean => isToolShown(layout, id)

  // The select button picks the way of selecting used last.
  const lastSelect = useRef<Tool>('select')
  useEffect(() => {
    if (isSelectMode(tool)) lastSelect.current = tool
  }, [tool])
  const modes = SELECT_MODES.filter((m) => show(m.tool))
  const selecting = isSelectMode(tool)
  const mode = modes.find((m) => m.tool === (selecting ? tool : lastSelect.current)) ?? modes[0]

  const pen = (index: number): ReactNode => {
    const id = (['pen1', 'pen2', 'pen3'] as const)[index]
    if (!show(id)) return null
    return (
      <TrayItem
        key={id}
        label={t(`toolbar.pen${index + 1}` as MessageKey)}
        shortcut={shortcutKey(id)}
        active={tool === 'pen' && activePen === index}
        onClick={() => selectPen(index)}
      >
        <PenIcon color={pens[index].color} lying />
      </TrayItem>
    )
  }

  const navigate = [
    mode && (
      <ToolButton
        key="select"
        label={t(mode.label)}
        shortcut={shortcutKey(mode.shortcut)}
        active={selecting}
        onClick={() => setTool(mode.tool)}
      >
        {mode.icon}
      </ToolButton>
    ),
    show('pan') && (
      <ToolButton key="pan" label={t('tool.pan')} active={tool === 'pan'} onClick={() => setTool('pan')}>
        <HandIcon />
      </ToolButton>
    )
  ].filter(Boolean)

  const tray = [
    pen(0),
    pen(1),
    pen(2),
    show('highlighter') && (
      <TrayItem key="highlighter" label={t('toolbar.highlighter')} shortcut={shortcutKey('highlighter')} active={tool === 'highlighter'} onClick={() => setTool('highlighter')}>
        <PenIcon color={highlighter.color} highlighter lying />
      </TrayItem>
    ),
    show('eraser') && (
      <TrayItem key="eraser" label={t('toolbar.eraser')} shortcut={shortcutKey('eraser')} active={tool === 'eraser'} onClick={() => setTool('eraser')}>
        <EraserIcon lying />
      </TrayItem>
    )
  ].filter(Boolean)

  const present = show('laser') && (
    <ToolButton key="laser" label={t('toolbar.laser')} shortcut={shortcutKey('laser')} active={tool === 'laser'} onClick={() => setTool('laser')}>
      <LaserIcon />
    </ToolButton>
  )

  const history = [
    show('undo') && (
      <ToolButton key="undo" label={t('toolbar.undo')} shortcut={shortcutKey('undo')} disabled={!canUndo} onClick={() => editor.undo()}>
        <UndoIcon />
      </ToolButton>
    ),
    show('redo') && (
      <ToolButton key="redo" label={t('toolbar.redo')} shortcut={shortcutKey('redo')} disabled={!canRedo} onClick={() => editor.redo()}>
        <RedoIcon />
      </ToolButton>
    )
  ].filter(Boolean)

  const groups = [navigate, tray, present ? [present] : [], history].filter((g) => g.length > 0)
  if (groups.length === 0) return null

  return (
    <nav aria-label={t('rail.label')} data-chrome="rail" className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
      <Bar className="flex max-h-[calc(100%-1.5rem)] w-14 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none]">
        {groups.map((group, i) => (
          <div key={i} className="contents">
            {i > 0 && <BarDivider />}
            {group}
          </div>
        ))}
      </Bar>
    </nav>
  )
}
