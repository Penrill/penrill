import { createShapeItem } from '@penrill/core/shapeConvert'
import { CELL_UNIT, CM_UNIT } from '@penrill/shape-editor/annotations'
import { toggleAllLengths } from '@penrill/shape-editor/elements'
import { MEASURE_RECIPES, shapeFromMeasurements, type MeasureRecipeId } from '@penrill/shape-editor/fromMeasurements'
import { Dialog, DialogTitle } from '@penrill/ui/dialog'
import { useEffect, useState } from 'react'
import { useEditor, useSession } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { prefsStore, usePrefs } from '../../store'
import { ShapePreview } from '../../ui/InsertMenus'
import { currentShapeFormat } from '../shapes'

/** The shapes to pick from; the triangle has three ways to give it (see TRIANGLE_MODES). */
const PICKS: { id: MeasureRecipeId; base?: number }[] = [
  { id: 'triangleSSS' },
  { id: 'rightTriangle' },
  { id: 'rectangle' },
  { id: 'rhombus' },
  { id: 'parallelogram' },
  { id: 'trapezoid' },
  { id: 'regular', base: 6 },
  { id: 'ellipse' },
  { id: 'cube' },
  { id: 'prism', base: 4 },
  { id: 'pyramid', base: 4 },
  { id: 'cylinder' },
  { id: 'cone' },
  { id: 'sphere' }
]
const TRIANGLE_MODES: MeasureRecipeId[] = ['triangleSSS', 'triangleSAS', 'triangleASA']
const isTriangleMode = (id: MeasureRecipeId): boolean => TRIANGLE_MODES.includes(id)

const defaults = (id: MeasureRecipeId): Record<string, string> =>
  Object.fromEntries(MEASURE_RECIPES[id].fields.map((f) => [f.id, String(f.def)]))

/**
 * "Exact shape": pick a shape, type its sides and angles (in the unit of the shape settings), and
 * it is put in the middle of the view with those numbers shown. Drawing shapes by hand is unchanged.
 */
export function ShapeMeasureDialog() {
  const editor = useEditor()
  const t = useT()
  const open = useSession((s) => s.shapeMeasure)
  const unit = usePrefs((s) => s.shapeDefaults.unit)
  const [recipe, setRecipe] = useState<MeasureRecipeId>('triangleSSS')
  const [values, setValues] = useState<Record<string, string>>(() => defaults('triangleSSS'))
  useEffect(() => {
    if (open) setValues(defaults(recipe))
  }, [open])
  if (!open) return null

  const pick = (id: MeasureRecipeId): void => {
    setRecipe(id)
    setValues(defaults(id))
  }
  const close = (): void => editor.session.setState({ shapeMeasure: false })
  const factor = unit === 'cells' ? CELL_UNIT : CM_UNIT
  const { fields, kind } = MEASURE_RECIPES[recipe]
  const parsed: Record<string, number> = {}
  for (const f of fields) {
    const n = Number((values[f.id] ?? '').replace(',', '.'))
    parsed[f.id] = f.type === 'len' ? n * factor : n
  }
  const result = shapeFromMeasurements(recipe, parsed)
  const unitLabel = currentShapeFormat().unitLabel

  const insert = (): void => {
    if (!result.ok) return
    const prefs = prefsStore.getState()
    const slot = prefs.pens[editor.session.getState().activePen]
    let item = createShapeItem(
      result.data,
      { color: slot.color, size: slot.size, tool: 'pen', ...(slot.dash ? { dash: slot.dash } : {}) },
      { id: 'exact', z: 0 }
    )
    const shapeEd = editor.features.shapeEditor
    if (shapeEd) {
      // The usual shape defaults (letters, angles), but the typed numbers are always shown.
      const typed = { lengths: item.lengths, angles: item.angles }
      item = shapeEd.applyItemDefaults(item, prefs.shapeDefaults)
      const merge = (a?: string[], b?: string[]): string[] | undefined => (a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined)
      item = { ...item, lengths: merge(item.lengths, typed.lengths), angles: merge(item.angles, typed.angles) }
      if (!item.lengths?.length) delete item.lengths
      if (!item.angles?.length) delete item.angles
    }
    if (result.allLengths) item = toggleAllLengths(item, true)
    editor.insertShapeItem(item)
    close()
  }

  return (
    <Dialog open onClose={close} size="md">
      <DialogTitle className="mb-4">{t('shapes.exactTitle')}</DialogTitle>

      <div className="shape-grid mb-4">
        {PICKS.map(({ id, base }) => {
          const k = MEASURE_RECIPES[id].kind
          const active = id === recipe || (isTriangleMode(id) && isTriangleMode(recipe))
          return (
            <button
              key={id}
              className={`shape-btn ${active ? 'active' : ''}`}
              title={t(id === 'regular' ? 'shapes.exactRegular' : (`shape.${k}` as MessageKey))}
              onClick={() => pick(id)}
            >
              <ShapePreview kind={k} base={base} />
            </button>
          )
        })}
      </div>

      {isTriangleMode(recipe) && (
        <div className="seg mb-4">
          {TRIANGLE_MODES.map((m) => (
            <button key={m} aria-pressed={m === recipe} className={m === recipe ? 'active' : ''} onClick={() => pick(m)}>
              {t(`shapes.exact.${m}` as MessageKey)}
            </button>
          ))}
        </div>
      )}

      <div className="mb-1 font-medium">{t(recipe === 'regular' ? 'shapes.exactRegular' : (`shape.${kind}` as MessageKey))}</div>
      <div className="form-grid">
        {fields.map((f) => (
          <ExactField
            key={`${recipe}:${f.id}`}
            label={f.label}
            title={t(`shapes.exactField.${f.type}` as MessageKey)}
            suffix={f.type === 'len' ? unitLabel : f.type === 'angle' ? '°' : ''}
            value={values[f.id] ?? ''}
            onChange={(s) => setValues({ ...values, [f.id]: s })}
            onEnter={insert}
          />
        ))}
      </div>
      {!result.ok && <div className="fn-error !ml-0 mt-3">{t(`shapes.exactError.${result.error}` as MessageKey)}</div>}

      <div className="modal-actions">
        <button className="text-btn" onClick={close}>
          {t('common.cancel')}
        </button>
        <button className="text-btn primary" disabled={!result.ok} onClick={insert}>
          {t('shapes.exactInsert')}
        </button>
      </div>
    </Dialog>
  )
}

function ExactField({
  label,
  title,
  suffix,
  value,
  onChange,
  onEnter
}: {
  label: string
  title: string
  suffix: string
  value: string
  onChange: (s: string) => void
  onEnter: () => void
}) {
  return (
    <>
      <label className="font-serif italic" title={title}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} (${title})`}
          className="w-24"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
        />
        <span>{suffix}</span>
      </div>
    </>
  )
}
