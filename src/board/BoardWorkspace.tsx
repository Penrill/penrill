import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
import type { Editor } from './editor'
import { EditorProvider, useSession } from './editorContext'
import { usePrefs } from './store'
import { useAppTheme } from './theme'
import { BoardActions } from './ui/BoardActions'
import { FormulaEditor } from './ui/FormulaEditor'
import { FunctionPanel } from './ui/FunctionPanel'
import { MathKeypad } from './ui/MathKeypad'
import { InstrumentPanel } from './ui/InstrumentPanel'
import { GraphDialog } from './ui/GraphDialog'
import { Board, type BoardFileActions } from './ui/Board'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { ShapeElementPopover } from './modules/shapeEditor/ShapeElementPopover'
import { ShapePanel } from './modules/shapeEditor/ShapePanel'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { TextEditor } from './ui/TextEditor'
import { ToolBar } from './ui/ToolBar'
import { ToolOptions } from './ui/ToolOptions'
import { PencilInputChoice } from './ui/PencilInputChoice'
import { InstrumentTip } from './ui/InstrumentTip'
import { ZoomControls } from './ui/ZoomControls'
import { NoticeArea } from './ui/notices'

interface BoardWorkspaceProps {
  /** The board's editor, made by the app with createEditor(). */
  editor: Editor
  fileActions?: BoardFileActions
  /** Top left: the app's board menu (all boards, file actions, the board's name). */
  menu?: ReactNode
  /** The app's templates button, shown in the insert bar (or unified toolbar). */
  extraTools?: ReactNode
  /** Top right, before the board's background and settings: the app's way to share the board. */
  share?: ReactNode
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

function WorkspaceChrome({
  menu,
  extraTools,
  share,
  storageSettings,
  about,
  fixedLanguage,
  hideExperimental
}: Pick<
  BoardWorkspaceProps,
  'menu' | 'extraTools' | 'share' | 'storageSettings' | 'about' | 'fixedLanguage' | 'hideExperimental'
>) {
  const layout = usePrefs((s) => s.workspaceLayout)
  const formulaEdit = useSession((s) => s.formulaEdit)

  const merged = layout.insertDock === 'merged'
  const showStrip = layout.optionsMode === 'strip'
  const popoverOptions = !showStrip

  const toolsBar = (edge: 'top' | 'bottom' | 'left' | 'right') => (
    <ToolBar
      key={`tools-${edge}`}
      scope={merged ? 'merged' : 'drawing'}
      edge={edge}
      templates={merged ? extraTools : undefined}
      insertLabels={false}
      popoverOptions={popoverOptions}
      collapseSelectTools={layout.collapseSelectTools}
    />
  )

  const insertBar = (edge: 'top' | 'bottom' | 'left' | 'right') => (
    <ToolBar
      key={`insert-${edge}`}
      scope="insert"
      edge={edge}
      templates={extraTools}
      insertLabels={layout.insertLabels}
      popoverOptions={popoverOptions}
    />
  )

  // Assemble bars for each edge declaratively from WorkspaceLayout.
  const topBars: ReactNode[] = []
  if (layout.toolsDock === 'top') topBars.push(toolsBar('top'))
  if (!merged && layout.insertDock === 'top') topBars.push(insertBar('top'))
  if (showStrip && layout.optionsDock === 'top') {
    topBars.push(<ToolOptions key="options-top" edge="top" collapseSelectTools={layout.collapseSelectTools} />)
  }

  const leftBars: ReactNode[] = []
  if (layout.toolsDock === 'left') leftBars.push(toolsBar('left'))
  if (!merged && layout.insertDock === 'left') leftBars.push(insertBar('left'))

  const rightBars: ReactNode[] = []
  if (layout.toolsDock === 'right') rightBars.push(toolsBar('right'))
  if (!merged && layout.insertDock === 'right') rightBars.push(insertBar('right'))

  // Bottom-center bars step aside while the on-screen math keypad occupies bottom centre.
  const bottomCenterBars: ReactNode[] = []
  if (!formulaEdit) {
    if (showStrip && layout.optionsDock === 'bottom') {
      bottomCenterBars.push(<ToolOptions key="options-bottom" edge="bottom" collapseSelectTools={layout.collapseSelectTools} />)
    }
    if (layout.toolsDock === 'bottom') bottomCenterBars.push(toolsBar('bottom'))
    if (!merged && layout.insertDock === 'bottom') bottomCenterBars.push(insertBar('bottom'))
  }

  const hasWideTopBar = layout.toolsDock === 'top' || (!merged && layout.insertDock === 'top')
  const hasWideBottomBar = layout.toolsDock === 'bottom'
  const topPrimary = topBars[0] ?? null
  const topSecondary = topBars.slice(1)

  const hasBottom =
    layout.zoomDock === 'bottom-left' ||
    layout.zoomDock === 'bottom-right' ||
    bottomCenterBars.length > 0

  return (
    <>
      <div
        data-chrome="top"
        className={clsx(
          'pointer-events-none absolute inset-x-3 top-3 z-10 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2',
          hasWideTopBar ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[1fr_auto_1fr]'
        )}
      >
        <div className="flex min-w-0 justify-start">{menu}</div>
        {topPrimary && (
          <div className="col-span-2 row-start-2 flex min-w-0 justify-center empty:hidden lg:col-span-1 lg:col-start-2 lg:row-start-1">
            {topPrimary}
          </div>
        )}
        <div className="col-start-2 row-start-1 flex items-start justify-end gap-2 lg:col-start-3">
          {layout.zoomDock === 'top-right' && <ZoomControls />}
          {share}
          <BoardActions
            storageSettings={storageSettings}
            about={about}
            fixedLanguage={fixedLanguage}
            hideExperimental={hideExperimental}
            templates={!!extraTools}
          />
        </div>
        {topSecondary.length > 0 && (
          <div className="col-span-full flex min-w-0 flex-col items-center gap-2 empty:hidden">
            {topSecondary}
          </div>
        )}
      </div>

      {leftBars.length > 0 && (
        <div
          data-chrome="left"
          className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center gap-2"
        >
          {leftBars}
        </div>
      )}

      {rightBars.length > 0 && (
        <div
          data-chrome="right"
          className="pointer-events-none absolute inset-y-0 right-3 z-10 flex items-center gap-2"
        >
          {rightBars}
        </div>
      )}

      {hasBottom && (
        <div
          data-chrome="bottom"
          className={clsx(
            'pointer-events-none absolute inset-x-3 bottom-3 z-10 grid items-end gap-x-3 gap-y-2',
            layout.zoomDock === 'bottom-left'
              ? 'grid-cols-[auto_minmax(0,1fr)]'
              : layout.zoomDock === 'bottom-right'
                ? 'grid-cols-[minmax(0,1fr)_auto]'
                : 'grid-cols-1',
            hasWideBottomBar ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[1fr_auto_1fr]'
          )}
        >
          {layout.zoomDock === 'bottom-left' && (
            <div className="flex justify-start lg:col-start-1">
              <ZoomControls />
            </div>
          )}
          {bottomCenterBars.length > 0 && (
            <div
              className={clsx(
                'flex min-w-0 flex-col items-center gap-2 empty:hidden lg:col-start-2',
                layout.zoomDock === 'bottom-left' ? 'col-start-2' : 'col-start-1'
              )}
            >
              {bottomCenterBars}
            </div>
          )}
          {layout.zoomDock === 'bottom-right' && (
            <div className="col-start-2 flex justify-end lg:col-start-3">
              <ZoomControls />
            </div>
          )}
        </div>
      )}
    </>
  )
}

export function BoardWorkspace({
  editor,
  fileActions,
  menu,
  extraTools,
  share,
  selectionActions,
  storageSettings,
  about,
  fixedLanguage,
  hideExperimental = false,
  covered = false,
  children
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
          <PencilInputChoice>
            <Board fileActions={fileActions} />
          </PencilInputChoice>
          <TextEditor />
          <FormulaEditor />
          <SelectionToolbar actions={selectionActions} />
          <ShapeElementPopover />
          <WorkspaceChrome
            menu={menu}
            extraTools={extraTools}
            share={share}
            storageSettings={storageSettings}
            about={about}
            fixedLanguage={fixedLanguage}
            hideExperimental={hideExperimental}
          />
          <GraphDialog />
          <FunctionPanel />
          <ShapePanel />
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
