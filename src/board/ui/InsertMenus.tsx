import { useEffect, useState, type ReactNode } from 'react'
import { BUILTIN_GRAPHS, DEFAULT_PLANE, graphBBox, graphSvg, type GraphPreset } from '../engine/graph'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import { isTriangle, MAX_BASE, MIN_BASE, SHAPE_BASES, SHAPES_2D, SHAPES_3D, type ShapeKind } from '@penrill/core/shapes'
import type { GraphItem, GraphParams, ShapeSpec } from '@penrill/core/types'
import { PAPER, toSvg } from '@penrill/render/display'
import { Checkbox, CheckboxField } from '@penrill/ui/checkbox'
import { Label } from '@penrill/ui/fieldset'
import { shapeDisplay } from '@penrill/shape-editor/shapeDisplay'
import { useT, type MessageKey } from '../i18n'
import { usePrefs, prefsStore } from '../store'
import { CompassIcon, PolygonIcon, ProtractorIcon, RulerIcon, SetSquare45Icon, SetSquare60Icon } from './icons'
import { shortcutKey } from '../shortcuts'
import { PanelTitle } from './chrome'
import { useEditor, useSession } from '../editorContext'
import { ShapePopoverFooter, TriangleConstructionControls, type TriangleConstructionOptions } from '../modules/shapeEditor/ShapeEditorControls'

