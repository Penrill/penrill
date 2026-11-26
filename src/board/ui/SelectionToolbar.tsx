import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { canHaveEnds } from '../editor'
import { SELECTION_PAD } from '../engine/renderer'
import { editableShape } from '@penrill/core/shapeItems'
import { fullRuns, TEXT_SIZES } from '../engine/text'
import type { FormulaItem, ShapeItem, StrokeItem, TextItem } from '@penrill/core/types'
import { useT } from '../i18n'
import { PEN_COLORS, PEN_SIZES, usePrefs } from '../store'
import { DuplicateIcon, FitIcon, FormulaIcon, FunctionIcon, GearIcon, GroupIcon, LockIcon, ShapesIcon, StyleIcon, TextIcon, TrashIcon, UngroupIcon, UnlockIcon } from './icons'
import { LineStyleControls, SizeSlider } from './LineStyle'
import { fitBox, screenArea } from './dock'
import { Popover } from './Popover'
import { useEditor, useSession } from '../editorContext'

/** Small floating action bar above the current selection (like Whiteboard's context menu). */
export function SelectionToolbar({ actions }: { actions?: (side: 'above' | 'below') => ReactNode }) {
  const editor = useEditor()
  const t = useT()
  const selectedIds = useSession((s) => s.selectedIds)
  const active = useSession((s) => s.active)
  const fnPanel = useSession((s) => s.fnPanel)
  const shapePanel = useSession((s) => s.shapePanel)
  // Re-render when the camera, items or workspace chrome layout change so the bar stays clear of edges.
  useSession((s) => s.camera)
  useSession((s) => s.sceneVersion)
  useSession((s) => s.previewVersion)
  usePrefs((s) => s.workspaceLayout)
  const [styling, setStyling] = useState(false)
  const closeStyle = useCallback(() => setStyling(false), [])
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 40 })
  useLayoutEffect(() => {
    const el = ref.current
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })
  if (!selectedIds.length || !active) return null
  const box = editor.selectionBBox()
  if (!box) return null
  const items = editor.selectedItems()
  const anyLocked = items.some((i) => i.locked)
  const allLocked = items.every((i) => i.locked)
  // Formulas that are functions (y = x², f(t) = …) can be plotted on a new plane next to them.
  const plots = items.some((i) => i.type === 'formula') ? editor.selectedPlots().length : 0
  const graph = !anyLocked && items.length === 1 && items[0].type === 'graph' ? items[0] : null
  const shapeItem = !anyLocked && items.length === 1 && items[0].type === 'shape' ? items[0] : null
  const legacyShape = anyLocked || shapeItem ? null : editableShape(items)
  const activeKind = shapeItem?.geo.kind ?? legacyShape?.spec.kind ?? null
  const firstGroup = items[0]?.groupId
  const oneGroup = !!firstGroup && items.every((i) => i.groupId === firstGroup)
  const canGroup = items.length >= 2 && !oneGroup
  // A legacy solid's own group (its edges) isn't something to ungroup; that would only break the shape.
  const anyShape = editableShape(items)
  const shapeGid = anyShape?.parts[0].groupId
  const ownShapeGroup = !!shapeGid && editor.scene.getItems().filter((i) => i.groupId === shapeGid).length === anyShape!.parts.length
  const canUngroup = items.some((i) => i.groupId) && !ownShapeGroup
  const lineItems = items.filter((i): i is StrokeItem | ShapeItem => (i.type === 'stroke' || i.type === 'shape') && !i.locked)
  const first = lineItems[0]
  const hasStraight = lineItems.some(canHaveEnds)
  const firstText = items.find((i): i is TextItem => i.type === 'text' && !i.locked)
  const firstFormula = items.find((i): i is FormulaItem => i.type === 'formula' && !i.locked)
  /** What the style panel shows the colour and size of. */
  const styled = first ?? firstText ?? firstFormula
  const resize = (size: number): void => {
    if (firstText) editor.restyleText({ size })
    if (firstFormula) editor.restyleFormula({ size })
  }
  const cam = editor.camera
  // Above the selection when there is room, else below it; always fully inside the window.
  const place = fitBox(
    {
      left: (box.minX - cam.x) * cam.zoom,
      right: (box.maxX - cam.x) * cam.zoom,
      top: (box.minY - cam.y) * cam.zoom - SELECTION_PAD,
      bottom: (box.maxY - cam.y) * cam.zoom + SELECTION_PAD
    },
    size.w,
    size.h,
    screenArea(),
    'above',
    12
  )
  return (
    <div ref={ref} className="panel selection-toolbar" style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
      {graph && (
        <>
          <button
            className="labeled-btn"
            title={t('graph.editTitle')}
            onClick={() => editor.session.setState({ graphDialog: { mode: 'edit', id: graph.id, params: { ...graph } } })}
          >
            <GearIcon />
          </button>
          {graph.kind === 'plane' && (
            <button
              className={`labeled-btn ${fnPanel?.id === graph.id ? 'active' : ''}`}
              title={t('graph.plotTitle')}
              onClick={() => editor.session.setState({ fnPanel: fnPanel?.id === graph.id ? null : { id: graph.id, session: Date.now() } })}
            >
              <FunctionIcon />
            </button>
          )}
          {graph.kind === 'plane' && !!graph.fns?.length && (
            <button className="labeled-btn" title={t('graph.fit')} onClick={() => editor.fitGraph(graph.id)}>
              <FitIcon />
            </button>
          )}
          <div className="sep" />
        </>
      )}
      {(shapeItem || legacyShape) && activeKind && (
        <button
          className={`labeled-btn ${shapePanel ? 'active' : ''}`}
          title={t('sel.shapeTitle')}
          onClick={() => editor.session.setState((s) => ({ shapePanel: !s.shapePanel }))}
        >
          <ShapesIcon />
        </button>
      )}
      {firstText && items.length === 1 && (
        <button className="labeled-btn" title={t('text.edit')} onClick={() => editor.editText(firstText)}>
          <TextIcon />
        </button>
      )}
      {firstFormula && items.length === 1 && (
        <button className="labeled-btn" title={t('formula.edit')} onClick={() => editor.editFormula(firstFormula)}>
          <FormulaIcon />
        </button>
      )}
      {plots > 0 && (
        <button className="labeled-btn" title={t(plots > 1 ? 'formula.plotMany' : 'formula.plot', { n: plots })} onClick={() => editor.plotSelected()}>
          <FunctionIcon />
        </button>
      )}
      {styled && (
        <div className="menu-anchor">
          <button data-popover-anchor className="labeled-btn" title={t('sel.style')} onClick={() => setStyling((v) => !v)}>
            <StyleIcon />
          </button>
          {styling && (
            <Popover onClose={closeStyle} className="sel-popover style-popover" fit={place.side}>
              <div className="swatches">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${styled.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => {
                      if (first) editor.restyleSelection({ color: c })
                      if (firstText) editor.restyleText({ color: c })
                      if (firstFormula) editor.restyleFormula({ color: c })
                    }}
                  />
                ))}
              </div>
              {first ? (
                <>
                  <div className="sizes">
                    {PEN_SIZES.map((sz) => (
                      <button key={sz} className={`size ${first.size === sz ? 'active' : ''}`} onClick={() => editor.restyleSelection({ size: sz })}>
                        <span style={{ width: 6 + (sz / 12) * 20, height: 6 + (sz / 12) * 20, background: first.color }} />
                      </button>
                    ))}
                  </div>
                  <SizeSlider value={first.size} max={40} onChange={(size) => editor.restyleSelection({ size })} />
                  <LineStyleControls value={first} onChange={(p) => editor.restyleSelection(p)} showCaps={hasStraight} />
                </>
              ) : (
                <>
                  <div className="sizes">
                    {TEXT_SIZES.map((sz) => (
                      <button key={sz} className={`size text-size ${styled.size === sz ? 'active' : ''}`} onClick={() => resize(sz)}>
                        <span style={{ fontSize: 9 + sz / 4 }}>A</span>
                      </button>
                    ))}
                  </div>
                  <SizeSlider value={styled.size} max={160} onChange={resize} />
                  {firstText && <TextFormatButtons text={firstText} />}
                </>
              )}
            </Popover>
          )}
        </div>
      )}
      {canGroup && (
        <button className="labeled-btn" title={`${t('sel.group')} (Ctrl+G)`} onClick={() => editor.groupSelection()}>
          <GroupIcon />
        </button>
      )}
      {canUngroup && (
        <button className="labeled-btn" title={`${t('sel.ungroup')} (Ctrl+Shift+G)`} onClick={() => editor.ungroupSelection()}>
          <UngroupIcon />
        </button>
      )}
      {(canGroup || canUngroup) && <div className="sep" />}
      <button
        className={`labeled-btn ${allLocked ? 'locked' : ''}`}
        title={allLocked ? t('sel.unlockTitle') : t('sel.lockTitle')}
        onClick={() => editor.toggleLockSelection()}
      >
        {allLocked ? <LockIcon /> : <UnlockIcon />}
      </button>
      {actions?.(place.side)}
      <button className="icon-btn" title={t('sel.duplicate')} onClick={() => editor.duplicateSelection()}>
        <DuplicateIcon />
      </button>
      <button className="icon-btn" title={t('sel.delete')} disabled={allLocked} onClick={() => editor.deleteSelection()}>
        <TrashIcon />
      </button>
    </div>
  )
}

/** Bold / italic / underline for whole text items (lit when every character has it). */
function TextFormatButtons({ text }: { text: TextItem }) {
  const editor = useEditor()
  const t = useT()
  const runs = fullRuns(text)
  const all = (k: 'bold' | 'italic' | 'underline'): boolean => runs.every((r) => r[k])
  return (
    <div className="tf-row text-format-row">
      {(['bold', 'italic', 'underline'] as const).map((k) => (
        <button key={k} className={`tf-btn ${all(k) ? 'active' : ''}`} title={t(`text.${k}`)} onClick={() => editor.restyleText({ [k]: !all(k) })}>
          {k === 'bold' ? <b>B</b> : k === 'italic' ? <i>I</i> : <u>U</u>}
        </button>
      ))}
    </div>
  )
}
