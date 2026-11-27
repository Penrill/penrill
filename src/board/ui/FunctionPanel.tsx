import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isBlank, type FormulaState, type Row } from '@penrill/math/formula'
import { fnHead, FN_NAMES, FN_VARS, headRows, isEquation, nodeToRows, parseRows, plotHead, renameVar, transformRows, type FnTransform } from '../engine/formulaexpr'
import { FN_COLORS, liveFns, MAX_FNS, type FnRow } from '../engine/graph'
import { parseExpr } from '@penrill/math/mathexpr'
import type { GraphItem, GraphPoints, PlotFn } from '@penrill/core/types'
import { useT, type MessageKey } from '../i18n'
import { usePrefs } from '../store'
import { dockBeside } from './dock'
import { FormulaField } from './FormulaField'
import { Popover } from './Popover'
import { useEditor, useSession } from '../editorContext'

const PANEL_W = 320

let nextKey = 1
const at = (rows: Row): FormulaState => ({ rows, cur: { path: [], i: rows.length } })
/** The formula of a stored function: its keypad form, or its text turned into one (older boards). */
function rowsOfFn(f: PlotFn): Row {
  if (f.rows) return f.rows
  const r = parseExpr(f.expr)
  return r.ok ? nodeToRows(r.node, r.comma) : [...f.expr].filter((ch) => ch.trim()).map((s) => ({ t: 'c', s }) as const)
}
const rowsOf = (g: GraphItem): FnRow[] =>
  (g.fns ?? []).map((f) => {
    // A left side typed into the formula (x = y², w(z) = …) stays there, as it was written.
    const rows = rowsOfFn(f)
    return { key: nextKey++, color: f.color, st: at(rows), shown: rows, name: f.name, arg: f.arg, from: f.from, to: f.to, yFrom: f.yFrom, yTo: f.yTo }
  })
/** A new empty row; `head` is the name and variable of the plane's first function, which it shares. */
const blankRow = (color: string, head?: { name: string; arg: string }): FnRow => ({
  key: nextKey++,
  color,
  st: at([]),
  shown: null,
  ...(head ? { name: head.name, arg: head.arg } : {})
})
const stampOf = (g: GraphItem | undefined): string => (g ? JSON.stringify([g.fns ?? [], !!g.hideFormulas, g.points ?? {}]) : '')
const freeColor = (rows: FnRow[]): string => {
  const used = new Set(rows.map((r) => r.color))
  return FN_COLORS.find((c) => !used.has(c)) ?? FN_COLORS[rows.length % FN_COLORS.length]
}
/** The left side as the panel shows it: y =, y(t) =, f(x) =. */
const headText = (name: string, arg: string): string => (name === 'y' && arg === 'x' ? 'y =' : `${name}(${arg}) =`)

