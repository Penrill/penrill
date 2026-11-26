import * as Headless from '@headlessui/react'
import { ArrowPathIcon, ArrowUturnLeftIcon, CalculatorIcon, Cog6ToothIcon, CursorArrowRaysIcon } from '@heroicons/react/20/solid'
import { Button } from '@penrill/ui/button'
import { Checkbox, CheckboxField } from '@penrill/ui/checkbox'
import { Divider } from '@penrill/ui/divider'
import { Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Switch } from '@penrill/ui/switch'
import { evaluateShape } from '@penrill/core/shapeEval'
import {
  effectiveDim3,
  effectiveQuat,
  effectiveRotMat3,
  quatFromAxisAngle,
  quatMul,
  quatNormalize,
  quatToEulerDeg,
  rotate3dMat
} from '@penrill/core/shapeEval3d'
import { shapeEdges, shapePolygonVertices } from '@penrill/core/shapes'
import type { ShapeItem, ShapeSpec, Vec3 } from '@penrill/core/types'
import {
  availableWholeShapeActions,
  toggleAllAngles,
  toggleAllLabels,
  labelVertices,
  toggleAllLengths,
  toggleConstructionBatch,
  withShapeUpdate
} from '@penrill/shape-editor/elements'
import { detectViewPreset3d, isSideViewPreset, type ViewPreset3d } from '@penrill/shape-editor/gizmo3d'
import clsx from 'clsx'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor, useSession } from '../../editorContext'
import { useT, type MessageKey } from '../../i18n'
import { usePrefs } from '../../store'
import { PanelTitle, Segmented } from '../../ui/chrome'

type SidePreset = 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left'