/** Tiny SVG preview of a shape, drawn with the unified shapeDisplay renderer. */
export function ShapePreview({ kind, base, circles }: { kind: ShapeKind; base?: number; circles?: TriangleConstructionOptions }) {
  const linear = kind === 'line' || kind === 'arrow' || kind === 'doubleArrow'
  const spec: ShapeSpec = { ...circles, kind, ax: 4, ay: linear ? 20 : 4, bx: 24, by: linear ? 8 : 24, base }
  const item = createShapeItem(specToShapeData(spec), { color: 'currentColor', size: 1.5, tool: 'pen' }, { id: 'preview', z: 0 })
  const ev = evaluateShape(item)
  const x0 = Math.min(0, ev.bounds.minX - 2)
  const y0 = Math.min(0, ev.bounds.minY - 2)
  const x1 = Math.max(28, ev.bounds.maxX + 2)
  const y1 = Math.max(28, ev.bounds.maxY + 2)
  const prim = shapeDisplay(item, { unit: 'cm', unitLabel: 'cm', comma: false })
  const html = toSvg(prim, (c) => (c === PAPER ? 'transparent' : c))
  return (
    <svg
      width="28"
      height="28"
      viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** "Base: △ □ ⬠ ⬡ [n]": number of sides of a pyramid's / prism's base, polygon sides or star points. */
export function BaseRow({ kind, value, onChange }: { kind: ShapeKind; value: number; onChange: (n: number) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const opts = SHAPE_BASES[kind]
  if (!opts) return null
  const custom = !opts.options.includes(value)
  const labelKey: MessageKey = kind === 'polygon' ? 'shapes.sides' : kind === 'star' ? 'shapes.points' : 'shapes.base'
  const commit = (raw: string): void => {
    const n = Math.round(Number(raw))
    if (Number.isFinite(n) && n >= MIN_BASE && n <= MAX_BASE && n !== value) onChange(n)
  }
  return (
    <div className="base-row">
      <span className="base-label">{t(labelKey)}</span>
      {opts.options.map((n) => (
        <button
          key={n}
          className={`shape-btn small ${value === n ? 'active' : ''}`}
          title={kind === 'star' || n > 6 ? String(n) : t(`shapes.base${n}` as MessageKey)}
          onClick={() => onChange(n)}
        >
          <PolygonIcon n={n} />
        </button>
      ))}
      <label className={`base-n ${custom ? 'active' : ''}`} title={t('shapes.baseN')}>
        <span>n =</span>
        <input
          type="number"
          min={MIN_BASE}
          max={MAX_BASE}
          step={1}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.code === 'Enter' || e.code === 'NumpadEnter') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
    </div>
  )
}

/** Contents of the insert bar's Shapes flyout: pick a shape, then drag it out on the board. */
export function ShapesPanel({ close }: { close: () => void }) {
  const editor = useEditor()
  const t = useT()
  const tool = useSession((s) => s.tool)
  const shape = useSession((s) => s.shape)
  const bases = usePrefs((s) => s.shapeBases)
  const circles = usePrefs((s) => s.triangleCircles)
  // Hold-to-snap: the same setting as in Settings, Pen and mouse.
  const snap = usePrefs((s) => s.shapeSnap)
  const baseOf = (k: ShapeKind): number | undefined => (SHAPE_BASES[k] ? (bases[k] ?? SHAPE_BASES[k]!.def) : undefined)
  return (
    <>
      <PanelTitle>{t('shapes.title')}</PanelTitle>
      {[SHAPES_2D, SHAPES_3D].map((list, i) => (
        <div key={i} className={`shape-grid ${i ? 'solids' : ''}`}>
          {list.map((k) => (
            <button
              key={k}
              className={`shape-btn ${tool === 'shape' && shape === k ? 'active' : ''}`}
              title={t(`shape.${k}` as MessageKey)}
              onClick={() => {
                editor.session.setState({ tool: 'shape', shape: k })
                // Keep construction options available after choosing the shape.
                if (!SHAPE_BASES[k] && !isTriangle(k)) close()
              }}
            >
              <ShapePreview kind={k} base={baseOf(k)} circles={isTriangle(k) ? circles : undefined} />
            </button>
          ))}
        </div>
      ))}
      {tool === 'shape' && SHAPE_BASES[shape] && (
        <BaseRow
          kind={shape}
          value={baseOf(shape)!}
          onChange={(n) => prefsStore.setState((s) => ({ shapeBases: { ...s.shapeBases, [shape]: n } }))}
        />
      )}
      {tool === 'shape' && isTriangle(shape) && (
        <TriangleConstructionControls
          value={circles}
          onChange={(patch) => prefsStore.setState((s) => ({ triangleCircles: { ...s.triangleCircles, ...patch } }))}
        />
      )}
      {editor.features.strokeRecognizer && (
        <div className="mt-2.5 border-t border-zinc-950/5 pt-2.5 dark:border-white/5">
          <CheckboxField className="!gap-x-2">
            <Checkbox color="blue" checked={snap} onChange={(shapeSnap) => prefsStore.setState({ shapeSnap })} />
            <Label className="!text-xs/5">{t('settings.shapeSnap')}</Label>
          </CheckboxField>
        </div>
      )}
      <ShapePopoverFooter
        onOpenSettings={close}
        onExact={() => {
          close()
          editor.session.setState({ shapeMeasure: true })
        }}
      />
    </>
  )
}

/** Ruler, set squares, protractor and compass: each row turns one on or off and shows its key. */
export function useInstrumentRows() {
  const editor = useEditor()
  const ruler = useSession((s) => s.ruler !== null)
  const square = useSession((s) => s.setSquare?.kind ?? null)
  const protractor = useSession((s) => s.protractor !== null)
  const compass = useSession((s) => s.compass !== null)
  const rows: { id: 'ruler' | 'square45' | 'square60' | 'protractor' | 'compass'; label: MessageKey; icon: ReactNode; on: boolean; toggle: () => void }[] = [
    { id: 'ruler', label: 'toolbar.ruler', icon: <RulerIcon />, on: ruler, toggle: () => editor.toggleRuler() },
    { id: 'square45', label: 'toolbar.square45', icon: <SetSquare45Icon />, on: square === 'square45', toggle: () => editor.toggleSetSquare('square45') },
    { id: 'square60', label: 'toolbar.square60', icon: <SetSquare60Icon />, on: square === 'square60', toggle: () => editor.toggleSetSquare('square60') },
    { id: 'protractor', label: 'instruments.protractor', icon: <ProtractorIcon />, on: protractor, toggle: () => editor.toggleProtractor() },
    { id: 'compass', label: 'toolbar.compass', icon: <CompassIcon />, on: compass, toggle: () => editor.toggleCompass() }
  ]
  return rows
}

/**
 * Stays open while instruments are toggled, so several can be turned on or off in a row. Closes on
 * its button, on a click elsewhere, or as soon as the board is touched (the board cancels the
 * pointer's default action, so the popover's own outside-click check never sees it).
 */
export function InstrumentsPanel({ close }: { close: () => void }) {
  const t = useT()
  const rows = useInstrumentRows()
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest('.board-canvas')) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [close])
  return (
    <>
      <PanelTitle>{t('toolbar.instruments')}</PanelTitle>
      <div className="instrument-list">
        {rows.map((r) => (
          <button
            key={r.id}
            className={`instrument-row ${r.on ? 'active' : ''}`}
            aria-pressed={r.on}
            aria-keyshortcuts={shortcutKey(r.id)}
            onClick={r.toggle}
          >
            {r.icon}
            <span>{t(r.label)}</span>
            <kbd>{shortcutKey(r.id)}</kbd>
          </button>
        ))}
      </div>
    </>
  )
}

