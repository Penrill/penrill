import * as Headless from '@headlessui/react'
import { ArrowPathIcon, ArrowUturnLeftIcon, Cog6ToothIcon, CursorArrowRaysIcon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Checkbox, CheckboxField } from '@penrill/ui/checkbox'
import { Divider } from '@penrill/ui/divider'
import { Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Switch } from '@penrill/ui/switch'
import { evaluateShape } from '@penrill/core/shapeEval'
import { effectiveQuat, quatToEulerDeg } from '@penrill/core/shapeEval3d'
import { shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import type { ShapeItem, ShapeSpec } from '@penrill/core/types'
import {
  availableWholeShapeActions,
  toggleAllAngles,
  toggleAllLabels,
  toggleAllLengths,
  toggleConstructionBatch,
  withShapeUpdate
} from '@penrill/shape-editor/elements'
import { detectViewPreset3d, isSideViewPreset, type ViewPreset3d } from '@penrill/shape-editor/gizmo3d'
import { useEffect, useState } from 'react'
import { useEditor, useSession } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { usePrefs } from '../../store'
import { PanelTitle, Segmented } from '../../ui/chrome'

/** Compact color-coded X/Y/Z degree input built on Catalyst Input. */
function EulerAxisInput({
  axis,
  accentClass,
  value,
  onCommit
}: {
  axis: 'X' | 'Y' | 'Z'
  accentClass: string
  value: number
  onCommit: (deg: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (raw: string): void => {
    const n = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onCommit(Math.max(-180, Math.min(180, Math.round(n))))
    } else {
      setDraft(String(value))
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 shrink-0 text-xs font-semibold ${accentClass}`}>{axis}</span>
      <Input
        type="number"
        min={-180}
        max={180}
        step={1}
        aria-label={`${axis} angle`}
        value={draft}
        className="[&_input]:px-2 [&_input]:py-1 [&_input]:text-right [&_input]:text-xs [&_input]:tabular-nums [&_input]:[appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none"
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const n = Number(next)
          if (next.trim() !== '' && next !== '-' && Number.isFinite(n)) {
            onCommit(Math.max(-180, Math.min(180, Math.round(n))))
          }
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            commit(draft)
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

export type TriangleConstructionOptions = Pick<ShapeSpec, 'incircle' | 'circumcircle'>

/** Whole-triangle circle options for the Insert panel and legacy shapes (Catalyst Checkboxes). */
export function TriangleConstructionControls({
  value,
  onChange
}: {
  value: TriangleConstructionOptions
  onChange: (patch: TriangleConstructionOptions) => void
}) {
  const t = useT()
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-zinc-950/5 pt-2.5 dark:border-white/5">
      {(['incircle', 'circumcircle'] as const).map((key) => (
        <CheckboxField key={key} className="!gap-x-2">
          <Checkbox color="blue" checked={!!value[key]} onChange={(checked) => onChange({ [key]: checked })} />
          <Label className="!text-xs/5">{t(`shapes.${key}`)}</Label>
        </CheckboxField>
      ))}
    </div>
  )
}

/** Unified whole-shape controls for a first-class 2D or 3D ShapeItem built exclusively with Catalyst UI. */
export function ShapeItemEditorControls({
  item,
  onChange,
  onOpenSettings,
  hideSettingsLink = false
}: {
  item: ShapeItem
  onChange: (next: ShapeItem) => void
  onOpenSettings?: () => void
  hideSettingsLink?: boolean
}) {
  const editor = useEditor()
  const t = useT()
  const gizmoDefault = usePrefs((s) => s.shapeDefaults.gizmo3d)
  const gizmoOverride = useSession((s) => s.gizmo3dOverride)
  const gizmoSpace = useSession((s) => s.gizmo3dSpace)
  const prev3dView = useSession((s) => s.prev3dView)
  const feature = editor.features.shapeEditor
  if (!feature) return null

  const ev = evaluateShape(item)
  const gizmoOn = gizmoOverride !== null ? gizmoOverride : gizmoDefault
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

  const canUnlock = feature.canUnlockFreeVertices(item)
  const customized = feature.isCustomizedItem(item)
  const activeView = ev.is3D ? detectViewPreset3d(item.geo) : null
  const canReturn3d = !!(ev.is3D && prev3dView && prev3dView.itemId === item.id && isSideViewPreset(activeView))

  const pickView = (preset: ViewPreset3d): void => {
    if (isSideViewPreset(preset)) {
      if (!isSideViewPreset(activeView)) {
        editor.session.setState({
          prev3dView: {
            itemId: item.id,
            ...(item.geo.rot3 ? { rot3: [...item.geo.rot3] } : {}),
            ...(item.geo.orbit ? { orbit: [...item.geo.orbit] } : {})
          }
        })
      }
    } else if (prev3dView?.itemId === item.id) {
      editor.session.setState({ prev3dView: null })
    }
    onChange(feature.applyViewPreset3d(item, preset))
  }

  const returnTo3d = (): void => {
    if (!prev3dView || prev3dView.itemId !== item.id) return
    const nextGeo = { ...item.geo }
    delete nextGeo.rot3
    delete nextGeo.orbit
    if (prev3dView.rot3) nextGeo.rot3 = [...prev3dView.rot3]
    else if (prev3dView.orbit) nextGeo.orbit = [...prev3dView.orbit]
    editor.session.setState({ prev3dView: null })
    onChange(withShapeUpdate(item, { geo: nextGeo }))
  }

  return (
    <div className="space-y-3">
      {(labelVerts.length > 0 || cornerVerts.length > 0 || lenCount > 0) && (
        <>
          <Divider soft />
          <div>
            <PanelTitle>{t('shapes.sectionDisplay')}</PanelTitle>
            <div className="grid grid-cols-3 gap-x-2 gap-y-2">
              {labelVerts.length > 0 && (
                <CheckboxField className="!gap-x-2">
                  <Checkbox color="blue" checked={allLabels} onChange={(v) => onChange(toggleAllLabels(item, v))} />
                  <Label className="!text-xs/5">{t('shapes.showLabelsShort')}</Label>
                </CheckboxField>
              )}
              {cornerVerts.length > 0 && (
                <CheckboxField className="!gap-x-2">
                  <Checkbox color="blue" checked={allAngles} onChange={(v) => onChange(toggleAllAngles(item, v))} />
                  <Label className="!text-xs/5">{t('shapes.showAnglesShort')}</Label>
                </CheckboxField>
              )}
              {lenCount > 0 && (
                <CheckboxField className="!gap-x-2">
                  <Checkbox color="blue" checked={allLengths} onChange={(v) => onChange(toggleAllLengths(item, v))} />
                  <Label className="!text-xs/5">{t('shapes.showLengthsShort')}</Label>
                </CheckboxField>
              )}
            </div>
          </div>
        </>
      )}

      {actions.length > 0 && (
        <>
          <Divider soft />
          <div>
            <PanelTitle>{t('shapes.sectionElements')}</PanelTitle>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {actions.map((act) => (
                <CheckboxField key={act.id} className="!gap-x-2">
                  <Checkbox
                    color="blue"
                    checked={act.active}
                    onChange={() => onChange(toggleConstructionBatch(item, act.constructions))}
                  />
                  <Label className="truncate !text-xs/5">{t(act.labelKey as MessageKey)}</Label>
                </CheckboxField>
              ))}
            </div>
          </div>
        </>
      )}

      {ev.is3D && (() => {
        const [ex, ey, ez] = quatToEulerDeg(effectiveQuat(item.geo))
        const projValue = activeView === 'iso' ? 'iso' : activeView === 'axon' ? 'axon' : ''
        return (
          <>
            <Divider soft />
            <div className="space-y-3">
              <Headless.Field className="flex items-center justify-between gap-3">
                <Headless.Label className="text-xs/5 font-medium text-zinc-950 select-none dark:text-white">
                  {t('shapes.gizmo3d')}
                </Headless.Label>
                <Switch color="blue" checked={gizmoOn} onChange={(checked) => editor.session.setState({ gizmo3dOverride: checked })} />
              </Headless.Field>

              {gizmoOn && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs/5 font-medium text-zinc-500 dark:text-zinc-400">{t('shapes.gizmoSpace')}</span>
                    <Segmented
                      label={t('shapes.gizmoSpace')}
                      value={gizmoSpace}
                      onChange={(space) => editor.session.setState({ gizmo3dSpace: space })}
                      options={[
                        { value: 'local', label: t('shapes.gizmoLocal') },
                        { value: 'world', label: t('shapes.gizmoWorld') }
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <EulerAxisInput axis="X" accentClass="text-red-600 dark:text-red-400" value={ex} onCommit={(x) => onChange(feature.setEulerDeg3d(item, [x, ey, ez]))} />
                    <EulerAxisInput axis="Y" accentClass="text-green-600 dark:text-green-400" value={ey} onCommit={(y) => onChange(feature.setEulerDeg3d(item, [ex, y, ez]))} />
                    <EulerAxisInput axis="Z" accentClass="text-blue-600 dark:text-blue-400" value={ez} onCommit={(z) => onChange(feature.setEulerDeg3d(item, [ex, ey, z]))} />
                  </div>
                </>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <PanelTitle className="!mb-0">{t('shapes.viewTitle')}</PanelTitle>
                  {canReturn3d && (
                    <Button plain className="!px-2 !py-0.5 !text-xs text-blue-600 dark:text-blue-400" onClick={returnTo3d}>
                      <ArrowUturnLeftIcon data-slot="icon" />
                      {t('shapes.view.back3d')}
                    </Button>
                  )}
                </div>
                <Segmented
                  label={t('shapes.viewTitle')}
                  value={projValue}
                  className="w-full [&>button]:flex-1 [&>button]:justify-center"
                  onChange={(v) => {
                    if (v === 'axon' || v === 'iso') pickView(v)
                  }}
                  options={[
                    { value: 'axon', label: t('shapes.view.axon') },
                    { value: 'iso', label: t('shapes.view.iso') }
                  ]}
                />
              </div>

              <div>
                <PanelTitle>{t('shapes.editSide')}</PanelTitle>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['front', 'back', 'top', 'bottom', 'right', 'left'] as const satisfies readonly ViewPreset3d[]).map((preset) =>
                    activeView === preset ? (
                      <Button key={preset} color="blue" className="!px-2 !py-1 !text-xs" onClick={() => pickView(preset)}>
                        {t(`shapes.view.${preset}` as MessageKey)}
                      </Button>
                    ) : (
                      <Button key={preset} outline className="!px-2 !py-1 !text-xs" onClick={() => pickView(preset)}>
                        {t(`shapes.view.${preset}` as MessageKey)}
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {(canUnlock || customized || !hideSettingsLink) && (
        <>
          <Divider soft />
          <div className="flex flex-wrap items-center gap-2">
            {!hideSettingsLink && (
              <Button
                plain
                className="!px-2 !py-1 !text-xs"
                onClick={() => {
                  onOpenSettings?.()
                  editor.session.setState({ settingsSection: 'shapes' })
                }}
              >
                <Cog6ToothIcon data-slot="icon" />
                {t('shapes.settingsLink')}
              </Button>
            )}
            {canUnlock && (
              <Button outline className="flex-1 !px-2.5 !py-1 !text-xs" onClick={() => onChange(feature.unlockFreeVertices(item))}>
                <CursorArrowRaysIcon data-slot="icon" />
                {t('shapes.freeVertices')}
              </Button>
            )}
            {customized && (
              <Button outline className="flex-1 !px-2.5 !py-1 !text-xs" onClick={() => onChange(feature.resetItemGeometry(item))}>
                <ArrowPathIcon data-slot="icon" />
                {t('shapes.reset')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Legacy quick toggles for v4-v11 StrokeItem shapes (Catalyst Checkboxes). */
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-zinc-950/5 pt-2.5 dark:border-white/5">
      {vCount > 0 && (
        <CheckboxField className="!gap-x-2">
          <Checkbox color="blue" checked={allAngles} onChange={(v) => onChange(feature.toggleAllAngles(spec, v))} />
          <Label className="!text-xs/5">{t('shapes.showAnglesShort')}</Label>
        </CheckboxField>
      )}
      {eCount > 0 && (
        <CheckboxField className="!gap-x-2">
          <Checkbox color="blue" checked={allLengths} onChange={(v) => onChange(feature.toggleAllLengths(spec, v))} />
          <Label className="!text-xs/5">{t('shapes.showLengthsShort')}</Label>
        </CheckboxField>
      )}
    </div>
  )
}

/** Footer actions inside Shape flyouts / legacy Shape inspector using Catalyst Buttons. */
export function ShapePopoverFooter({
  spec,
  onReset,
  onOpenSettings,
  hideSettingsLink = false
}: {
  spec?: ShapeSpec
  onReset?: (next: ShapeSpec) => void
  onOpenSettings?: () => void
  hideSettingsLink?: boolean
}) {
  const editor = useEditor()
  const t = useT()
  const feature = editor.features.shapeEditor
  if (!feature) return null
  const customized = !!(spec && onReset && feature.isCustomized(spec))
  if (hideSettingsLink && !customized) return null
  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-950/5 pt-2.5 dark:border-white/5">
      {!hideSettingsLink && (
        <Button
          plain
          className="!px-2 !py-1 !text-xs"
          onClick={() => {
            onOpenSettings?.()
            editor.session.setState({ settingsSection: 'shapes' })
          }}
        >
          <Cog6ToothIcon data-slot="icon" />
          {t('shapes.settingsLink')}
        </Button>
      )}
      {customized && (
        <Button outline className="!px-2.5 !py-1 !text-xs" onClick={() => onReset!(feature.resetGeometry(spec!))}>
          <ArrowPathIcon data-slot="icon" />
          {t('shapes.reset')}
        </Button>
      )}
    </div>
  )
}
