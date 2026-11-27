import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormulaState, Row } from '@penrill/math/formula'
import { caretOf, typesetRows } from '../engine/formulatype'
import { inkColor, withInkSurface } from '../engine/surface'
import { useT } from '../i18n'
import { usePrefs } from '../store'
import { FormulaField } from './FormulaField'
import { MoveIcon } from './icons'
import { MathSvg } from './MathSvg'
import { useEditor, useSession } from '../editorContext'

const PAD = 8

/**
 * The formula being built on the board: an editable field exactly where the formula will be drawn,
 * at the board's zoom. When the formula is plain arithmetic, a "Show answer" button sits beside it
 * (so the class can work it out first); once shown, the value can be added to the formula.
 */
export function FormulaEditor() {
  const editor = useEditor()
  const t = useT()
  const fe = useSession((s) => s.formulaEdit)
  const cam = useSession((s) => s.camera)
  const background = usePrefs((s) => s.background)
  const active = useSession((s) => s.active)
  const lang = usePrefs((s) => s.lang)
  const size = fe ? fe.size * cam.zoom : 0
  const rows: Row | null = fe?.rows ?? null
  const lay = useMemo(() => (rows ? typesetRows(rows, size, true) : null), [rows, size])
  // The answer comes from the formulas module's evaluator; without one the formula is shown alone.
  const evaluator = editor.features.formulaEvaluator
  const result = useMemo(() => (rows && evaluator ? evaluator.result(rows, lang === 'uk') : null), [rows, lang, evaluator])
  const shown = useMemo(
    () => (result ? typesetRows([{ t: 'c', s: result.approx ? '≈' : '=' }, ...result.atoms], Math.max(14, Math.min(size, 28)), false) : null),
    [result, size]
  )
  // The answer stays hidden until asked for, again for every formula edited and after it can't be worked out.
  const session = fe ? `${fe.id ?? 'new'}:${fe.opened ?? `${fe.x}:${fe.baseline}`}` : ''
  // Where a drag of the grip started: the pointer on screen and the formula on the board.
  const drag = useRef<{ px: number; py: number; x: number; baseline: number } | null>(null)
  const [revealed, setRevealed] = useState('')
  const open = !!result && revealed === session
  useEffect(() => {
    if (!result && revealed) setRevealed('')
  }, [result, revealed])
  // A long formula grows past the window edge: keep the caret in sight by moving the board.
  const caret = fe && lay ? caretOf(lay, fe.cur) : undefined
  const caretX = fe && caret ? (fe.x - cam.x) * cam.zoom + caret.x : null
  useEffect(() => {
    if (caretX === null) return
    const edge = 48
    const over = caretX > window.innerWidth - edge ? caretX - (window.innerWidth - edge) : caretX < edge ? caretX - edge : 0
    if (over) editor.setCamera({ ...editor.camera, x: editor.camera.x + over / editor.camera.zoom })
  }, [caretX])
  if (!fe || !lay || !active) return null

  const value: FormulaState = { rows: fe.rows, cur: fe.cur }
  const set = (st: FormulaState): void => {
    const cur = editor.session.getState().formulaEdit
    if (cur) editor.session.setState({ formulaEdit: { ...cur, rows: st.rows, cur: st.cur } })
  }
  const accept = (): boolean => {
    if (!result) return false
    // Tab first shows the answer, a second Tab writes it.
    if (!open) {
      setRevealed(session)
      return true
    }
    // An approximate value is written with ≈ unless the formula already ends with =.
    const lead: Row = result.hasEq ? [] : [{ t: 'c', s: result.approx ? '≈' : '=' }]
    const next = [...fe.rows, ...lead, ...result.atoms]
    set({ rows: next, cur: { path: [], i: next.length } })
    return true
  }

  return (
    <div
      className="formula-editor"
      style={{ left: (fe.x - cam.x) * cam.zoom - PAD, top: (fe.baseline - cam.y) * cam.zoom - lay.box.asc - PAD, color: withInkSurface(background, () => inkColor(fe.color)) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="formula-grip"
        title={t('formula.move')}
        // Not a focus change: the formula keeps the caret (and isn't finished by a blur).
        onPointerDown={(e) => {
          e.preventDefault()
          if (!e.isPrimary || e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { px: e.clientX, py: e.clientY, x: fe.x, baseline: fe.baseline }
        }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={(e) => {
          const d = drag.current
          const cur = editor.session.getState().formulaEdit
          if (!d || !cur || !e.currentTarget.hasPointerCapture(e.pointerId)) return
          const z = editor.camera.zoom
          editor.session.setState({ formulaEdit: { ...cur, x: d.x + (e.clientX - d.px) / z, baseline: d.baseline + (e.clientY - d.py) / z } })
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <MoveIcon />
      </div>
      <FormulaField
        value={value}
        onChange={set}
        size={size}
        pad={PAD}
        autoFocus
        fieldKey={session}
        onDone={() => editor.commitFormula()}
        onBlur={() => editor.commitFormula()}
        onTab={accept}
      />
      {result && !open && (
        <button
          className="formula-result formula-reveal"
          title={t('formula.showAnswerTitle')}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setRevealed(session)}
        >
          {t('formula.showAnswer')}
        </button>
      )}
      {shown && open && (
        <button
          className="formula-result"
          title={t('formula.insertResult')}
          // Not a focus change: the formula keeps the caret.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={accept}
        >
          <MathSvg lay={shown} pad={2} holes={false} />
        </button>
      )}
    </div>
  )
}