function presetLabel(p: GraphPreset, t: (k: MessageKey) => string): string {
  return p.builtin ? t(p.name as MessageKey) : p.name
}

/** Miniature of a coordinate line / plane, drawn with the same code as on the board. */
export function GraphPreview({ params }: { params: GraphParams }) {
  const g: GraphItem = { ...params, type: 'graph', id: 'preview', z: 0, ox: 0, oy: 0, color: '#1e1e1e', bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  const b = graphBBox(g)
  return (
    <svg
      className="graph-preview"
      viewBox={`${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      // Built from numbers and validated colours; any formula text goes through graphSvg's XML escaping.
      dangerouslySetInnerHTML={{ __html: graphSvg(g) }}
    />
  )
}

function GraphCard({ preset, label, onInsert, onDelete }: { preset: GraphPreset; label: string; onInsert: () => void; onDelete?: () => void }) {
  return (
    <div className="graph-card">
      <button className="graph-card-btn" title={label} onClick={onInsert}>
        <GraphPreview params={preset.params} />
        <span className="graph-card-label">{label}</span>
      </button>
      {onDelete && (
        <button className="graph-card-del" title={label} onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  )
}

export function GraphPanel({ close }: { close: () => void }) {
  const editor = useEditor()
  const t = useT()
  const mine = usePrefs((s) => s.graphPresets)
  const insert = (params: GraphParams): void => {
    editor.insertGraph(params)
    close()
  }
  return (
    <>
      <PanelTitle>{t('graph.title')}</PanelTitle>
      <div className="graph-grid">
        {BUILTIN_GRAPHS.map((p) => (
          <GraphCard key={p.id} preset={p} label={presetLabel(p, t)} onInsert={() => insert(p.params)} />
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <PanelTitle className="mt-3">{t('graph.mine')}</PanelTitle>
          <div className="graph-grid">
            {mine.map((p) => (
              <GraphCard
                key={p.id}
                preset={p}
                label={p.name}
                onInsert={() => insert(p.params)}
                onDelete={() => prefsStore.setState((s) => ({ graphPresets: s.graphPresets.filter((x) => x.id !== p.id) }))}
              />
            ))}
          </div>
        </>
      )}
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          close()
          editor.session.setState({ graphDialog: { mode: 'insert', params: DEFAULT_PLANE } })
        }}
      >
        <span>{t('graph.custom')}</span>
      </button>
      <button
        className="menu-item"
        onClick={() => {
          close()
          // Insert a plane right away and open the formula panel beside it.
          const id = editor.insertGraph(DEFAULT_PLANE)
          editor.session.setState({ fnPanel: { id, session: Date.now() } })
        }}
      >
        <span>{t('graph.functionGraph')}</span>
      </button>
    </>
  )
}

