import { PlusIcon, TrashIcon } from '@heroicons/react/20/solid'
import { BadgeButton } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Checkbox, CheckboxField } from '@penrill/ui/checkbox'
import { Divider } from '@penrill/ui/divider'
import { Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { editableShape } from '@penrill/core/shapeItems'
import { isTriangle, MAX_BASE, MIN_BASE, shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import { cornerAngleDeg } from '@penrill/core/triangleConstructions'
import {
  availableEdgeActions,
  availableVertexActions,
  setLabel,
  toggleAngle,
  toggleConstruction,
  toggleLabel,
  toggleLength
} from '@penrill/shape-editor/elements'
import { triangleOppositeVertex } from '@penrill/shape-editor/targets'
import { useLayoutEffect, useRef, useState } from 'react'
import { useEditor, useSession } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { usePrefs } from '../../store'
import { PanelTitle } from '../../ui/chrome'
import { fitBox, screenArea } from '../../ui/dock'

const CARD_CLASS =
  'fixed z-50 min-w-52 max-w-64 rounded-2xl bg-white p-3 text-zinc-950 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-white dark:ring-white/10'

/**
 * Compact contextual Catalyst card anchored beside a clicked vertex or edge of any selected 2D or
 * 3D shape. Driven by `availableVertexActions` and `availableEdgeActions` so every shape shares one
 * uniform interface without shape-specific branches.
 */
export function ShapeElementPopover() {
  const editor = useEditor()
  const t = useT()
  const pop = useSession((s) => s.shapePopover)
  const selectedIds = useSession((s) => s.selectedIds)
  const active = useSession((s) => s.active)
  useSession((s) => s.camera)
  useSession((s) => s.sceneVersion)
  useSession((s) => s.previewVersion)
  usePrefs((s) => s.shapeDefaults)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 224, h: 168 })
  useLayoutEffect(() => {
    const el = ref.current
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h)) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })

  const feature = editor.features.shapeEditor
  if (!pop || !feature || !active || !selectedIds.length) return null
  const items = editor.selectedItems()
  if (items.some((i) => i.locked)) return null
  const cam = editor.camera
  const close = (): void => editor.session.setState({ shapePopover: null })

  // --- First-class ShapeItem popover (2D & 3D unified) ---
  const shapeItem = items.length === 1 && items[0].type === 'shape' ? items[0] : null
  if (shapeItem) {
    if (pop.kind === 'vertex') {
      const targetId = pop.targetId ?? `v${pop.index}`
      const model = availableVertexActions(shapeItem, targetId)
      if (!model) return null
      const [wx, wy] = editor.shownPoint(shapeItem.id, model.vertex.pos[0], model.vertex.pos[1])
      const sx = (wx - cam.x) * cam.zoom
      const sy = (wy - cam.y) * cam.zoom
      const place = fitBox({ left: sx - 10, right: sx + 10, top: sy - 10, bottom: sy + 10 }, size.w, size.h, screenArea(), 'below', 10)
      return (
        <div
          ref={ref}
          className={CARD_CLASS}
          style={{ left: place.left, top: place.top }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PanelTitle>{t('shape.el.vertex')}</PanelTitle>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <CheckboxField className="!gap-x-2">
                <Checkbox color="blue" checked={model.currentLabel !== null} onChange={() => editor.replaceShapeItem(toggleLabel(shapeItem, targetId))} />
                <Label className="!text-xs/5">{t('shape.el.label')}</Label>
              </CheckboxField>
              {model.currentLabel !== null && (
                <Input
                  type="text"
                  value={model.currentLabel}
                  maxLength={4}
                  aria-label={t('shape.el.label')}
                  className="!w-14 [&_input]:px-1.5 [&_input]:py-0.5 [&_input]:text-center [&_input]:font-serif [&_input]:text-xs [&_input]:italic"
                  onChange={(e) => editor.replaceShapeItem(setLabel(shapeItem, targetId, e.target.value))}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' || e.key === 'Escape') close()
                  }}
                />
              )}
            </div>
            {model.hasAngle && model.vertex.angleDeg !== undefined && (
              <CheckboxField className="!gap-x-2">
                <Checkbox color="blue" checked={model.angleOn} onChange={() => editor.replaceShapeItem(toggleAngle(shapeItem, targetId))} />
                <Label className="!text-xs/5">{t('shape.el.angle', { deg: Math.round(model.vertex.angleDeg) })}</Label>
              </CheckboxField>
            )}
            {model.constructions.map((act) => (
              <CheckboxField key={act.id} className="!gap-x-2">
                <Checkbox
                  color="blue"
                  checked={act.active}
                  onChange={() => editor.replaceShapeItem(toggleConstruction(shapeItem, act.construction))}
                />
                <Label className="!text-xs/5">{t(act.labelKey as MessageKey, act.vars)}</Label>
              </CheckboxField>
            ))}
          </div>
          {model.connectTargets.length > 0 && (
            <>
              <Divider soft className="my-2.5" />
              <PanelTitle>{t('shape.el.connectTo')}</PanelTitle>
              <div className="flex flex-wrap gap-1.5">
                {model.connectTargets.map((ct) => (
                  <BadgeButton
                    key={ct.id}
                    color={ct.active ? 'blue' : 'zinc'}
                    title={t('shape.diagonalPair', {
                      pair: `${model.currentLabel ?? model.vertex.defaultLabel}${ct.label}`
                    })}
                    onClick={() => editor.replaceShapeItem(toggleConstruction(shapeItem, ct.construction))}
                  >
                    <span className="px-0.5 font-serif italic">{ct.label}</span>
                  </BadgeButton>
                ))}
              </div>
            </>
          )}
          {model.canRemove && (
            <>
              <Divider soft className="my-2.5" />
              <Button
                plain
                className="w-full !justify-start !px-2 !py-1 !text-xs text-red-600 dark:text-red-400"
                onClick={() => {
                  const next = feature.removeItemVertex(shapeItem, targetId)
                  if (next) editor.replaceShapeItem(next)
                  close()
                }}
              >
                <TrashIcon data-slot="icon" />
                {t('shape.el.removeVertex')}
              </Button>
            </>
          )}
        </div>
      )
    }

    const edgeId = pop.targetId ?? `e${pop.index}`
    const model = availableEdgeActions(shapeItem, edgeId)
    if (!model) return null
    const [wx, wy] = editor.shownPoint(shapeItem.id, model.mid[0], model.mid[1])
    const sx = (wx - cam.x) * cam.zoom
    const sy = (wy - cam.y) * cam.zoom
    const place = fitBox({ left: sx - 10, right: sx + 10, top: sy - 10, bottom: sy + 10 }, size.w, size.h, screenArea(), 'below', 10)
    const lenText = feature.formatLength(model.edge.length)
    return (
      <div
        ref={ref}
        className={CARD_CLASS}
        style={{ left: place.left, top: place.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <PanelTitle>{t('shape.el.edge')}</PanelTitle>
        <div className="space-y-2">
          <CheckboxField className="!gap-x-2">
            <Checkbox color="blue" checked={model.lengthOn} onChange={() => editor.replaceShapeItem(toggleLength(shapeItem, edgeId))} />
            <Label className="!text-xs/5">{t('shape.el.length', { len: lenText })}</Label>
          </CheckboxField>
          {model.constructions.map((act) => (
            <CheckboxField key={act.id} className="!gap-x-2">
              <Checkbox
                color="blue"
                checked={act.active}
                onChange={() => editor.replaceShapeItem(toggleConstruction(shapeItem, act.construction))}
              />
              <Label className="!text-xs/5">{t(act.labelKey as MessageKey, act.vars)}</Label>
            </CheckboxField>
          ))}
        </div>
        {model.canAddVertex && (
          <>
            <Divider soft className="my-2.5" />
            <Button
              plain
              className="w-full !justify-start !px-2 !py-1 !text-xs"
              onClick={() => {
                const inserted = feature.insertItemVertex(shapeItem, pop.index, model.mid)
                if (inserted) editor.replaceShapeItem(inserted.item)
                close()
              }}
            >
              <PlusIcon data-slot="icon" />
              {t('shape.el.addVertex').replace(/^\+\s*/, '')}
            </Button>
          </>
        )}
      </div>
    )
  }

  // --- Legacy v4-v11 StrokeItem.shape popover ---
  const sel = editableShape(items)
  if (!sel) return null
  const { spec } = sel

  let anchorWorld: [number, number] | null = null
  if (pop.kind === 'vertex') {
    const verts = shapePolygonVertices(spec)
    const v = verts[pop.index]
    if (!v) return null
    anchorWorld = v
  } else {
    const edges = shapeEdges(spec)
    const e = edges[pop.index]
    if (!e) return null
    anchorWorld = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
  }

  const [wx, wy] = editor.shownPoint(sel.parts[0].id, anchorWorld[0], anchorWorld[1])
  const sx = (wx - cam.x) * cam.zoom
  const sy = (wy - cam.y) * cam.zoom
  const place = fitBox({ left: sx - 10, right: sx + 10, top: sy - 10, bottom: sy + 10 }, size.w, size.h, screenArea(), 'below', 10)

  if (pop.kind === 'vertex') {
    const verts = shapePolygonVertices(spec)
    const n = verts.length
    const prev = verts[(pop.index - 1 + n) % n]
    const next = verts[(pop.index + 1) % n]
    const deg = Math.round(cornerAngleDeg(verts[pop.index], prev, next))
    const tri = isTriangle(spec.kind)
    const hasAlt = !!spec.altitudeAt?.includes(pop.index)
    const hasMed = !!spec.medianAt?.includes(pop.index)
    const hasBis = !!spec.bisectorAt?.includes(pop.index)
    const hasAng = !!spec.angleAt?.includes(pop.index)
    const canDelete = spec.kind === 'polygon' && n > MIN_BASE
    return (
      <div ref={ref} className={CARD_CLASS} style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
        <PanelTitle>{t('shape.el.vertex')}</PanelTitle>
        <div className="space-y-2">
          {tri && (
            <>
              <CheckboxField className="!gap-x-2">
                <Checkbox color="blue" checked={hasAlt} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'altitude'))} />
                <Label className="!text-xs/5">{t('shape.el.altitude')}</Label>
              </CheckboxField>
              <CheckboxField className="!gap-x-2">
                <Checkbox color="blue" checked={hasMed} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'median'))} />
                <Label className="!text-xs/5">{t('shape.el.median')}</Label>
              </CheckboxField>
              <CheckboxField className="!gap-x-2">
                <Checkbox color="blue" checked={hasBis} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'bisector'))} />
                <Label className="!text-xs/5">{t('shape.el.bisector')}</Label>
              </CheckboxField>
            </>
          )}
          <CheckboxField className="!gap-x-2">
            <Checkbox color="blue" checked={hasAng} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'angle'))} />
            <Label className="!text-xs/5">{t('shape.el.angle', { deg })}</Label>
          </CheckboxField>
        </div>
        {canDelete && (
          <>
            <Divider soft className="my-2.5" />
            <Button
              plain
              className="w-full !justify-start !px-2 !py-1 !text-xs text-red-600 dark:text-red-400"
              onClick={() => {
                const nextSpec = feature.removeVertex(spec, pop.index)
                if (nextSpec) editor.replaceShape(nextSpec)
                close()
              }}
            >
              <TrashIcon data-slot="icon" />
              {t('shape.el.removeVertex')}
            </Button>
          </>
        )}
      </div>
    )
  }

  const edges = shapeEdges(spec)
  const edge = edges[pop.index]
  const lenText = feature.formatLength(Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]))
  const tri = isTriangle(spec.kind)
  const opp = triangleOppositeVertex(pop.index)
  const hasLen = !!spec.lengthAt?.includes(pop.index)
  const hasAlt = tri && !!spec.altitudeAt?.includes(opp)
  const hasMed = tri && !!spec.medianAt?.includes(opp)
  const canAdd = spec.kind === 'polygon' && edges.length < MAX_BASE
  return (
    <div ref={ref} className={CARD_CLASS} style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
      <PanelTitle>{t('shape.el.edge')}</PanelTitle>
      <div className="space-y-2">
        <CheckboxField className="!gap-x-2">
          <Checkbox color="blue" checked={hasLen} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'length'))} />
          <Label className="!text-xs/5">{t('shape.el.length', { len: lenText })}</Label>
        </CheckboxField>
        {tri && (
          <>
            <CheckboxField className="!gap-x-2">
              <Checkbox color="blue" checked={hasAlt} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'altitude'))} />
              <Label className="!text-xs/5">{t('shape.el.altitudeToSide')}</Label>
            </CheckboxField>
            <CheckboxField className="!gap-x-2">
              <Checkbox color="blue" checked={hasMed} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'median'))} />
              <Label className="!text-xs/5">{t('shape.el.medianToSide')}</Label>
            </CheckboxField>
          </>
        )}
      </div>
      {canAdd && (
        <>
          <Divider soft className="my-2.5" />
          <Button
            plain
            className="w-full !justify-start !px-2 !py-1 !text-xs"
            onClick={() => {
              const inserted = feature.insertVertex(spec, pop.index, anchorWorld!)
              if (inserted) editor.replaceShape(inserted.spec)
              close()
            }}
          >
            <PlusIcon data-slot="icon" />
            {t('shape.el.addVertex').replace(/^\+\s*/, '')}
          </Button>
        </>
      )}
    </div>
  )
}