/** A number typed with a dot or a comma; empty = no limit. Keeps what is typed while it is half done (−, 2,). */
function LimitInput({ value, onChange, title }: { value: number | undefined; onChange: (v: number | undefined) => void; title: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const [editing, setEditing] = useState(false)
  const comma = usePrefs((s) => s.lang) === 'uk'
  const shown = editing ? text : value === undefined ? '' : String(value).replace('-', '−').replace('.', comma ? ',' : '.')
  return (
    <input
      className="fn-limit"
      inputMode="decimal"
      title={title}
      value={shown}
      onFocus={() => {
        setText(shown)
        setEditing(true)
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value)
        const s = e.target.value.trim().replace(/[−–]/g, '-').replace(',', '.')
        if (!s) onChange(undefined)
        else if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) onChange(Number(s))
      }}
      onKeyDown={(e) => {
        if (e.code === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** The left side of a function: opens the choice of its name and its variable. */
function HeadPicker({ name, arg, onPick }: { name: string; arg: string; onPick: (name: string, arg: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <div className="menu-anchor">
      <button data-popover-anchor className="fn-label fn-head" title={t('graph.fnHead')} onClick={() => setOpen((v) => !v)}>
        {headText(name, arg)}
      </button>
      {open && (
        <Popover onClose={close} className="fn-head-popover" fit="below">
          <div className="fn-head-title">{t('graph.fnName')}</div>
          <div className="fn-head-chips">
            {FN_NAMES.map((n) => (
              <button key={n} className={`chip fn-chip ${n === name ? 'active' : ''}`} disabled={n === arg} onClick={() => onPick(n, arg)}>
                {n}
              </button>
            ))}
          </div>
          <div className="fn-head-title">{t('graph.fnVar')}</div>
          <div className="fn-head-chips">
            {FN_VARS.map((v) => (
              <button key={v} className={`chip fn-chip ${v === arg ? 'active' : ''}`} disabled={v === name} onClick={() => onPick(name, v)}>
                {v}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

/** A number field of the transform menu (a, b, k), with its letter in front. */
function NumField({ name, value, onChange, title }: { name: string; value: number; onChange: (v: number) => void; title: string }) {
  return (
    <label className="fn-tf-num">
      <span className="fn-range-var">{name}</span>
      <LimitInput title={title} value={value} onChange={(v) => onChange(v ?? 0)} />
    </label>
  )
}

/**
 * The transformations of one function's graph (symmetries, parallel shift, stretches, absolute
 * value), opened under its row; each one adds the transformed graph to the plane as a new function.
 */
function TransformBox({ arg, eq, onApply }: { arg: string; eq: boolean; onApply: (t: FnTransform) => void }) {
  const t = useT()
  const [a, setA] = useState(2)
  const [b, setB] = useState(1)
  const [k, setK] = useState(2)
  const v = arg
  const btn = (label: string, tf: FnTransform, title?: string, off = false) => (
    <button className="chip fn-tf-btn" title={title} disabled={off} onClick={() => onApply(tf)}>
      {label}
    </button>
  )
  return (
    <div className="fn-tf-box">
      <div className="fn-head-title">{t('graph.transform.symmetry')}</div>
      <div className="fn-tf-line">
        {btn(`−f(${v})`, { k: 'flipX' }, t('graph.transform.flipX'))}
        {btn(`f(−${v})`, { k: 'flipY' }, t('graph.transform.flipY'))}
        {btn(`−f(−${v})`, { k: 'origin' }, t('graph.transform.origin'))}
        {btn(`${v} = f(y)`, { k: 'swap' }, t('graph.transform.swap'))}
      </div>
      <div className="fn-head-title">{t('graph.transform.shift')}</div>
      <div className="fn-tf-line">
        <NumField name="a" value={a} onChange={setA} title={t('graph.transform.shift')} />
        <NumField name="b" value={b} onChange={setB} title={t('graph.transform.shift')} />
        {btn(`f(${v} − a) + b`, { k: 'shift', a, b }, t('graph.transform.apply'), !a && !b)}
      </div>
      <div className="fn-head-title">{t('graph.transform.stretch')}</div>
      <div className="fn-tf-line">
        <NumField name="k" value={k} onChange={setK} title={t('graph.transform.stretch')} />
        {btn(`k·f(${v})`, { k: 'scaleY', by: k }, undefined, !k)}
        {btn(`f(k·${v})`, { k: 'scaleX', by: k }, undefined, !k)}
      </div>
      <div className="fn-head-title">{t('graph.transform.modulus')}</div>
      <div className="fn-tf-line">
        {btn(`|f(${v})|`, { k: 'abs' }, undefined, eq)}
        {btn(`f(|${v}|)`, { k: 'absX' })}
      </div>
      <div className="fn-tf-hint">{t('graph.transform.hint')}</div>
    </div>
  )
}

const focusRow = (key: number): void => document.querySelector<HTMLElement>(`[data-fn-key="${key}"] .formula-field`)?.focus()

/**
 * Formulas of one coordinate plane, docked beside it (never on top of it when there is room).
 * Not modal: every key updates the curve on the board right away, so the class watches it change.
 * Each formula is a keypad field (the math keypad opens while one has the focus); typing on the
 * keyboard works as before (`x^2`, `1/x`, `sqrt`).
 */
export function FunctionPanel() {
  const editor = useEditor()
  const t = useT()
  const panel = useSession((s) => s.fnPanel)
  const active = useSession((s) => s.active)
  // Follow the plane when the board is panned / zoomed or the plane moves.
  useSession((s) => s.camera)
  useSession((s) => s.previewVersion)
  const sceneVersion = useSession((s) => s.sceneVersion)
  const [rows, setRows] = useState<FnRow[]>([])
  const [hide, setHide] = useState(false)
  const [points, setPoints] = useState<GraphPoints | undefined>(undefined)
  /** The row whose transform menu is open. */
  const [tfKey, setTfKey] = useState<number | null>(null)
  const comma = usePrefs((s) => s.lang) === 'uk'
  const [focusKey, setFocusKey] = useState<number | null>(null)
  /** What this panel last wrote, to tell its own edits from undo / redo. */
  const written = useRef('')
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(300)

  const item = panel ? editor.scene.getById([panel.id])[0] : undefined
  const g = item?.type === 'graph' ? item : null
  const stamp = stampOf(g ?? undefined)

  /** Which opening of the panel the rows belong to: a new one always reloads them from its plane. */
  const opened = useRef('')

  // Load the plane's formulas when the panel opens, and again if they change from outside (undo).
  useEffect(() => {
    if (!g || !panel) return
    const opening = `${panel.id}:${panel.session}`
    if (opening === opened.current && stamp === written.current) return
    opened.current = opening
    const r = rowsOf(g)
    const start = r.length ? r : [blankRow(FN_COLORS[0])]
    setRows(start)
    setHide(!!g.hideFormulas)
    setPoints(g.points)
    written.current = stamp
    if (!r.length) setFocusKey(start[0].key)
  }, [panel?.id, panel?.session, sceneVersion])

  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight)
  })

  if (!panel || !g || !active) return null

  const write = (nextRows: FnRow[], nextHide: boolean, nextPoints = points): void => {
    const live = liveFns(nextRows)
    setRows(live.rows)
    setHide(nextHide)
    setPoints(nextPoints)
    editor.setGraphFns(g.id, live.fns, { hideFormulas: nextHide, points: nextPoints }, panel.session)
    // Remember the stored form (validated) so our own edit is not mistaken for an undo.
    const now = editor.scene.getById([g.id])[0]
    written.current = stampOf(now?.type === 'graph' ? now : undefined)
  }
  const setRow = (key: number, patch: Partial<FnRow>): void => write(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)), hide)
  /** The name and variable picked on the first function: every other one uses them too. */
  const firstHead = rows[0] ? fnHead({ rows: rows[0].st.rows, name: rows[0].name, arg: rows[0].arg }) : undefined
  const addRow = (): void => {
    const r = blankRow(freeColor(rows), firstHead)
    setFocusKey(r.key)
    write([...rows, r], hide)
  }
  const close = (): void => {
    editor.session.setState({ fnPanel: null })
  }
  /** Switch one kind of special point on or off; the coordinates are written the way the app's language writes them. */
  const togglePoint = (kind: 'extrema' | 'roots' | 'cross', on: boolean): void => {
    const next: GraphPoints = { ...points }
    delete next.comma
    if (on) next[kind] = true
    else delete next[kind]
    const any = next.extrema || next.roots || next.cross
    write(rows, hide, any ? { ...next, ...(comma ? { comma: true as const } : {}) } : {})
  }
  /** Add the transformed graph of row `i` right after it, in a colour of its own. */
  const transform = (i: number, tf: FnTransform): void => {
    const r = rows[i]
    const head = fnHead({ rows: r.st.rows, name: r.name, arg: r.arg })
    const body = transformRows(r.st.rows, head.arg, tf, comma)
    if (!body || rows.length >= MAX_FNS) return
    const eq = isEquation(body)
    // A named function gets the next free name (f → g), written as its own left side.
    const used = new Set(rows.map((x) => fnHead({ rows: x.st.rows, name: x.name, arg: x.arg }).name))
    const name = !eq && head.name !== 'y' ? FN_NAMES.find((n) => n !== 'y' && !used.has(n) && n !== head.arg) : undefined
    const st = at(name ? [...headRows(name, head.arg), ...body] : body)
    const added: FnRow = { key: nextKey++, color: freeColor(rows), st, shown: null, name: r.name, arg: r.arg }
    write([...rows.slice(0, i + 1), added, ...rows.slice(i + 1)], hide)
  }

  const { left, top } = dockBeside(editor.shownBBox(g), editor.camera, PANEL_W, height)

  return (
    <div
      ref={ref}
      className="panel fn-panel"
      style={{ left, top, width: PANEL_W }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.code === 'Escape') close()
      }}
    >
      <div className="fn-panel-head">
        <span className="fn-title">{t('graph.functions')}</span>
        <button className="text-btn" title={t('common.close')} onClick={close}>
          ✕
        </button>
      </div>
      {rows.map((r, i) => {
        const head = fnHead({ rows: r.st.rows, name: r.name, arg: r.arg })
        // A formula with its own left side (s(t) =, x = y², x² + y² = 4) needs no button for one.
        const ownHead = isEquation(r.st.rows) || plotHead(r.st.rows).len > 0
        const res = isBlank(r.st.rows) ? null : parseRows(r.st.rows, r.arg)
        const bad = res && !res.ok ? res : null
        const tfDisabled = rows.length >= MAX_FNS || !r.shown || !!bad
        // y on its own is the vertical axis: it takes an equation (x = y², x² + y² = 4).
        const code = bad?.code === 'unknownName' && bad.detail === 'y' ? 'yAxis' : bad?.code
        const err = bad ? t(`graph.fnError.${code}` as MessageKey, { s: bad.detail ?? '', v: head.arg }) : null
        return (
          <div key={r.key} className="fn-item">
            <div className="fn-row" data-fn-key={r.key}>
              <button
                className="fn-color"
                style={{ background: r.color }}
                title={t('graph.fnColor')}
                onClick={() => setRow(r.key, { color: FN_COLORS[(FN_COLORS.indexOf(r.color) + 1) % FN_COLORS.length] })}
              />
              {!ownHead && i > 0 && <span className="fn-label fn-head" title={t('graph.fnHeadShared')}>{headText(head.name, head.arg)}</span>}
              {!ownHead && i === 0 && (
                <HeadPicker
                  name={head.name}
                  arg={head.arg}
                  onPick={(name, arg) => {
                    // The other functions follow the first one (their own left side typed in stays).
                    const next = rows.map((x, j) => {
                      if (j > 0 && (isEquation(x.st.rows) || plotHead(x.st.rows).len > 0)) return x
                      const was = fnHead({ rows: x.st.rows, name: x.name, arg: x.arg })
                      // A left side typed into the formula gives way to the one picked here.
                      const len = plotHead(x.st.rows).len
                      let st = len ? at(x.st.rows.slice(len)) : x.st
                      // A new variable is written into the formula too: x² becomes t².
                      if (arg !== was.arg) st = at(renameVar(st.rows, was.arg, arg))
                      return { ...x, st, name, arg }
                    })
                    write(next, hide)
                  }}
                />
              )}
              <FormulaField
                className={`fn-field ${bad ? 'invalid' : ''}`}
                value={r.st}
                onChange={(st) => setRow(r.key, { st })}
                size={20}
                pad={7}
                plot
                autoFocus={r.key === focusKey}
                errorAt={bad?.at}
                onCancel={close}
                onDone={() => {
                  // Enter: next row, or a new one after the last filled row.
                  const nextRow = rows[i + 1]
                  if (nextRow) focusRow(nextRow.key)
                  else if (!isBlank(r.st.rows) && rows.length < MAX_FNS) addRow()
                }}
              />
              <button
                className={`text-btn fn-tf-open ${tfKey === r.key ? 'active' : ''}`}
                title={tfDisabled ? t('graph.transform.full') : t('graph.transform')}
                aria-expanded={tfKey === r.key}
                disabled={tfDisabled}
                onClick={() => setTfKey(tfKey === r.key ? null : r.key)}
              >
                ⇄
              </button>
              <button className="text-btn danger" title={t('graph.removeFunction')} onClick={() => write(rows.filter((x) => x.key !== r.key), hide)}>
                ×
              </button>
            </div>
            {err && <div className="fn-error">{err}</div>}
            {tfKey === r.key && !tfDisabled && <TransformBox arg={head.arg} eq={isEquation(r.st.rows)} onApply={(tf) => transform(i, tf)} />}
            <div className="fn-range" title={t('graph.fnRange')}>
              <span className="fn-range-var">{head.arg}</span>
              <span>{t('graph.fnFrom')}</span>
              <LimitInput title={t('graph.fnRange')} value={r.from} onChange={(from) => setRow(r.key, { from })} />
              <span>{t('graph.fnTo')}</span>
              <LimitInput title={t('graph.fnRange')} value={r.to} onChange={(to) => setRow(r.key, { to })} />
            </div>
            <div className="fn-range" title={t('graph.fnYRange')}>
              <span className="fn-range-var">{head.name}</span>
              <span>{t('graph.fnFrom')}</span>
              <LimitInput title={t('graph.fnYRange')} value={r.yFrom} onChange={(yFrom) => setRow(r.key, { yFrom })} />
              <span>{t('graph.fnTo')}</span>
              <LimitInput title={t('graph.fnYRange')} value={r.yTo} onChange={(yTo) => setRow(r.key, { yTo })} />
            </div>
          </div>
        )
      })}
      <div className="fn-actions">
        {rows.length < MAX_FNS && (
          <button className="text-btn outline" onClick={addRow}>
            {t('graph.addFunction')}
          </button>
        )}
        {!!g.fns?.length && (
          <button className="text-btn outline" title={t('graph.fit')} onClick={() => editor.fitGraph(g.id)}>
            {t('graph.fitShort')}
          </button>
        )}
      </div>
      <label className="fn-check">
        <input type="checkbox" checked={!hide} onChange={(e) => write(rows, !e.target.checked)} />
        <span>{t('graph.showFormulas')}</span>
      </label>
      <div className="fn-points">
        <div className="fn-head-title">{t('graph.points')}</div>
        <label className="fn-check">
          <input type="checkbox" checked={!!points?.extrema} onChange={(e) => togglePoint('extrema', e.target.checked)} />
          <span>{t('graph.points.extrema')}</span>
        </label>
        <label className="fn-check">
          <input type="checkbox" checked={!!points?.roots} onChange={(e) => togglePoint('roots', e.target.checked)} />
          <span>{t('graph.points.roots')}</span>
        </label>
        <label className="fn-check">
          <input type="checkbox" checked={!!points?.cross} disabled={!points?.cross && (g.fns?.length ?? 0) < 2} onChange={(e) => togglePoint('cross', e.target.checked)} />
          <span>{t('graph.points.cross')}</span>
        </label>
      </div>
    </div>
  )
}
