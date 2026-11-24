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
import { fitBox, screenArea } from '../../ui/dock'

/**
 * Compact contextual popover anchored beside a clicked vertex or edge of any selected 2D or 3D
 * shape. Driven by `availableVertexActions` and `availableEdgeActions` so every shape shares one
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
  usePrefs((s) => s.shapeDefaults)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 204, h: 148 })
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

  // --- First-class ShapeItem popover (2D & 3D unified!) ---
  const shapeItem = items.length === 1 && items[0].type === 'shape' ? items[0] : null
  if (shapeItem) {
    if (pop.kind === 'vertex') {
      const targetId = pop.targetId ?? `v${pop.index}`
      const model = availableVertexActions(shapeItem, targetId)
      if (!model) return null
      const sx = (model.vertex.pos[0] - cam.x) * cam.zoom
      const sy = (model.vertex.pos[1] - cam.y) * cam.zoom
      const place = fitBox({ left: sx - 10, right: sx + 10, top: sy - 10, bottom: sy + 10 }, size.w, size.h, screenArea(), 'below', 10)
      return (
        <div
          ref={ref}
          className="panel shape-element-popover"
          style={{ left: place.left, top: place.top }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="shape-el-title">{t('shape.el.vertex')}</div>
          <div className="shape-el-list">
            <div className="shape-el-label-row">
              <label>
                <input
                  type="checkbox"
                  checked={model.currentLabel !== null}
                  onChange={() => editor.replaceShapeItem(toggleLabel(shapeItem, targetId))}
                />
                <span>{t('shape.el.label')}</span>
              </label>
              {model.currentLabel !== null && (
                <input
                  type="text"
                  className="shape-el-label-input"
                  value={model.currentLabel}
                  maxLength={4}
                  aria-label={t('shape.el.label')}
                  onChange={(e) => editor.replaceShapeItem(setLabel(shapeItem, targetId, e.target.value))}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' || e.key === 'Escape') close()
                  }}
                />
              )}
            </div>
            {model.hasAngle && model.vertex.angleDeg !== undefined && (
              <label>
                <input
                  type="checkbox"
                  checked={model.angleOn}
                  onChange={() => editor.replaceShapeItem(toggleAngle(shapeItem, targetId))}
                />
                <span>{t('shape.el.angle', { deg: Math.round(model.vertex.angleDeg) })}</span>
              </label>
            )}
            {model.constructions.map((act) => (
              <label key={act.id}>
                <input
                  type="checkbox"
                  checked={act.active}
                  onChange={() => editor.replaceShapeItem(toggleConstruction(shapeItem, act.construction))}
                />
                <span>{t(act.labelKey as MessageKey, act.vars)}</span>
              </label>
            ))}
          </div>
          {model.canRemove && (
            <div className="shape-el-actions">
              <button
                type="button"
                className="shape-el-action danger"
                onClick={() => {
                  const next = feature.removeItemVertex(shapeItem, targetId)
                  if (next) editor.replaceShapeItem(next)
                  close()
                }}
              >
                {t('shape.el.removeVertex')}
              </button>
            </div>
          )}
        </div>
      )
    }

    const edgeId = pop.targetId ?? `e${pop.index}`
    const model = availableEdgeActions(shapeItem, edgeId)
    if (!model) return null
    const sx = (model.mid[0] - cam.x) * cam.zoom
    const sy = (model.mid[1] - cam.y) * cam.zoom
    const place = fitBox({ left: sx - 10, right: sx + 10, top: sy - 10, bottom: sy + 10 }, size.w, size.h, screenArea(), 'below', 10)
    const lenText = feature.formatLength(model.edge.length)
    return (
      <div
        ref={ref}
        className="panel shape-element-popover"
        style={{ left: place.left, top: place.top }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="shape-el-title">{t('shape.el.edge')}</div>
        <div className="shape-el-list">
          <label>
            <input
              type="checkbox"
              checked={model.lengthOn}
              onChange={() => editor.replaceShapeItem(toggleLength(shapeItem, edgeId))}
            />
            <span>{t('shape.el.length', { len: lenText })}</span>
          </label>
          {model.constructions.map((act) => (
            <label key={act.id}>
              <input
                type="checkbox"
                checked={act.active}
                onChange={() => editor.replaceShapeItem(toggleConstruction(shapeItem, act.construction))}
              />
              <span>{t(act.labelKey as MessageKey, act.vars)}</span>
            </label>
          ))}
        </div>
        {model.canAddVertex && (
          <div className="shape-el-actions">
            <button
              type="button"
              className="shape-el-action"
              onClick={() => {
                const inserted = feature.insertItemVertex(shapeItem, pop.index, model.mid)
                if (inserted) editor.replaceShapeItem(inserted.item)
                close()
              }}
            >
              {t('shape.el.addVertex')}
            </button>
          </div>
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

  const sx = (anchorWorld[0] - cam.x) * cam.zoom
  const sy = (anchorWorld[1] - cam.y) * cam.zoom
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
      <div ref={ref} className="panel shape-element-popover" style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="shape-el-title">{t('shape.el.vertex')}</div>
        <div className="shape-el-list">
          {tri && (
            <>
              <label>
                <input type="checkbox" checked={hasAlt} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'altitude'))} />
                <span>{t('shape.el.altitude')}</span>
              </label>
              <label>
                <input type="checkbox" checked={hasMed} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'median'))} />
                <span>{t('shape.el.median')}</span>
              </label>
              <label>
                <input type="checkbox" checked={hasBis} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'bisector'))} />
                <span>{t('shape.el.bisector')}</span>
              </label>
            </>
          )}
          <label>
            <input type="checkbox" checked={hasAng} onChange={() => editor.replaceShape(feature.toggleVertexFeature(spec, pop.index, 'angle'))} />
            <span>{t('shape.el.angle', { deg })}</span>
          </label>
        </div>
        {canDelete && (
          <div className="shape-el-actions">
            <button
              type="button"
              className="shape-el-action danger"
              onClick={() => {
                const nextSpec = feature.removeVertex(spec, pop.index)
                if (nextSpec) editor.replaceShape(nextSpec)
                close()
              }}
            >
              {t('shape.el.removeVertex')}
            </button>
          </div>
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
    <div ref={ref} className="panel shape-element-popover" style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="shape-el-title">{t('shape.el.edge')}</div>
      <div className="shape-el-list">
        <label>
          <input type="checkbox" checked={hasLen} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'length'))} />
          <span>{t('shape.el.length', { len: lenText })}</span>
        </label>
        {tri && (
          <>
            <label>
              <input type="checkbox" checked={hasAlt} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'altitude'))} />
              <span>{t('shape.el.altitudeToSide')}</span>
            </label>
            <label>
              <input type="checkbox" checked={hasMed} onChange={() => editor.replaceShape(feature.toggleEdgeFeature(spec, pop.index, 'median'))} />
              <span>{t('shape.el.medianToSide')}</span>
            </label>
          </>
        )}
      </div>
      {canAdd && (
        <div className="shape-el-actions">
          <button
            type="button"
            className="shape-el-action"
            onClick={() => {
              const inserted = feature.insertVertex(spec, pop.index, anchorWorld!)
              if (inserted) editor.replaceShape(inserted.spec)
              close()
            }}
          >
            {t('shape.el.addVertex')}
          </button>
        </div>
      )}
    </div>
  )
}