/** Miniature axonometric cube icon with one specific face highlighted so side views read at a glance. */
function CubeFaceIcon({ face, active }: { face: SidePreset; active?: boolean }) {
  // 8 distinct projected cube corners (no front/back corner overlap) in a 16x16 box.
  const pts = {
    t0: '3.1,5.4', t1: '9.7,6.7', t2: '13.2,4.3', t3: '6.6,3.0',
    b0: '3.1,11.8', b1: '9.7,13.1', b2: '13.2,10.7', b3: '6.6,9.4'
  }
  const facePoly: Record<SidePreset, string> = {
    top: `${pts.t0} ${pts.t1} ${pts.t2} ${pts.t3}`,
    bottom: `${pts.b0} ${pts.b1} ${pts.b2} ${pts.b3}`,
    front: `${pts.t0} ${pts.t1} ${pts.b1} ${pts.b0}`,
    back: `${pts.t3} ${pts.t2} ${pts.b2} ${pts.b3}`,
    right: `${pts.t1} ${pts.t2} ${pts.b2} ${pts.b1}`,
    left: `${pts.t3} ${pts.t0} ${pts.b0} ${pts.b3}`
  }
  const isBackSide = face === 'bottom' || face === 'back' || face === 'left'
  return (
    <svg
      data-slot="icon"
      viewBox="0 0 16 16"
      fill="none"
      className="!size-4 shrink-0"
      aria-hidden="true"
    >
      {/* Subtle hidden back edges when highlighting an interior/rear face */}
      {isBackSide && (
        <path
          d="M6.6 3.0V9.4M6.6 9.4L3.1 11.8M6.6 9.4L13.2 10.7"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="1.5 1.5"
          strokeLinecap="round"
        />
      )}
      {/* Highlighted target face */}
      <polygon
        points={facePoly[face]}
        fill="currentColor"
        fillOpacity={active ? 0.42 : 0.28}
        stroke="currentColor"
        strokeWidth={1.45}
        strokeLinejoin="round"
      />
      {/* Clean outer cube wireframe */}
      <path
        d="M3.1 5.4L6.6 3.0L13.2 4.3L13.2 10.7L9.7 13.1L3.1 11.8Z"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path
        d="M3.1 5.4L9.7 6.7L13.2 4.3M9.7 6.7V13.1"
        stroke="currentColor"
        strokeOpacity={isBackSide ? 0.35 : 0.65}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

const CUBE_VERTS: readonly Vec3[] = [
  [-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1], // bottom 0..3
  [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1] // top 4..7
]

const VIEW_CUBE_FACES: readonly { id: SidePreset; verts: readonly [number, number, number, number]; normal: Vec3 }[] = [
  { id: 'front', verts: [0, 1, 5, 4], normal: [0, 0, 1] },
  { id: 'back', verts: [2, 3, 7, 6], normal: [0, 0, -1] },
  { id: 'top', verts: [4, 5, 6, 7], normal: [0, 1, 0] },
  { id: 'bottom', verts: [3, 2, 1, 0], normal: [0, -1, 0] },
  { id: 'right', verts: [1, 2, 6, 5], normal: [1, 0, 0] },
  { id: 'left', verts: [3, 0, 4, 7], normal: [-1, 0, 0] }
]

/**
 * Live interactive 3D orientation cube synced to the selected solid's rotation.
 * Click any visible face to align straight to that side; drag anywhere on the cube to rotate in 3D.
 */
function ViewCube3d({
  item,
  activeView,
  onPickSide
}: {
  item: ShapeItem
  activeView: ViewPreset3d | null
  onPickSide: (side: SidePreset) => void
}) {
  const editor = useEditor()
  const t = useT()
  const [hovered, setHovered] = useState<SidePreset | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    prevX: number
    prevY: number
    moved: boolean
    face: SidePreset | null
    startItem: ShapeItem
    currentItem: ShapeItem
  } | null>(null)

  const mat = effectiveRotMat3(item.geo)
  const scale = 25
  const cx = 48
  const cy = 48
  const proj = CUBE_VERTS.map((v) => {
    const r = rotate3dMat(v, mat)
    return { x: cx + r[0] * scale, y: cy - r[1] * scale, z: r[2] }
  })

  const visibleFaces = VIEW_CUBE_FACES.map((f) => {
    const nr = rotate3dMat(f.normal, mat)
    const pts = f.verts.map((i) => proj[i])
    const avgX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4
    const avgY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4
    const avgZ = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4
    return {
      ...f,
      nz: nr[2],
      avgX,
      avgY,
      avgZ,
      points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    }
  })
    .filter((f) => f.nz > 0.02)
    .sort((a, b) => a.avgZ - b.avgZ)

  const onDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!e.isPrimary || e.button !== 0) return
    const faceEl = (e.target as Element | null)?.closest<SVGElement>('[data-cube-face]')
    const face = (faceEl?.dataset.cubeFace as SidePreset | undefined) ?? null
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      prevX: e.clientX,
      prevY: e.clientY,
      moved: false,
      face,
      startItem: item,
      currentItem: item
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <= 4) return
    d.moved = true
    const dx = e.clientX - d.prevX
    const dy = e.clientY - d.prevY
    d.prevX = e.clientX
    d.prevY = e.clientY
    const dist = Math.hypot(dx, dy)
    if (dist < 0.2) return
    const axis: Vec3 = [dy / dist, dx / dist, 0]
    const qNext = quatNormalize(quatMul(quatFromAxisAngle(axis, dist * 0.022), effectiveQuat(d.currentItem.geo)))
    const nextGeo = { ...d.currentItem.geo, dim3: effectiveDim3(d.currentItem.geo), rot3: qNext }
    delete nextGeo.orbit
    const next = withShapeUpdate(d.currentItem, { geo: nextGeo })
    editor.scene.replace([d.currentItem], [next], false)
    editor.setSelection([next])
    d.currentItem = next
  }

  const finishDrag = (e: ReactPointerEvent<SVGSVGElement>, cancelled = false): void => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    if (d.moved && d.currentItem !== d.startItem) {
      editor.scene.record({ added: [d.currentItem], removed: [d.startItem] })
      editor.setSelection([d.currentItem])
    } else if (!cancelled && !d.moved && d.face) {
      onPickSide(d.face)
    }
  }

  // Subtle mini X/Y/Z orientation triad in the bottom-left corner of the view box.
  const triadOrigin: [number, number] = [14, 82]
  const triadAxes: readonly { v: Vec3; color: string }[] = [
    { v: [1, 0, 0], color: '#e03131' },
    { v: [0, 1, 0], color: '#2f9e44' },
    { v: [0, 0, 1], color: '#1971c2' }
  ]

  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-zinc-950/[0.03] ring-1 ring-zinc-950/10 dark:bg-white/[0.04] dark:ring-white/10">
      <svg
        viewBox="0 0 96 96"
        className="size-24 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => finishDrag(e, false)}
        onPointerCancel={(e) => finishDrag(e, true)}
        onPointerLeave={() => setHovered(null)}
      >
        {/* Mini X/Y/Z axis triad */}
        {triadAxes.map((ax, i) => {
          const r = rotate3dMat(ax.v, mat)
          return (
            <line
              key={i}
              x1={triadOrigin[0]}
              y1={triadOrigin[1]}
              x2={triadOrigin[0] + r[0] * 10}
              y2={triadOrigin[1] - r[1] * 10}
              stroke={ax.color}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeOpacity={0.85}
            />
          )
        })}

        {visibleFaces.map((f) => {
          const isActive = activeView === f.id
          const isHot = hovered === f.id
          const label = t(`shapes.view.${f.id}` as MessageKey)
          const shortLabel = label.length > 6 ? `${label.slice(0, 5)}.` : label
          // Soft directional shading based on face facing angle so 3D form is immediately legible.
          const shadeClass = isActive
            ? 'fill-blue-600/20 stroke-blue-600 dark:fill-blue-400/25 dark:stroke-blue-400'
            : isHot
              ? 'fill-blue-500/12 stroke-blue-500/70 dark:fill-blue-400/18 dark:stroke-blue-300/80'
              : f.nz > 0.72
                ? 'fill-white stroke-zinc-400 dark:fill-zinc-700 dark:stroke-zinc-500'
                : f.nz > 0.42
                  ? 'fill-zinc-100 stroke-zinc-400 dark:fill-zinc-800 dark:stroke-zinc-500'
                  : 'fill-zinc-200/80 stroke-zinc-400 dark:fill-zinc-900/90 dark:stroke-zinc-600'
          return (
            <g
              key={f.id}
              data-cube-face={f.id}
              className="cursor-pointer"
              onPointerEnter={() => setHovered(f.id)}
              onPointerLeave={() => setHovered((cur) => (cur === f.id ? null : cur))}
            >
              <title>{label}</title>
              <polygon
                points={f.points}
                strokeWidth={isActive ? 1.8 : 1.2}
                strokeLinejoin="round"
                className={clsx('transition-colors duration-75', shadeClass)}
              />
              {f.nz > 0.34 && (
                <text
                  x={f.avgX}
                  y={f.avgY + 0.5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={clsx(
                    'pointer-events-none text-[8.5px] font-semibold select-none',
                    isActive
                      ? 'fill-blue-700 dark:fill-blue-200'
                      : 'fill-zinc-700 dark:fill-zinc-200'
                  )}
                >
                  {shortLabel}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

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
  const labelVerts = labelVertices(item)
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
                <div className="flex items-center gap-2.5">
                  <ViewCube3d
                    item={item}
                    activeView={activeView}
                    onPickSide={(side) => pickView(side)}
                  />
                  <div className="grid flex-1 grid-cols-2 gap-1.5">
                    {(['top', 'bottom', 'front', 'back', 'left', 'right'] as const satisfies readonly SidePreset[]).map((preset) =>
                      activeView === preset ? (
                        <Button key={preset} color="blue" className="!justify-start !gap-1.5 !px-2 !py-1 !text-xs" onClick={() => pickView(preset)}>
                          <CubeFaceIcon face={preset} active />
                          <span className="truncate">{t(`shapes.view.${preset}` as MessageKey)}</span>
                        </Button>
                      ) : (
                        <Button key={preset} outline className="!justify-start !gap-1.5 !px-2 !py-1 !text-xs" onClick={() => pickView(preset)}>
                          <CubeFaceIcon face={preset} />
                          <span className="truncate">{t(`shapes.view.${preset}` as MessageKey)}</span>
                        </Button>
                      )
                    )}
                  </div>
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
  onExact,
  hideSettingsLink = false
}: {
  spec?: ShapeSpec
  onReset?: (next: ShapeSpec) => void
  onOpenSettings?: () => void
  /** Shown in the shapes menu: opens "Exact shape" (a shape from typed sides and angles). */
  onExact?: () => void
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
      {onExact && (
        <Button plain className="!px-2 !py-1 !text-xs" title={t('shapes.exactHint')} onClick={onExact}>
          <CalculatorIcon data-slot="icon" />
          {t('shapes.exactLink')}
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
