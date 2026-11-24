import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'
import type { Editor } from './editor'
import { EditorProvider, useEditor, useSession } from './editorContext'
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
import {
  EmptyEdgeDropZone,
  OptionsDropZone,
  useWorkspaceCustomize,
  WorkspaceCustomizeOverlay,
  WorkspaceCustomizeProvider,
  ZoomCornerDropZone
} from './ui/WorkspaceCustomizer'

interface BoardWorkspaceProps {
  /** The board's editor, made by the app with createEditor(). */
  editor: Editor
  fileActions?: BoardFileActions
  /** Top left: the app's board menu (all boards, file actions, the board's name). */
  menu?: ReactNode
  /** The app's templates button, shown on whichever bar holds the `templates` tool. */
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
  hideExperimental,
  covered
}: Pick<
  BoardWorkspaceProps,
  'menu' | 'extraTools' | 'share' | 'storageSettings' | 'about' | 'fixedLanguage' | 'hideExperimental' | 'covered'
>) {
  const editor = useEditor()
  const customize = useWorkspaceCustomize()
  const formulaEdit = useSession((s) => s.formulaEdit)
  const { active: customizing, layout, dragging } = customize

  useEffect(() => {
    if (covered && customizing) editor.session.setState({ customizingWorkspace: false })
  }, [covered, customizing, editor])

  const showStrip = layout.optionsMode === 'strip'
  const popoverOptions = !showStrip
  const draggingOptions = customizing && dragging?.kind === 'options'
  const draggingZoom = customizing && dragging?.kind === 'zoom'

  const renderEdgeBar = (edge: 'top' | 'bottom' | 'left' | 'right') => {
    const items = layout.docks[edge]
    if (items.length > 0) {
      return (
        <ToolBar
          key={`dock-${edge}`}
          edge={edge}
          items={items}
          templates={extraTools}
          insertLabels={layout.insertLabels}
          popoverOptions={popoverOptions}
          collapseSelectTools={layout.collapseSelectTools}
          showShortcutBadges={layout.showShortcutBadges}
        />
      )
    }
    if (customizing) return <EmptyEdgeDropZone key={`empty-${edge}`} edge={edge} />
    return null
  }

  const topEdgeBar = renderEdgeBar('top')
  const leftEdgeBar = renderEdgeBar('left')
  const rightEdgeBar = renderEdgeBar('right')
  const bottomEdgeBar = renderEdgeBar('bottom')

  const topOptions =
    showStrip && layout.optionsDock === 'top' ? (
      <ToolOptions key="options-top" edge="top" collapseSelectTools={layout.collapseSelectTools} />
    ) : draggingOptions && layout.optionsDock !== 'top' ? (
      <OptionsDropZone key="options-drop-top" edge="top" />
    ) : null

  const bottomOptions =
    showStrip && layout.optionsDock === 'bottom' ? (
      <ToolOptions key="options-bottom" edge="bottom" collapseSelectTools={layout.collapseSelectTools} />
    ) : draggingOptions && layout.optionsDock !== 'bottom' ? (
      <OptionsDropZone key="options-drop-bottom" edge="bottom" />
    ) : null

  const topBars: ReactNode[] = []
  if (topEdgeBar) topBars.push(topEdgeBar)
  if (topOptions) topBars.push(topOptions)

  const bottomCenterBars: ReactNode[] = []
  if (!formulaEdit || customizing) {
    if (bottomOptions) bottomCenterBars.push(bottomOptions)
    if (bottomEdgeBar) bottomCenterBars.push(bottomEdgeBar)
  }

  const hasWideTopBar = layout.docks.top.length > 0 || customizing
  const hasWideBottomBar = layout.docks.bottom.length > 0 || customizing
  const topPrimary = topBars[0] ?? null
  const topSecondary = topBars.slice(1)

  const showZoomTopLeft = layout.zoomDock === 'top-left'
  const showZoomTopRight = layout.zoomDock === 'top-right'
  const showZoomBottomLeft = layout.zoomDock === 'bottom-left'
  const showZoomBottomRight = layout.zoomDock === 'bottom-right'

  const hasBottomLeft = showZoomBottomLeft || draggingZoom
  const hasBottomRight = showZoomBottomRight || draggingZoom
  const hasBottom = hasBottomLeft || hasBottomRight || bottomCenterBars.length > 0

  const zChrome = customizing ? 'z-[75]' : 'z-10'

  return (
    <>
      <div
        data-chrome="top"
        className={clsx(
          'pointer-events-none absolute inset-x-3 top-3 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2',
          zChrome,
          hasWideTopBar ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[1fr_auto_1fr]'
        )}
      >
        <div className="flex min-w-0 items-start justify-start gap-2">
          <div className={clsx('flex min-w-0', customizing && 'pointer-events-none opacity-45')} inert={customizing}>
            {menu}
          </div>
          {showZoomTopLeft ? <ZoomControls /> : draggingZoom ? <ZoomCornerDropZone corner="top-left" /> : null}
        </div>
        {topPrimary && (
          <div className="col-span-2 row-start-2 flex min-w-0 justify-center empty:hidden lg:col-span-1 lg:col-start-2 lg:row-start-1">
            {topPrimary}
          </div>
        )}
        <div className="col-start-2 row-start-1 flex items-start justify-end gap-2 lg:col-start-3">
          {showZoomTopRight ? <ZoomControls /> : draggingZoom ? <ZoomCornerDropZone corner="top-right" /> : null}
          <div className={clsx('flex items-start gap-2', customizing && 'pointer-events-none opacity-45')} inert={customizing}>
            {share}
            <BoardActions
              storageSettings={storageSettings}
              about={about}
              fixedLanguage={fixedLanguage}
              hideExperimental={hideExperimental}
              templates={!!extraTools}
            />
          </div>
        </div>
        {topSecondary.length > 0 && (
          <div className="col-span-full flex min-w-0 flex-col items-center gap-2 empty:hidden">
            {topSecondary}
          </div>
        )}
      </div>

      {leftEdgeBar && (
        <div
          data-chrome="left"
          className={clsx('pointer-events-none absolute inset-y-0 left-3 flex items-center gap-2', zChrome)}
        >
          {leftEdgeBar}
        </div>
      )}

      {rightEdgeBar && (
        <div
          data-chrome="right"
          className={clsx('pointer-events-none absolute inset-y-0 right-3 flex items-center gap-2', zChrome)}
        >
          {rightEdgeBar}
        </div>
      )}

      {hasBottom && (
        <div
          data-chrome="bottom"
          className={clsx(
            'pointer-events-none absolute inset-x-3 bottom-3 grid items-end gap-x-3 gap-y-2',
            zChrome,
            hasBottomLeft && hasBottomRight
              ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
              : hasBottomLeft
                ? 'grid-cols-[auto_minmax(0,1fr)]'
                : hasBottomRight
                  ? 'grid-cols-[minmax(0,1fr)_auto]'
                  : 'grid-cols-1',
            hasWideBottomBar ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[1fr_auto_1fr]'
          )}
        >
          {hasBottomLeft && (
            <div className="flex justify-start lg:col-start-1">
              {showZoomBottomLeft ? <ZoomControls /> : <ZoomCornerDropZone corner="bottom-left" />}
            </div>
          )}
          {bottomCenterBars.length > 0 && (
            <div
              className={clsx(
                'flex min-w-0 flex-col items-center gap-2 empty:hidden lg:col-start-2',
                hasBottomLeft ? 'col-start-2' : 'col-start-1'
              )}
            >
              {bottomCenterBars}
            </div>
          )}
          {hasBottomRight && (
            <div className={clsx('flex justify-end lg:col-start-3', hasBottomLeft ? 'col-start-3' : 'col-start-2')}>
              {showZoomBottomRight ? <ZoomControls /> : <ZoomCornerDropZone corner="bottom-right" />}
            </div>
          )}
        </div>
      )}

      <WorkspaceCustomizeOverlay templates={!!extraTools} />
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
          <WorkspaceCustomizeProvider>
            <WorkspaceChrome
              menu={menu}
              extraTools={extraTools}
              share={share}
              storageSettings={storageSettings}
              about={about}
              fixedLanguage={fixedLanguage}
              hideExperimental={hideExperimental}
              covered={covered}
            />
          </WorkspaceCustomizeProvider>
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
