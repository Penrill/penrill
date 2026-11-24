import { evaluateShape } from '@penrill/core/shapeEval'
import { shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import type { ShapeItem, ShapeSpec } from '@penrill/core/types'
import {
  availableWholeShapeActions,
  toggleAllAngles,
  toggleAllLabels,
  toggleAllLengths,
  toggleConstructionBatch
} from '@penrill/shape-editor/elements'
import { useEditor } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { GearIcon } from '../../ui/icons'

export type TriangleConstructionOptions = Pick<ShapeSpec, 'incircle' | 'circumcircle'>

/** Whole-triangle circle options for the Insert panel and legacy shapes. */
export function TriangleConstructionControls({
  value,
  onChange
}: {
  value: TriangleConstructionOptions
  onChange: (patch: TriangleConstructionOptions) => void
}) {
  const t = useT()
  return (
    <div className="triangle-circles">
      {(['incircle', 'circumcircle'] as const).map((key) => (
        <label key={key}>
          <input type="checkbox" checked={!!value[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
          <span>{t(`shapes.${key}`)}</span>
        </label>
      ))}
    </div>
  )
}

/** Unified whole-shape controls for a first-class 2D or 3D ShapeItem (elements, measurements, unlock, reset, settings). */
export function ShapeItemEditorControls({
  item,
  onChange,
  onOpenSettings
}: {
  item: ShapeItem
  onChange: (next: ShapeItem) => void
  onOpenSettings?: () => void
}) {
  const editor = useEditor()
  const t = useT()
  const feature = editor.features.shapeEditor
  if (!feature) return null

  const ev = evaluateShape(item)
  const actions = availableWholeShapeActions(item)
  const cornerVerts = ev.vertices.filter((v) => v.angleDeg !== undefined && v.role !== 'inner')
  const labelVerts = ev.vertices.filter(
    (v) => v.role !== 'inner' && !(v.role === 'cardinal' && (item.geo.kind === 'ellipse' || item.geo.kind === 'cylinder' || item.geo.kind === 'cone' || item.geo.kind === 'sphere'))
  )
  const lenCount = item.geo.kind === 'ellipse' || item.geo.kind === 'sphere' ? 1 : ev.edges.length
  const allLabels = labelVerts.length > 0 && labelVerts.every((v) => !!item.labels?.[v.id])
  const allAngles = cornerVerts.length > 0 && cornerVerts.every((v) => !!item.angles?.includes(v.id))
  const allLengths =
    lenCount > 0 &&
    (item.geo.kind === 'ellipse'
      ? !!item.lengths?.includes('e0')
      : item.geo.kind === 'sphere'
        ? !!item.lengths?.includes('outer')
        : ev.edges.every((e) => !!item.lengths?.includes(e.id)))

  const canUnlock = feature.isConstrained2d(item)
  const customized = feature.isCustomizedItem(item)

  return (
    <>
      {actions.length > 0 && (
        <div className="triangle-circles">
          {actions.map((act) => (
            <label key={act.id}>
              <input
                type="checkbox"
                checked={act.active}
                onChange={() => onChange(toggleConstructionBatch(item, act.constructions))}
              />
              <span>{t(act.labelKey as MessageKey)}</span>
            </label>
          ))}
        </div>
      )}
      <div className="triangle-circles">
        {labelVerts.length > 0 && (
          <label>
            <input type="checkbox" checked={allLabels} onChange={(e) => onChange(toggleAllLabels(item, e.target.checked))} />
            <span>{t('shapes.showLabels')}</span>
          </label>
        )}
        {cornerVerts.length > 0 && (
          <label>
            <input type="checkbox" checked={allAngles} onChange={(e) => onChange(toggleAllAngles(item, e.target.checked))} />
            <span>{t('shapes.showAngles')}</span>
          </label>
        )}
        {lenCount > 0 && (
          <label>
            <input type="checkbox" checked={allLengths} onChange={(e) => onChange(toggleAllLengths(item, e.target.checked))} />
            <span>{t('shapes.showLengths')}</span>
          </label>
        )}
      </div>
      <div className="shape-reset-row">
        <button
          type="button"
          className="shape-settings-link"
          onClick={() => {
            onOpenSettings?.()
            editor.session.setState({ settingsSection: 'shapes' })
          }}
        >
          <GearIcon />
          <span>{t('shapes.settingsLink')}</span>
        </button>
        <div className="shape-reset-actions">
          {canUnlock && (
            <button type="button" className="shape-reset-btn" onClick={() => onChange(feature.unlockFreeVertices(item))}>
              {t('shapes.freeVertices')}
            </button>
          )}
          {customized && (
            <button type="button" className="shape-reset-btn" onClick={() => onChange(feature.resetItemGeometry(item))}>
              {t('shapes.reset')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Legacy quick toggles for v4-v11 StrokeItem shapes. */
export function ShapeMeasurementControls({ spec, onChange }: { spec: ShapeSpec; onChange: (next: ShapeSpec) => void }) {
  const editor = useEditor()
  const t = useT()
  const feature = editor.features.shapeEditor
  if (!feature) return null
  const vCount = shapePolygonVertices(spec).length
  const eCount = spec.kind === 'ellipse' ? 1 : shapeEdges(spec).length
  if (!vCount && !eCount) return null
  const allAngles = vCount > 0 && (spec.angleAt?.length ?? 0) >= vCount
  const allLengths = eCount > 0 && (spec.lengthAt?.length ?? 0) >= eCount
  return (
    <div className="triangle-circles">
      {vCount > 0 && (
        <label>
          <input type="checkbox" checked={allAngles} onChange={(e) => onChange(feature.toggleAllAngles(spec, e.target.checked))} />
          <span>{t('shapes.showAngles')}</span>
        </label>
      )}
      {eCount > 0 && (
        <label>
          <input type="checkbox" checked={allLengths} onChange={(e) => onChange(feature.toggleAllLengths(spec, e.target.checked))} />
          <span>{t('shapes.showLengths')}</span>
        </label>
      )}
    </div>
  )
}

/** Footer actions inside Shape popovers: link to Shape Settings + Reset shape when customized. */
export function ShapePopoverFooter({
  spec,
  onReset,
  onOpenSettings
}: {
  spec?: ShapeSpec
  onReset?: (next: ShapeSpec) => void
  onOpenSettings?: () => void
}) {
  const editor = useEditor()
  const t = useT()
  const feature = editor.features.shapeEditor
  if (!feature) return null
  const customized = !!(spec && onReset && feature.isCustomized(spec))
  return (
    <div className="shape-reset-row">
      <button
        type="button"
        className="shape-settings-link"
        onClick={() => {
          onOpenSettings?.()
          editor.session.setState({ settingsSection: 'shapes' })
        }}
      >
        <GearIcon />
        <span>{t('shapes.settingsLink')}</span>
      </button>
      {customized && (
        <button type="button" className="shape-reset-btn" onClick={() => onReset!(feature.resetGeometry(spec!))}>
          {t('shapes.reset')}
        </button>
      )}
    </div>
  )
}
