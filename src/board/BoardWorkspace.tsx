import { useEffect, type ReactNode } from 'react'
import type { Editor } from './editor'
import { EditorProvider } from './editorContext'
import { useAppTheme } from './theme'
import { BoardActions } from './ui/BoardActions'
import { FormulaEditor } from './ui/FormulaEditor'
import { FunctionPanel } from './ui/FunctionPanel'
import { MathKeypad } from './ui/MathKeypad'
import { InstrumentPanel } from './ui/InstrumentPanel'
import { GraphDialog } from './ui/GraphDialog'
import { Board, type BoardFileActions } from './ui/Board'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { TextEditor } from './ui/TextEditor'
import { InsertBar } from './ui/InsertBar'
import { ToolOptions } from './ui/ToolOptions'
import { ToolRail } from './ui/ToolRail'
import { InstrumentTip } from './ui/InstrumentTip'
import { ZoomControls } from './ui/ZoomControls'
import { NoticeArea } from './ui/notices'

interface BoardWorkspaceProps {
  /** The board's editor, made by the app with createEditor(). */
  editor: Editor
  fileActions?: BoardFileActions
  /** Top left: the app's board menu (all boards, file actions, the board's name). */
  menu?: ReactNode
  /** The app's templates button, shown in the insert bar. */
  extraTools?: ReactNode
  selectionActions?: (side: 'above' | 'below') => ReactNode
  storageSettings?: ReactNode
  about?: ReactNode
  fixedLanguage?: boolean
  /** Hide the Experimental features section (the desktop app keeps flags out of the way). */
  hideExperimental?: boolean
  /**
   * Another screen (the app's home screen) lies over the whole board: the board stays loaded for a
   * quick way back, but is hidden and out of reach, so scrolling past the edge of that screen
   * doesn't show it.
   */
  covered?: boolean
  children?: ReactNode
}

export function BoardWorkspace({
  editor, fileActions, menu, extraTools, selectionActions, storageSettings, about, fixedLanguage, hideExperimental = false, covered = false, children
}: BoardWorkspaceProps) {
  useAppTheme()
  useEffect(() => {
    // Buttons and sliders shouldn't keep keyboard focus after a click: a focused button would be
    // "pressed" again by Space (hold-to-pan) or Enter, and the focus ring lingers on the toolbar.
    const drop = (e: PointerEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, input[type="range"], input[type="checkbox"]')
      // Buttons that open a menu, flyout or dialog keep it: Headless UI hands focus over to what
      // they opened, and taking it away from under it closes it again.
      if (el?.matches('[aria-haspopup], [aria-expanded], [role="tab"], [role="dialog"] *')) return
      if (el instanceof HTMLElement) setTimeout(() => document.activeElement === el && el.blur(), 0)
    }
    window.addEventListener('pointerup', drop, true)
    return () => window.removeEventListener('pointerup', drop, true)
  }, [])
  return (
    <EditorProvider editor={editor}>
    <div className="app">
      <div className={covered ? 'invisible contents' : 'contents'} inert={covered}>
      <Board fileActions={fileActions} />
      <TextEditor />
      <FormulaEditor />
      <SelectionToolbar actions={selectionActions} />
      {/* The chrome: each place on the screen has one job. Top: the board (left), how the current
          tool draws (centre), background and settings (right). Left: the drawing tools. Bottom:
          things to put on the board (centre) and the view (right). */}
      <div
        data-chrome="top"
        className="pointer-events-none absolute inset-x-3 top-3 z-10 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2 lg:grid-cols-[1fr_auto_1fr]"
      >
        <div className="flex min-w-0 justify-start">{menu}</div>
        <div className="col-span-2 row-start-2 flex min-w-0 justify-center lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <ToolOptions />
        </div>
        <div className="col-start-2 row-start-1 flex justify-end lg:col-start-3">
          <BoardActions
            storageSettings={storageSettings}
            about={about}
            fixedLanguage={fixedLanguage}
            hideExperimental={hideExperimental}
            templates={!!extraTools}
          />
        </div>
      </div>
      <ToolRail />
      <div
        data-chrome="bottom"
        className="pointer-events-none absolute inset-x-3 bottom-3 z-10 grid grid-cols-[1fr_auto] items-end gap-3 lg:grid-cols-[1fr_auto_1fr]"
      >
        <div className="flex min-w-0 justify-center lg:col-start-2">
          <InsertBar templates={extraTools} />
        </div>
        <div className="flex justify-end lg:col-start-3">
          <ZoomControls />
        </div>
      </div>
      <GraphDialog />
      <FunctionPanel />
      <InstrumentPanel />
      <MathKeypad />
      <NoticeArea />
      <InstrumentTip />
      <ShortcutsDialog fileActions={!!fileActions} />
      </div>
      {children}
    </div>
    </EditorProvider>
  )
}
