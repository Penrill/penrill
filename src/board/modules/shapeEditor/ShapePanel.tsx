import { Cog6ToothIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Divider } from '@penrill/ui/divider'
import { Subheading } from '@penrill/ui/heading'
import { editableShape } from '@penrill/core/shapeItems'
import { isLinear, isTriangle, SHAPE_BASES, SHAPES_2D, SHAPES_3D, type ShapeKind } from '@penrill/core/shapes'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor, useSession } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { dockBeside } from '../../ui/dock'
import { BaseRow, ShapePreview } from '../../ui/InsertMenus'
import {
  ShapeItemEditorControls,
  ShapeMeasurementControls,
  ShapePopoverFooter,
  TriangleConstructionControls
} from './ShapeEditorControls'

const PANEL_W = 320

/**
 * Floating Catalyst inspector card for the selected shape.
 * Stays open while editing vertices/edges/3D rings, renders above board toolbars (z-40), opens
 * clear of the shape and chrome bars, and can be dragged anywhere via its top grip like MathKeypad.
 */
export function ShapePanel() {
  const editor = useEditor()
  const t = useT()
  const open = useSession((s) => s.shapePanel)
  const selectedIds = useSession((s) => s.selectedIds)
  const active = useSession((s) => s.active)
  useSession((s) => s.sceneVersion)

  const panelRef = useRef<HTMLDivElement>(null)
  const gripOffset = useRef({ x: 0, y: 0 })
  const [anchorPos, setAnchorPos] = useState<{ left: number; top: number; minTop: number; maxBottom: number; maxHeight: number } | null>(null)
  const [panelHeight, setPanelHeight] = useState(360)
  // User-dragged position stored as % of available travel (identical to MathKeypad) so resizes stay in bounds.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  const items = open && active && selectedIds.length ? editor.selectedItems() : []
  const locked = items.some((i) => i.locked)
  const shapeItem = !locked && items.length === 1 && items[0].type === 'shape' ? items[0] : null
  const legacyShape = !locked && !shapeItem ? editableShape(items) : null
  const activeKind = shapeItem?.geo.kind ?? legacyShape?.spec.kind ?? null
  const visible = open && active && !!activeKind

  // Reset stored placement when closed so re-opening docks cleanly beside the newly selected shape.
  useEffect(() => {
    if (!visible) {
      setAnchorPos(null)
      setDragPos(null)
    }
  }, [visible])

  // Compute safe initial placement once on open (clear of shape, 3D rings, top bar, rail and bottom bar).
  useLayoutEffect(() => {
    if (!visible) return
    const h = panelRef.current?.offsetHeight || 360
    if (h !== panelHeight) setPanelHeight(h)
    if (anchorPos || dragPos) return
    const box = editor.selectionBBox()
    if (!box) return
    const isSolid = (SHAPES_3D as readonly ShapeKind[]).includes(activeKind!)
    const zoom = Math.max(0.25, editor.camera.zoom)
    const pad = (isSolid ? 48 : 12) / zoom
    const dockBox = { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad }
    setAnchorPos(dockBeside(dockBox, editor.camera, PANEL_W, h))
  })

  // Keep safe maxHeight updated on viewport resize.
  useEffect(() => {
    if (!visible) return
    const onResize = (): void => {
      if (!dragPos) setAnchorPos(null)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [visible, dragPos])

  if (!visible || !activeKind) return null

  const family: readonly ShapeKind[] = isLinear(activeKind)
    ? SHAPES_2D.filter((k) => isLinear(k))
    : (SHAPES_3D as readonly ShapeKind[]).includes(activeKind)
      ? SHAPES_3D
      : SHAPES_2D.filter((k) => !isLinear(k))

  const close = (): void => editor.session.setState({ shapePanel: false })
  const openSettings = (): void => editor.session.setState({ settingsSection: 'shapes' })

  const startDrag = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!e.isPrimary || e.button !== 0 || !panelRef.current) return
    if ((e.target as HTMLElement).closest('button, input')) return
    const rect = panelRef.current.getBoundingClientRect()
    gripOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveDrag = (e: ReactPointerEvent<HTMLElement>): void => {
    const el = panelRef.current
    const parent = el?.offsetParent
    if (!el || !(parent instanceof HTMLElement) || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const bounds = parent.getBoundingClientRect()
    const percent = (offset: number, travel: number): number =>
      travel > 0 ? Math.max(0, Math.min(100, (100 * offset) / travel)) : 0
    setDragPos({
      x: percent(e.clientX - bounds.left - gripOffset.current.x, parent.clientWidth - el.offsetWidth),
      y: percent(e.clientY - bounds.top - gripOffset.current.y, parent.clientHeight - el.offsetHeight)
    })
  }

  const fallbackMaxH = typeof window !== 'undefined' ? Math.max(240, window.innerHeight - 168) : 520
  const maxHeight = anchorPos?.maxHeight ?? fallbackMaxH
  const clampedTop = anchorPos
    ? Math.max(anchorPos.minTop, Math.min(anchorPos.top, anchorPos.maxBottom - Math.min(panelHeight, maxHeight)))
    : 80
  const style = dragPos
    ? {
        left: `${dragPos.x}%`,
        top: `${dragPos.y}%`,
        transform: `translate(-${dragPos.x}%, -${dragPos.y}%)`,
        width: PANEL_W,
        maxHeight
      }
    : {
        left: anchorPos?.left ?? 16,
        top: clampedTop,
        width: PANEL_W,
        maxHeight
      }

  return (
    <div
      ref={panelRef}
      style={style}
      className="pointer-events-auto absolute z-40 flex flex-col overflow-hidden rounded-2xl bg-white text-zinc-950 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-white dark:ring-white/10"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.code === 'Escape') close()
      }}
    >
      {/* Top drag grip matching MathKeypad so the panel can be moved anywhere on the board. */}
      <div
        title={t('shapes.movePanel')}
        className="flex h-5 shrink-0 cursor-grab items-center justify-center touch-none select-none active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
      >
        <span className="h-1 w-10 rounded-full bg-zinc-950/20 dark:bg-white/25" />
      </div>

      {/* Header (also draggable) using Catalyst Subheading and plain icon Buttons. */}
      <div
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 px-3.5 pb-2.5 touch-none select-none active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
      >
        <Subheading level={3} className="truncate">
          {t(`shape.${activeKind}` as MessageKey)}
        </Subheading>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button plain className="!p-1.5" title={t('shapes.settingsLink')} onClick={openSettings}>
            <Cog6ToothIcon data-slot="icon" />
          </Button>
          <Button plain className="!p-1.5" title={t('common.close')} onClick={close}>
            <XMarkIcon data-slot="icon" />
          </Button>
        </div>
      </div>

      <Divider soft />

      <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        <div className="shape-grid">
          {family.map((k) => (
            <button
              key={k}
              type="button"
              className={`shape-btn ${activeKind === k ? 'active' : ''}`}
              title={t(`shape.${k}` as MessageKey)}
              onClick={() => editor.updateShape({ kind: k })}
            >
              <ShapePreview
                kind={k}
                base={k === activeKind ? (shapeItem?.geo.sides ?? legacyShape?.spec.base) : undefined}
                circles={
                  isTriangle(k)
                    ? shapeItem
                      ? {
                          incircle: shapeItem.constructions?.some((c) => c.kind === 'incircle'),
                          circumcircle: shapeItem.constructions?.some((c) => c.kind === 'circumcircle')
                        }
                      : legacyShape?.spec
                    : undefined
                }
              />
            </button>
          ))}
        </div>

        {SHAPE_BASES[activeKind] && (
          <BaseRow
            kind={activeKind}
            value={(shapeItem?.geo.sides ?? legacyShape?.spec.base) ?? SHAPE_BASES[activeKind]!.def}
            onChange={(n) => editor.updateShape({ base: n })}
          />
        )}

        {shapeItem ? (
          <ShapeItemEditorControls
            item={shapeItem}
            onChange={(next) => editor.replaceShapeItem(next)}
            hideSettingsLink
          />
        ) : legacyShape ? (
          <>
            {isTriangle(legacyShape.spec.kind) && (
              <TriangleConstructionControls value={legacyShape.spec} onChange={(patch) => editor.updateShape(patch)} />
            )}
            <ShapeMeasurementControls spec={legacyShape.spec} onChange={(next) => editor.replaceShape(next)} />
            <ShapePopoverFooter spec={legacyShape.spec} onReset={(next) => editor.replaceShape(next)} hideSettingsLink />
          </>
        ) : null}
      </div>
    </div>
  )
}
