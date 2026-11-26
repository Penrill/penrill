// Modular shape editor (@penrill/shape-editor + src/board/modules/shapeEditor). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '@penrill/core/scene'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
import {
  effectiveQuat,
  eulerDegToQuat,
  orbitToQuat,
  quatFromAxisAngle,
  quatMul,
  quatToEulerDeg,
  quatToMat3,
  rotate3d,
  rotate3dMat
} from '@penrill/core/shapeEval3d'
import { buildShapeItems, editableShape } from '@penrill/core/shapeItems'
import { specParts } from '@penrill/core/shapes'
import { triangleCircles } from '@penrill/core/triangleCircles'
import { triangleAngles } from '@penrill/core/triangleConstructions'
import type { ShapeItem, ShapeSpec, StrokeItem } from '@penrill/core/types'
import { formatShapeLength, shapeAnnotationsDisplay } from '@penrill/shape-editor/annotations'
import {
  applyShapeItemDefaults,
  availableEdgeActions,
  availableVertexActions,
  availableWholeShapeActions,
  canUnlockFreeVertices,
  isConstrained2dPolygon,
  isCustomizedShapeItem,
  resetShapeItemGeometry,
  resetShapeItemOrbit,
  setLabel,
  switchShapeItemKind,
  toggleAllAngles,
  toggleAllLabels,
  toggleAllLengths,
  toggleAngle,
  toggleConstruction,
  toggleConstructionBatch,
  toggleLabel,
  toggleLength,
  unlockFreeVertices
} from '@penrill/shape-editor/elements'
import {
  dragShapeHandle,
  dragShapeItemHandle,
  insertPolygonVertex,
  insertShapeItemVertex,
  isCustomizedShape,
  removePolygonVertex,
  removeShapeItemVertex,
  resetShapeGeometry,
  shapeHandles,
  shapeItemHandles,
  usesVertexHandles
} from '@penrill/shape-editor/handles'
import {
  applyViewPreset3d,
  buildGizmo3d,
  detectViewPreset3d,
  dragGizmo3dRing,
  dragTrackball3d,
  hitGizmo3dRing,
  isSideViewPreset,
  setEulerDeg3d,
  toggleAxisViewPreset3d
} from '@penrill/shape-editor/gizmo3d'
import { DEFAULT_SHAPE_DEFAULTS } from '../src/board/store.ts'
import { shapeDisplay } from '@penrill/shape-editor/shapeDisplay'
import {
  applyDefaultMeasurements,
  toggleAllAngles as toggleLegacyAllAngles,
  toggleAllLengths as toggleLegacyAllLengths,
  toggleEdgeFeature,
  toggleVertexFeature
} from '@penrill/shape-editor/targets'
import { toSvg } from '@penrill/render/display'
import { Editor } from '../src/board/editor.ts'
import { applyXform, canTurnSelection, hitTest } from '../src/board/engine/transform.ts'
import { shapeEditorModule } from '../src/board/modules/shapeEditor.ts'
import {
  beginShapeHandle,
  beginShapeItemHandle,
  hitShapeEdge,
  hitShapeHandle,
  hitShapeItemEdge,
  tryRemovePolygonVertex
} from '../src/board/modules/shapeEditor/controller.ts'
import { shapesModule } from '../src/board/modules/shapes.ts'
import { strokesModule } from '../src/board/modules/strokes.ts'
import { FeatureRegistry } from '../src/board/registry.ts'

const near = (a: number, b: number, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const baseOpts = { shift: false, ctrl: false, alt: false, snapTol: 10, gridStep: [24, 24] as const }

test('triangle vertex handles drag arbitrarily and magnetically snap to 90 deg, equilateral and isosceles', () => {
  const spec: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 100, by: 100, incircle: true, circumcircle: true }
  const handles = shapeHandles(spec)
  assert.equal(handles.length, 3)
  assert.equal(usesVertexHandles('triangle'), true)
  assert.equal(usesVertexHandles('rectangle'), false)

  // Free drag with Alt moves exactly to the target point (obtuse scalene triangle) and recomputes circles.
  const free = dragShapeHandle(spec, 'v:0', [170, 30], { ...baseOpts, alt: true })
  assert.equal(free.snapped, false)
  near(free.spec.vertices![0][0], 170)
  near(free.spec.vertices![0][1], 30)
  const parts = specParts(free.spec, 2)
  assert.equal(parts.length, 3)
  const [a, b, c] = parts[0].points
  const circles = triangleCircles(a, b, c)!
  assert.ok(circles.incircle.radius > 0 && circles.circumcircle.radius > 0)

  // Magnetic snap to 90 deg at vertex P (x = 0, perpendicular above bottom-left vertex).
  const rightAtCorner = dragShapeHandle(spec, 'v:0', [4, 20], baseOpts)
  assert.equal(rightAtCorner.snapped, true)
  assert.equal(rightAtCorner.label, '90°')
  near(rightAtCorner.spec.vertices![0][0], 0)
  const anglesRight = triangleAngles(rightAtCorner.spec.vertices![0], rightAtCorner.spec.vertices![1], rightAtCorner.spec.vertices![2])!
  assert.ok(anglesRight.some((deg) => Math.abs(deg - 90) < 1e-4))

  // Magnetic snap to 90 deg at dragged vertex V (Thales circle over base (100,100)-(0,100), centre (50,100), r=50 -> top (50,50)).
  const thales = dragShapeHandle(spec, 'v:0', [50, 54], baseOpts)
  assert.equal(thales.snapped, true)
  assert.equal(thales.label, '90°')
  const thalesAngles = triangleAngles(thales.spec.vertices![0], thales.spec.vertices![1], thales.spec.vertices![2])!
  near(thalesAngles[0], 90, 1e-3)

  // Magnetic snap to equilateral (height = 100 * sqrt(3)/2 = 86.6025 -> y = 100 - 86.6025 = 13.3975).
  const eq = dragShapeHandle(spec, 'v:0', [52, 16], baseOpts)
  assert.equal(eq.snapped, true)
  assert.equal(eq.label, '60°')
  const eqAngles = triangleAngles(eq.spec.vertices![0], eq.spec.vertices![1], eq.spec.vertices![2])!
  for (const deg of eqAngles) near(deg, 60, 1e-3)

  // Ctrl snaps to the 24-unit grid.
  const grid = dragShapeHandle(spec, 'v:0', [73, 25], { ...baseOpts, ctrl: true })
  assert.deepEqual(grid.spec.vertices![0], [72, 24])

  // Degeneracy guard prevents collapsing a vertex directly onto another vertex.
  const collapsed = dragShapeHandle(spec, 'v:0', [0, 100], { ...baseOpts, alt: true })
  assert.ok(Math.hypot(collapsed.spec.vertices![0][0] - 0, collapsed.spec.vertices![0][1] - 100) >= 7)
})

test('arbitrary polygons support vertex dragging, edge-midpoint insertion and double-click deletion', () => {
  const spec: ShapeSpec = { kind: 'polygon', ax: 0, ay: 0, bx: 120, by: 120, base: 4 }
  const handles = shapeHandles(spec)
  assert.equal(handles.filter((h) => h.kind === 'vertex').length, 4)
  assert.equal(handles.filter((h) => h.kind === 'addVertex').length, 4)

  const inserted = insertPolygonVertex(spec, 0, [60, -20])!
  assert.equal(inserted.vertexIndex, 1)
  assert.equal(inserted.spec.vertices!.length, 5)
  assert.equal(inserted.spec.base, 5)
  assert.equal(isCustomizedShape(inserted.spec), true)

  const removed = removePolygonVertex(inserted.spec, 1)!
  assert.equal(removed.vertices!.length, 4)
  const tri = removePolygonVertex(removed, 0)!
  assert.equal(tri.vertices!.length, 3)
  // Cannot drop below 3 vertices.
  assert.equal(removePolygonVertex(tri, 0), null)

  const reset = resetShapeGeometry(inserted.spec)
  assert.equal(isCustomizedShape(reset), false)
  assert.equal(reset.vertices, undefined)
})

test('2D and 3D parameter handles edit slant, trapezoid corners, star depth, apex and perspective, even when rotated', () => {
  // Parallelogram slant goes both right and left smoothly.
  const para: ShapeSpec = { kind: 'parallelogram', ax: 0, ay: 0, bx: 200, by: 100 }
  assert.equal(shapeHandles(para).length, 1)
  const tilted = dragShapeHandle(para, 'skew', [50, 0], { ...baseOpts, alt: true })
  assert.ok(tilted.spec.skew! < 0)
  const straightened = dragShapeHandle(para, 'skew', [102, 0], baseOpts)
  near(straightened.spec.skew!, 0)

  // Trapezoid corners edit independently, and symmetrically with Shift.
  const trap: ShapeSpec = { kind: 'trapezoid', ax: 0, ay: 0, bx: 200, by: 100 }
  const asym = dragShapeHandle(trap, 'topLeft', [0, 0], { ...baseOpts, alt: true })
  near(asym.spec.topLeft!, 0)
  near(asym.spec.topRight!, 0.22)
  const sym = dragShapeHandle(trap, 'topLeft', [40, 0], { ...baseOpts, shift: true, alt: true })
  near(sym.spec.topLeft!, 0.2)
  near(sym.spec.topRight!, 0.2)

  // Star inner depth handle.
  const star: ShapeSpec = { kind: 'star', ax: 0, ay: 0, bx: 200, by: 200, base: 6 }
  const starRes = dragShapeHandle(star, 'inner', [140, 60], { ...baseOpts, alt: true })
  assert.ok(starRes.spec.innerRatio! >= 0.15 && starRes.spec.innerRatio! <= 0.9)

  // Pyramid, cone, prism, cylinder free apex and depth handles (including on a rotated pyramid).
  const pyr: ShapeSpec = { kind: 'pyramid', ax: 0, ay: 0, bx: 200, by: 160, base: 5, rot: Math.PI / 2 }
  const pyrHandles = shapeHandles(pyr)
  assert.deepEqual(pyrHandles.map((h) => h.id), ['apex', 'depth'])
  const draggedApex = dragShapeHandle(pyr, 'apex', [180, 140], { ...baseOpts, alt: true })
  assert.ok(draggedApex.spec.apex)
  assert.ok(specParts(draggedApex.spec, 2).flatMap((p) => p.points.flat()).every(Number.isFinite))

  for (const kind of ['cone', 'prism', 'cylinder'] as const) {
    const solid: ShapeSpec = { kind, ax: 0, ay: 0, bx: 180, by: 140 }
    const moved = dragShapeHandle(solid, 'apex', [210, -20], { ...baseOpts, alt: true })
    assert.ok(moved.spec.apex![0] > 1)
    const parts = specParts(moved.spec, 2)
    assert.ok(parts.length >= 2)
    assert.ok(parts.flatMap((p) => p.points.flat()).every(Number.isFinite))
  }

  // Cube and sphere depth handles.
  const cube = dragShapeHandle({ kind: 'cube', ax: 0, ay: 0, bx: 100, by: 100 }, 'depth', [42, 0], { ...baseOpts, alt: true })
  near(cube.spec.depth!, 0.42)
  const sphere = dragShapeHandle({ kind: 'sphere', ax: 0, ay: 0, bx: 100, by: 100 }, 'depth', [50, 70], { ...baseOpts, alt: true })
  near(sphere.spec.depth!, 0.4)
})

test('headless shape-editor controller edits vertices, inserts on edge midpoints and deletes with single undo steps', () => {
  const editor = new Editor([strokesModule, shapeEditorModule])
  try {
    const feature = editor.features.shapeEditor!
    const spec: ShapeSpec = { kind: 'polygon', ax: 0, ay: 0, bx: 100, by: 100, base: 4 }
    const items = buildShapeItems(spec, { color: '#000', size: 2, tool: 'pen' }, (i) => ({ id: `poly${i}`, z: i }))
    editor.scene.add(items)
    editor.setSelection(items)

    const handles = feature.handles(spec)
    const addHandle = handles.find((h) => h.id === 'add:0')!
    const sx = (addHandle.x - editor.camera.x) * editor.camera.zoom
    const sy = (addHandle.y - editor.camera.y) * editor.camera.zoom
    assert.equal(hitShapeHandle(handles, sx, sy, editor.camera, 0)?.id, 'add:0')

    // Press midpoint '+' and drag: inserts a 5th vertex and positions it in one undo step.
    const gesture = beginShapeHandle(feature, editor, editableShape(editor.selectedItems())!, addHandle, [addHandle.x, addHandle.y])
    gesture.move([50, -30], { shift: false, ctrl: false, alt: true }, [24, 24])
    gesture.end()

    const afterInsert = editableShape(editor.selectedItems())!
    assert.equal(afterInsert.spec.vertices!.length, 5)
    near(afterInsert.spec.vertices![1][1], -30)

    editor.undo()
    assert.equal(editableShape(editor.selectedItems())!.spec.vertices, undefined)
    editor.redo()
    assert.equal(editableShape(editor.selectedItems())!.spec.vertices!.length, 5)

    // Double-click removes the inserted vertex cleanly as one undo step.
    const v1 = feature.handles(editableShape(editor.selectedItems())!.spec).find((h) => h.id === 'v:1')!
    assert.equal(tryRemovePolygonVertex(feature, editor, editableShape(editor.selectedItems())!, v1), true)
    assert.equal(editableShape(editor.selectedItems())!.spec.vertices!.length, 4)
    editor.undo()
    assert.equal(editableShape(editor.selectedItems())!.spec.vertices!.length, 5)
  } finally {
    editor.dispose()
  }
})

test('dragging a triangle vertex with per-vertex constructions updates all parts and undoes in one step; tapping does not move it', () => {
  const scene = new Scene()
  const spec: ShapeSpec = {
    kind: 'triangle',
    ax: 0,
    ay: 0,
    bx: 120,
    by: 100,
    incircle: true,
    altitudeAt: [0],
    medianAt: [1],
    bisectorAt: [2],
    angleAt: [0, 1],
    lengthAt: [0]
  }
  const parts = buildShapeItems(spec, { color: '#1971c2', size: 2, tool: 'pen' }, (i) => ({ id: `t${i}`, z: scene.allocZ() }))
  scene.add(parts)
  let selected: StrokeItem[] = parts
  const host = { scene, camera: { x: 0, y: 0, zoom: 1 }, setSelection: (it: StrokeItem[]) => { selected = it } }
  const feature = shapeEditorModule.shapeEditor!
  const v0 = feature.handles(spec)[0]

  // A tiny tap (<= 4px) returns false from end() so Board opens the vertex popover without changing the scene.
  const verBeforeTap = scene.version
  const tap = beginShapeHandle(feature, host as never, editableShape(selected)!, v0, [v0.x, v0.y])
  tap.move([v0.x + 2, v0.y + 1], { shift: false, ctrl: false, alt: false }, [24, 24])
  assert.equal(tap.end(), false)
  assert.equal(scene.version, verBeforeTap)

  // A real drag moves the vertex and records one undo step.
  const drag = beginShapeHandle(feature, host as never, editableShape(selected)!, v0, [v0.x, v0.y])
  drag.move([2, 0], { shift: false, ctrl: false, alt: false }, [24, 24])
  assert.equal(drag.end(), true)
  assert.ok(editableShape(selected))
  scene.undo()
  assert.deepEqual(scene.getItems(), parts)
})

test('per-vertex and per-edge toggles stay in sync, remap on polygon edits and render vector annotations', () => {
  const tri: ShapeSpec = { kind: 'triangle', ax: 0, ay: 0, bx: 144, by: 96 }
  // Edge 1 connects vertex 1 -> 2, opposite vertex 0.
  const withAltFromEdge = toggleEdgeFeature(tri, 1, 'altitude')
  assert.deepEqual(withAltFromEdge.altitudeAt, [0])
  // Toggling vertex 0 altitude again turns it back off.
  assert.equal(toggleVertexFeature(withAltFromEdge, 0, 'altitude').altitudeAt, undefined)

  const withLenAndAng = toggleVertexFeature(toggleEdgeFeature(tri, 0, 'length'), 0, 'angle')
  assert.deepEqual(withLenAndAng.lengthAt, [0])
  assert.deepEqual(withLenAndAng.angleAt, [0])

  // Edge hit-testing finds edge 0 near its midpoint, ignoring zones right on vertices.
  const edgeHit = hitShapeEdge(tri, 108, 48, 1)
  assert.equal(edgeHit?.index, 0)
  assert.equal(hitShapeEdge(tri, 72, 0, 1), null)

  // Defaults are off unless opted in.
  assert.equal(applyDefaultMeasurements(tri, { showAngles: false, showLengths: false }).angleAt, undefined)
  const withDefs = applyDefaultMeasurements(tri, { showAngles: true, showLengths: true })
  assert.deepEqual(withDefs.angleAt, [0, 1, 2])
  assert.deepEqual(withDefs.lengthAt, [0, 1, 2])
  assert.equal(toggleLegacyAllAngles(withDefs, false).angleAt, undefined)
  assert.equal(toggleLegacyAllLengths(withDefs, false).lengthAt, undefined)

  // Polygon insert/remove remaps angleAt and lengthAt indices cleanly.
  const poly: ShapeSpec = { kind: 'polygon', ax: 0, ay: 0, bx: 100, by: 100, base: 4, angleAt: [0, 2], lengthAt: [2] }
  const ins = insertPolygonVertex(poly, 0, [50, -20])!
  assert.deepEqual(ins.spec.angleAt, [0, 3])
  assert.deepEqual(ins.spec.lengthAt, [3])
  const rem = removePolygonVertex(ins.spec, 1)!
  assert.deepEqual(rem.angleAt, [0, 2])
  assert.deepEqual(rem.lengthAt, [2])

  // Vector display list & SVG annotations (both cm and cells, English dot & Ukrainian comma).
  assert.equal(formatShapeLength(96, { unit: 'cm', unitLabel: 'cm', comma: false }), '2 cm')
  assert.equal(formatShapeLength(72, { unit: 'cm', unitLabel: 'см', comma: true }), '1,5 см')
  assert.equal(formatShapeLength(72, { unit: 'cells', unitLabel: 'кл.', comma: true }), '3 кл.')

  const rightTri: ShapeSpec = {
    kind: 'rightTriangle',
    ax: 0,
    ay: 0,
    bx: 96,
    by: 144,
    angleAt: [0, 1, 2],
    lengthAt: [0, 1, 2]
  }
  const prim = shapeAnnotationsDisplay(rightTri, '#1e1e1e', 2, { unit: 'cm', unitLabel: 'cm', comma: false })!
  const svg = toSvg(prim, (c) => (c === '@paper' ? '#fff' : c))
  assert.match(svg, /90°/)
  assert.match(svg, /3 cm/)
  assert.match(svg, /2 cm/)

  // Registry draws annotations once (only on primary outline stroke, not on auxiliary circle strokes).
  const reg = new FeatureRegistry([strokesModule, shapeEditorModule])
  const items = buildShapeItems({ ...rightTri, incircle: true }, { color: '#1e1e1e', size: 2, tool: 'pen' }, (i) => ({ id: `a${i}`, z: i }))
  assert.match(reg.svg(items[0]), /90°/)
  assert.doesNotMatch(reg.svg(items[1]), /90°/)

  // Circle shows radius r = ..., oval shows w x h.
  const circlePrim = shapeAnnotationsDisplay({ kind: 'ellipse', ax: 0, ay: 0, bx: 96, by: 96, lengthAt: [0] }, '#000', 2, { unit: 'cm', unitLabel: 'cm', comma: false })!
  assert.match(toSvg(circlePrim, (c) => c), /r = 1 cm/)
  const ovalPrim = shapeAnnotationsDisplay({ kind: 'ellipse', ax: 0, ay: 0, bx: 144, by: 96, lengthAt: [0] }, '#000', 2, { unit: 'cm', unitLabel: 'cm', comma: false })!
  assert.match(toSvg(ovalPrim, (c) => c), /3 cm × 2 cm/)
})

test('2D constrained rhombus, rectangle, parallelogram and trapezoid expose vertices, preserve geometry and unlock to free polygons', () => {
  const mk = (spec: ShapeSpec): ShapeItem =>
    createShapeItem(specToShapeData(spec), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: `sh-${spec.kind}`, z: 1 })

  // Rhombus exposes 4 draggable vertices; dragging top vertex keeps 4 equal sides and updates acute/obtuse angles.
  let rh = mk({ kind: 'rhombus', ax: 0, ay: 0, bx: 120, by: 80 })
  assert.equal(isConstrained2dPolygon(rh.geo), true)
  const rhHandles = shapeItemHandles(rh)
  assert.deepEqual(rhHandles.map((h) => h.id), ['v0', 'v1', 'v2', 'v3'])

  // Drag v0 to snap into a 90 deg square (halfH === halfW = 60 -> ay = 40 - 60 = -20, by = 100).
  const rhSq = dragShapeItemHandle(rh, 'v0', [60, -18], baseOpts, { startWorld: [60, 0], startGeo: rh.geo })
  assert.equal(rhSq.snapped, true)
  assert.equal(rhSq.label, '90°')
  const evSq = evaluateShape(rhSq.item)
  for (const e of evSq.edges) near(e.length, evSq.edges[0].length, 1e-4)
  for (const v of evSq.vertices) near(v.angleDeg!, 90, 1e-3)

  // Add labels, angles, lengths and diagonals, then unlock into a free polygon keeping everything intact!
  rh = toggleAllLabels(rh, true)
  rh = toggleAngle(rh, 'v0')
  rh = toggleLength(rh, 'e0')
  const wholeRh = availableWholeShapeActions(rh)
  rh = toggleConstructionBatch(rh, wholeRh.find((a) => a.id === 'diagonals')!.constructions)
  const unlocked = unlockFreeVertices(rh)
  assert.equal(unlocked.geo.kind, 'polygon')
  assert.equal(unlocked.geo.vertices?.length, 4)
  assert.equal(isConstrained2dPolygon(unlocked.geo), false)
  assert.deepEqual(unlocked.labels, { v0: 'A', v1: 'B', v2: 'C', v3: 'D' })
  assert.deepEqual(unlocked.angles, ['v0'])
  assert.deepEqual(unlocked.lengths, ['e0'])
  assert.equal(unlocked.constructions?.length, 2)
  // Now vertex v0 moves freely to any arbitrary point!
  const freeDrag = dragShapeItemHandle(unlocked, 'v0', [150, -35], { ...baseOpts, alt: true })
  near(freeDrag.item.geo.vertices![0][0], 150)
  near(freeDrag.item.geo.vertices![0][1], -35)

  // Rectangle corner drag keeps opposite corner pinned and snaps to square with Shift.
  const rect = mk({ kind: 'rectangle', ax: 10, ay: 20, bx: 110, by: 70 })
  const rectDrag = dragShapeItemHandle(rect, 'v2', [160, 100], { ...baseOpts, shift: true }, { startWorld: [110, 70], startGeo: rect.geo })
  const evRect = evaluateShape(rectDrag.item)
  near(evRect.vertices[0].pos[0], 10, 1e-3)
  near(evRect.vertices[0].pos[1], 20, 1e-3)
  near(evRect.edges[0].length, evRect.edges[1].length, 1e-3)

  // Trapezoid exposes 4 vertices and supports midline + altitude constructions.
  let trap = mk({ kind: 'trapezoid', ax: 0, ay: 0, bx: 200, by: 100 })
  assert.equal(shapeItemHandles(trap).length, 4)
  const trapDrag = dragShapeItemHandle(trap, 'v0', [0, 10], { ...baseOpts, alt: true }, { startWorld: [44, 0], startGeo: trap.geo })
  near(trapDrag.item.geo.topLeft!, 0)
  const trapEdgeActs = availableEdgeActions(trap, 'e1')!
  assert.ok(trapEdgeActs.constructions.some((c) => c.construction.kind === 'midline'))
  trap = toggleConstruction(trap, trapEdgeActs.constructions.find((c) => c.construction.kind === 'midline')!.construction)
  const evTrap = evaluateShape(trap)
  assert.equal(evTrap.constructions.length, 1)
  assert.ok(evTrap.constructions[0].length! > 100)
})

test('real 3D engine supports 3D orbit back-face culling, independent box dimensions, pyramid height/apothem and axial sections', () => {
  const mk = (spec: ShapeSpec): ShapeItem =>
    createShapeItem(specToShapeData(spec), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: `3d-${spec.kind}`, z: 1 })

  // Cube: 8 vertices, 12 edges, 3 hidden edges by default; orbiting 180 deg flips which edges are hidden!
  const cube = mk({ kind: 'cube', ax: 0, ay: 0, bx: 150, by: 150 })
  const evCube0 = evaluateShape(cube)
  assert.equal(evCube0.vertices.length, 8)
  assert.equal(evCube0.edges.length, 12)
  const hidden0 = evCube0.edges.filter((e) => e.hidden).map((e) => e.id).sort()
  assert.equal(hidden0.length, 3)

  const orbitH = shapeItemHandles(cube).find((h) => h.kind === 'orbit')!
  assert.ok(orbitH)
  const orbited = dragShapeItemHandle(
    cube,
    'orbit',
    [orbitH.x + 260, orbitH.y - 80],
    { ...baseOpts, alt: true },
    { startWorld: [orbitH.x, orbitH.y], startGeo: cube.geo }
  )
  assert.equal(isCustomizedShapeItem(orbited.item), true)
  const hidden1 = evaluateShape(orbited.item).edges.filter((e) => e.hidden).map((e) => e.id).sort()
  assert.notDeepEqual(hidden1, hidden0, 'rotating in 3D changes which back edges are dashed')

  // Independent 3D cuboid dimensions (dimX stretches width without changing height or depth; true 3D lengths reflect it).
  const dimX = shapeItemHandles(cube).find((h) => h.id === 'dimX')!
  const stretched = dragShapeItemHandle(
    cube,
    'dimX',
    [dimX.x + 40, dimX.y],
    { ...baseOpts, alt: true },
    { startWorld: [dimX.x, dimX.y], startGeo: cube.geo }
  )
  assert.ok(stretched.item.geo.dim3![0] > cube.geo.dim3![0] + 20)
  near(stretched.item.geo.dim3![1], cube.geo.dim3![1])
  near(stretched.item.geo.dim3![2], cube.geo.dim3![2])
  const eb0 = evaluateShape(stretched.item).edges.find((e) => e.id === 'eb0')!
  near(eb0.length, stretched.item.geo.dim3![0], 1e-3)

  // Reset restores canonical cube proportions and default orbit.
  const resetCube = resetShapeItemGeometry(orbited.item)
  assert.equal(isCustomizedShapeItem(resetCube), false)

  // Pyramid: height SO + apothem on base edge + apex vertex drag + SVG output with labels & lengths.
  let pyr = mk({ kind: 'pyramid', ax: 0, ay: 0, bx: 160, by: 160, base: 4 })
  const apexActs = availableVertexActions(pyr, 'apex')!
  assert.ok(apexActs.constructions.some((c) => c.construction.kind === 'altitude'))
  pyr = toggleConstruction(pyr, apexActs.constructions.find((c) => c.construction.kind === 'altitude')!.construction)
  const baseEdgeActs = availableEdgeActions(pyr, 'eb0')!
  assert.ok(baseEdgeActs.constructions.some((c) => c.construction.kind === 'apothem'))
  pyr = toggleConstruction(pyr, baseEdgeActs.constructions.find((c) => c.construction.kind === 'apothem')!.construction)
  pyr = setLabel(toggleLabel(pyr, 'apex'), 'apex', 'S')
  pyr = toggleLength(pyr, 'eb0')
  const pyrSvg = toSvg(shapeDisplay(pyr, { unit: 'cm', unitLabel: 'cm', comma: false }), (c) => (c === '@paper' ? '#fff' : c))
  assert.match(pyrSvg, />S<\/text>/)
  assert.match(pyrSvg, /cm<\/text>/)
  assert.match(pyrSvg, /stroke-dasharray/)

  // Cylinder, cone and sphere constructions (axial cross-section fill, meridian).
  let cone = mk({ kind: 'cone', ax: 0, ay: 0, bx: 160, by: 160 })
  cone = toggleConstruction(cone, { id: 'section', kind: 'section' })
  assert.equal(evaluateShape(cone).constructions[0].fills?.length, 1)
  assert.match(toSvg(shapeDisplay(cone, { unit: 'cm', unitLabel: 'cm', comma: false }), (c) => c), /fill-opacity/)

  let sphere = mk({ kind: 'sphere', ax: 0, ay: 0, bx: 140, by: 140 })
  sphere = toggleConstruction(sphere, { id: 'meridian', kind: 'meridian' })
  sphere = toggleConstruction(sphere, { id: 'radius', kind: 'radius' })
  assert.equal(evaluateShape(sphere).constructions.length, 2)
})

test('first-class ShapeItem works with defaults, polygon vertex insert/remove, hitTest, transforms and headless controller', () => {
  const editor = new Editor([strokesModule, shapesModule, shapeEditorModule])
  try {
    const feature = editor.features.shapeEditor!
    const raw = createShapeItem(specToShapeData({ kind: 'polygon', ax: 0, ay: 0, bx: 120, by: 120, base: 4 }), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: 'p1', z: 1 })
    // Defaults stay OFF unless enabled.
    const defOff = applyShapeItemDefaults(raw, { showLabels: false, showAngles: false, showLengths: false })
    assert.equal(defOff.labels, undefined)
    assert.equal(defOff.angles, undefined)
    assert.equal(defOff.lengths, undefined)
    const defOn = applyShapeItemDefaults(raw, { showLabels: true, showAngles: true, showLengths: true })
    assert.equal(Object.keys(defOn.labels!).length, 4)
    assert.equal(defOn.angles!.length, 4)
    assert.equal(defOn.lengths!.length, 4)

    // Polygon insert and remove keep labels/angles/lengths aligned.
    const ins = insertShapeItemVertex(defOn, 0, [60, -20])!
    assert.equal(ins.item.geo.vertices!.length, 5)
    assert.equal(ins.item.labels!.v2, 'B')
    const rem = removeShapeItemVertex(ins.item, ins.vertexId)!
    assert.equal(rem.geo.vertices!.length, 4)

    // Transform, hitTest and canTurnSelection work cleanly on ShapeItem.
    const turned = applyXform(raw, { s: 1, ax: 60, ay: 60, dx: 20, dy: 10, r: Math.PI / 4 }) as ShapeItem
    near(turned.rot!, Math.PI / 4)
    assert.equal(canTurnSelection([turned]), true)
    // Cube uses 3D orbit handle instead of 2D turn handle when selected alone.
    const cube = createShapeItem(specToShapeData({ kind: 'cube', ax: 0, ay: 0, bx: 120, by: 120 }), { color: '#000', size: 2, tool: 'pen' }, { id: 'c1', z: 2 })
    assert.equal(canTurnSelection([cube]), false)
    // hitTest hits an edge of a rectangle and misses its empty interior.
    const rect = createShapeItem(specToShapeData({ kind: 'rectangle', ax: 0, ay: 0, bx: 120, by: 120 }), { color: '#000', size: 2, tool: 'pen' }, { id: 'r1', z: 3 })
    assert.equal(hitTest([rect], 60, 60, 4), null)
    assert.equal(hitTest([rect], 60, 0, 4)?.id, 'r1')
    assert.equal(hitShapeItemEdge(rect, 60, 0, 1)?.id, 'e0')

    // Headless controller: tapping a cube corner (<= 4px) does not mutate scene; dragging reshapes in one undo step!
    editor.scene.add([cube])
    editor.setSelection([cube])
    const b0 = feature.itemHandles(cube).find((h) => h.id === 'b0')!
    const verBefore = editor.scene.version
    const tap = beginShapeItemHandle(feature, editor, cube, b0, [b0.x, b0.y])
    tap.move([b0.x + 2, b0.y + 2], { shift: false, ctrl: false, alt: false }, [24, 24])
    assert.equal(tap.end(), false)
    assert.equal(editor.scene.version, verBefore)

    const orb = feature.itemHandles(cube).find((h) => h.id === 'orbit')!
    const g = beginShapeItemHandle(feature, editor, cube, orb, [orb.x, orb.y])
    g.move([orb.x + 80, orb.y + 30], { shift: false, ctrl: false, alt: true }, [24, 24])
    assert.equal(g.end(), true)
    assert.notDeepEqual((editor.selectedItems()[0] as ShapeItem).geo.orbit, cube.geo.orbit)
    editor.undo()
    assert.deepEqual((editor.selectedItems()[0] as ShapeItem).geo.orbit, cube.geo.orbit)
  } finally {
    editor.dispose()
  }
})

test('optional Blender-style 3-axis 3D rotation gizmo: quaternion equivalence, X/Y/Z/Roll rings, Trackball, presets and edge-on solids', () => {
  // 1. Exact equivalence between orbitToQuat + rotate3dMat and legacy R_x(pitch)*R_y(yaw).
  const vectors: [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [12.5, -7.25, 4.1],
    [-3.3, 8.8, -9.9]
  ]
  for (const [yaw, pitch] of [[-0.52, 0.36], [1.1, -0.7], [-2.4, 1.2], [0, 0]] as const) {
    const m = quatToMat3(orbitToQuat(yaw, pitch))
    for (const v of vectors) {
      const a = rotate3d(v, yaw, pitch)
      const b = rotate3dMat(v, m)
      near(a[0], b[0], 1e-11)
      near(a[1], b[1], 1e-11)
      near(a[2], b[2], 1e-11)
    }
  }

  // 2. Composing 3-axis rotations (X -> Y -> Z) stays unit-normalized with zero gimbal lock and flips cube back faces cleanly.
  const mk = (kind: ShapeSpec['kind']): ShapeItem =>
    createShapeItem(specToShapeData({ kind, ax: 0, ay: 0, bx: 140, by: 140 }), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: `g-${kind}`, z: 1 })
  const cube = mk('cube')
  const q180x = quatFromAxisAngle([1, 0, 0], Math.PI)
  const flipped: ShapeItem = { ...cube, geo: { ...cube.geo, rot3: q180x } }
  const evFlipped = evaluateShape(flipped)
  // Upside-down cube still has exact 3D edge lengths and valid visibility.
  assert.equal(evFlipped.edges.length, 12)
  near(evFlipped.edges[0].length, cube.geo.dim3![0], 1e-6)
  assert.equal(isCustomizedShapeItem(flipped), true)

  // 3. buildGizmo3d produces 4 rings (X, Y, Z, View Roll) and hitGizmo3dRing hits a front ring point while missing center interior.
  const cam = { x: 0, y: 0, zoom: 1 }
  const gizmoLocal = buildGizmo3d(cube, 1, 'local')!
  assert.equal(gizmoLocal.rings.length, 4)
  assert.deepEqual(gizmoLocal.rings.map((r) => r.id), ['rotX', 'rotY', 'rotZ', 'rotView'])
  assert.equal(hitGizmo3dRing(gizmoLocal, gizmoLocal.center[0], gizmoLocal.center[1], cam, 0), null, 'interior stays free for clicks/drag')
  const xRing = gizmoLocal.rings.find((r) => r.id === 'rotX')!
  const samplePt = xRing.frontPts[0][Math.floor(xRing.frontPts[0].length / 2)]
  const ringHit = hitGizmo3dRing(gizmoLocal, samplePt[0], samplePt[1], cam, 0)
  assert.ok(ringHit)
  assert.equal(ringHit.ring.id, 'rotX')

  // 4. Dragging rotView (outer ring) by 90 deg with Shift produces exact 90 deg roll & sweep sector polygon.
  const startRollPt: [number, number] = [gizmoLocal.center[0] + gizmoLocal.outerRadius, gizmoLocal.center[1]]
  const endRollPt: [number, number] = [gizmoLocal.center[0], gizmoLocal.center[1] + gizmoLocal.outerRadius]
  const rolled = dragGizmo3dRing(
    cube,
    'rotView',
    endRollPt,
    { ...baseOpts, shift: true },
    { startWorld: startRollPt, startGeo: cube.geo, gizmoSpace: 'local' }
  )
  assert.ok(rolled.item.geo.rot3)
  near(Math.hypot(...rolled.item.geo.rot3!), 1, 1e-9)
  assert.equal(rolled.gizmoArc?.id, 'rotView')
  assert.equal(rolled.gizmoArc?.deltaDeg, -90)
  assert.equal(rolled.label, 'Roll: -90°')

  // 5. Local vs World space produce distinct rotations on an already-tilted solid.
  const tilted: ShapeItem = {
    ...cube,
    geo: { ...cube.geo, rot3: quatMul(orbitToQuat(-0.52, 0.36), quatFromAxisAngle([1, 0, 0], Math.PI / 3)) }
  }
  const p0: [number, number] = [70 + 80, 70]
  const p1: [number, number] = [70 + 40, 70 + 70]
  const localDrag = dragGizmo3dRing(tilted, 'rotY', p1, { ...baseOpts, alt: true }, { startWorld: p0, startGeo: tilted.geo, gizmoSpace: 'local' })
  const worldDrag = dragGizmo3dRing(tilted, 'rotY', p1, { ...baseOpts, alt: true }, { startWorld: p0, startGeo: tilted.geo, gizmoSpace: 'world' })
  assert.notDeepEqual(localDrag.item.geo.rot3, worldDrag.item.geo.rot3)

  // 6. Dragging dimX on a quaternion-rotated cube preserves rot3 instead of snapping back to default orbit.
  const dimX = shapeItemHandles(tilted).find((h) => h.id === 'dimX')!
  const resizedTilted = dragShapeItemHandle(
    tilted,
    'dimX',
    [dimX.x + 30, dimX.y],
    { ...baseOpts, alt: true },
    { startWorld: [dimX.x, dimX.y], startGeo: tilted.geo }
  )
  assert.deepEqual(resizedTilted.item.geo.rot3, tilted.geo.rot3)

  // 7. Free 3D Trackball drag via orbit handle with free3d=true updates rot3 cleanly without pitch clamp.
  const orb = shapeItemHandles(cube).find((h) => h.id === 'orbit')!
  const tb = dragTrackball3d(
    cube,
    [orb.x + 90, orb.y + 180],
    { ...baseOpts, alt: true },
    { startWorld: [orb.x, orb.y], startGeo: cube.geo, prevWorld: [orb.x, orb.y], prevGeo: cube.geo, free3d: true }
  )
  assert.ok(tb.item.geo.rot3)
  near(Math.hypot(...tb.item.geo.rot3!), 1, 1e-9)

  // 8. View presets (axon, iso, front, back, top, bottom, right, left) & resetShapeItemOrbit preserve dim3 while snapping orientation.
  const topCube = applyViewPreset3d(resizedTilted.item, 'top')
  assert.ok(topCube.geo.rot3)
  assert.deepEqual(topCube.geo.dim3, resizedTilted.item.geo.dim3)
  const resetAng = resetShapeItemOrbit(topCube)
  assert.equal(resetAng.geo.rot3, undefined)
  assert.deepEqual(resetAng.geo.dim3, resizedTilted.item.geo.dim3)

  // 9. Head-on cylinder (Top view) and edge-on rolled cone evaluate cleanly with finite geometry and zero NaNs across all 8 presets.
  for (const kind of ['cylinder', 'cone', 'sphere'] as const) {
    const solid = mk(kind)
    for (const preset of ['axon', 'iso', 'front', 'back', 'top', 'bottom', 'right', 'left'] as const) {
      const ev = evaluateShape(applyViewPreset3d(solid, preset))
      assert.ok(Number.isFinite(ev.bounds.minX) && Number.isFinite(ev.bounds.maxY))
      for (const path of ev.hitPaths) {
        for (const [x, y] of path) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `${kind} ${preset} produced non-finite coordinate`)
        }
      }
    }
  }
})

test('3D gizmo defaults ON, Euler X/Y/Z° round-trips, 3D geometric vertex angles render, and all 3D vertices drag smoothly', () => {
  // 1. 3D rotation gizmo is enabled by default.
  assert.equal(DEFAULT_SHAPE_DEFAULTS.gizmo3d, true)

  // 2. Euler X/Y/Z° <-> Quaternion round-trip across textbook axonometry, presets and arbitrary 3-axis orientations.
  for (const [x, y, z] of [[21, -30, 0], [0, 0, 0], [90, 0, 0], [0, -90, 0], [35, 60, -45], [-40, 125, 20]] as const) {
    const q = eulerDegToQuat(x, y, z)
    const back = quatToEulerDeg(q)
    const m1 = quatToMat3(q)
    const m2 = quatToMat3(eulerDegToQuat(back[0], back[1], back[2]))
    for (let i = 0; i < 9; i++) near(m1[i], m2[i], 1e-2)
  }

  const mk = (kind: ShapeSpec['kind'], base?: number): ShapeItem =>
    createShapeItem(specToShapeData({ kind, ax: 0, ay: 0, bx: 160, by: 160, ...(base ? { base } : {}) }), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: `3dv-${kind}`, z: 1 })

  // 3. setEulerDeg3d + buildGizmo3d.eulerDeg match cleanly.
  const cube = mk('cube')
  const customAng = setEulerDeg3d(cube, [45, -60, 15])
  assert.deepEqual(quatToEulerDeg(effectiveQuat(customAng.geo)), [45, -60, 15])
  assert.deepEqual(buildGizmo3d(customAng, 1, 'local')!.eulerDeg, [45, -60, 15])

  // 4. Geometric 3D vertex angles on cube (90 deg), prism (60 deg / 108 deg), pyramid (base + apex), cone (apex opening).
  const evCube = evaluateShape(cube)
  assert.equal(evCube.vertices.every((v) => v.angleDeg === 90 && v.angle3d?.markPts.length === 3), true)
  const cubeWithAngles = toggleAllAngles(cube, true)
  assert.equal(cubeWithAngles.angles?.length, 8)
  const cubeSvg = toSvg(shapeDisplay(cubeWithAngles, { unit: 'cm', unitLabel: 'cm', comma: false }), (c) => (c === '@paper' ? '#fff' : c))
  assert.match(cubeSvg, />90°<\/text>/)
  assert.equal(availableVertexActions(cube, 'b0')?.hasAngle, true)

  const triPrism = mk('prism', 3)
  near(evaluateShape(triPrism).vertices[0].angleDeg!, 60, 1e-3)
  const pentPrism = mk('prism', 5)
  near(evaluateShape(pentPrism).vertices[0].angleDeg!, 108, 1e-3)

  const pyr = mk('pyramid', 4)
  const evPyr = evaluateShape(pyr)
  near(evPyr.vertices[0].angleDeg!, 90, 1e-3)
  const pyrApex = evPyr.vertices.find((v) => v.id === 'apex')!
  assert.ok(pyrApex.angleDeg! > 10 && pyrApex.angleDeg! < 120)
  assert.ok(pyrApex.angle3d!.markPts.length >= 2)

  const cone = mk('cone')
  const coneApex = evaluateShape(cone).vertices.find((v) => v.id === 'apex')!
  assert.ok(coneApex.angleDeg! > 10 && coneApex.angleDeg! < 140)
  assert.equal(availableVertexActions(cone, 'apex')?.hasAngle, true)

  // 5. All 3D vertex handles are draggable on every 3D solid, and dragging keeps opposite corner/base pinned!
  for (const kind of ['cube', 'prism', 'pyramid', 'obliquePyramid', 'cylinder', 'cone', 'sphere'] as const) {
    const s = mk(kind)
    const vertHandles = shapeItemHandles(s).filter((h) => h.kind === 'vertex')
    assert.ok(vertHandles.length >= 3, `${kind} exposes draggable vertex handles`)
    assert.ok(vertHandles.every((h) => h.draggable === true), `${kind} vertices are all draggable`)
  }

  // Cube corner constrained drag (without Alt) stretches dimensions while keeping diagonally opposite corner t2 pinned!
  const b0Before = evaluateShape(cube).vertices.find((v) => v.id === 'b0')!.pos
  const t2Before = evaluateShape(cube).vertices.find((v) => v.id === 't2')!.pos
  const cubeDrag = dragShapeItemHandle(
    cube,
    'b0',
    [b0Before[0] - 40, b0Before[1] + 30],
    { ...baseOpts, alt: false },
    { startWorld: b0Before, startGeo: cube.geo }
  )
  const t2After = evaluateShape(cubeDrag.item).vertices.find((v) => v.id === 't2')!.pos
  near(t2After[0], t2Before[0], 1e-4)
  near(t2After[1], t2Before[1], 1e-4)
  assert.equal(cubeDrag.item.geo.vertices3, undefined)
  assert.ok(cubeDrag.item.geo.dim3![0] > cube.geo.dim3![0] + 10)

  // Cube corner drag with Shift enforces uniform cube a=b=c.
  const cubeShift = dragShapeItemHandle(
    cube,
    't1',
    [b0Before[0] + 80, b0Before[1] - 40],
    { ...baseOpts, shift: true },
    { startWorld: b0Before, startGeo: cube.geo }
  )
  near(cubeShift.item.geo.dim3![0], cubeShift.item.geo.dim3![1], 1e-4)
  near(cubeShift.item.geo.dim3![1], cubeShift.item.geo.dim3![2], 1e-4)
  assert.equal(cubeShift.label, 'a=b=c')

  // Pyramid apex constrained drag stretches height while keeping base center pinned!
  const pyrCenterBefore = evaluateShape(pyr).vertices.find((v) => v.id === 'b0')!.pos
  const pyrApexBefore = evaluateShape(pyr).vertices.find((v) => v.id === 'apex')!.pos
  const pyrDrag = dragShapeItemHandle(
    pyr,
    'apex',
    [pyrApexBefore[0], pyrApexBefore[1] - 40],
    { ...baseOpts, alt: false },
    { startWorld: pyrApexBefore, startGeo: pyr.geo }
  )
  const pyrBaseAfter = evaluateShape(pyrDrag.item).vertices.find((v) => v.id === 'b0')!.pos
  near(pyrBaseAfter[0], pyrCenterBefore[0], 1e-3)
  near(pyrBaseAfter[1], pyrCenterBefore[1], 1e-3)
  assert.ok(pyrDrag.item.geo.dim3![1] > pyr.geo.dim3![1] + 20)

  // Pyramid base corner constrained drag widens base radius.
  const pyrBaseDrag = dragShapeItemHandle(
    pyr,
    'b0',
    [pyrCenterBefore[0] + 35, pyrCenterBefore[1] + 25],
    { ...baseOpts, alt: false },
    { startWorld: pyrCenterBefore, startGeo: pyr.geo }
  )
  assert.notEqual(pyrBaseDrag.item.geo.dim3![0], pyr.geo.dim3![0])

  // Cone rim b0 drag resizes radius; sphere center translates and rim0 resizes.
  const coneB0 = evaluateShape(cone).vertices.find((v) => v.id === 'b0')!.pos
  const coneRad = dragShapeItemHandle(cone, 'b0', [coneB0[0] + 45, coneB0[1]], { ...baseOpts, alt: true }, { startWorld: coneB0, startGeo: cone.geo })
  assert.notEqual(coneRad.item.geo.dim3![0], cone.geo.dim3![0])

  const sphere = mk('sphere')
  const spCenter = evaluateShape(sphere).center
  const spMoved = dragShapeItemHandle(sphere, 'center', [spCenter[0] + 25, spCenter[1] - 15], { ...baseOpts, alt: true }, { startWorld: spCenter, startGeo: sphere.geo })
  near(evaluateShape(spMoved.item).center[0], spCenter[0] + 25, 1e-4)
  near(evaluateShape(spMoved.item).center[1], spCenter[1] - 15, 1e-4)
  const spRim = evaluateShape(sphere).vertices.find((v) => v.id === 'rim0')!.pos
  const spResized = dragShapeItemHandle(sphere, 'rim0', [spCenter[0] + 120, spCenter[1]], { ...baseOpts, alt: true }, { startWorld: spRim, startGeo: sphere.geo })
  near(spResized.item.geo.dim3![0], 240, 1e-4)
})

test('true free 3D vertex dragging (Alt + Free vertices), isometric + 6 side views, clickable poles, depth hit priority, universal connections, Ctrl snap & docked panel lifecycle', () => {
  const mk = (kind: ShapeSpec['kind'], base?: number): ShapeItem =>
    createShapeItem(
      specToShapeData({ kind, ax: 0, ay: 0, bx: 144, by: 144, ...(base ? { base } : {}) }),
      { color: '#1e1e1e', size: 2, tool: 'pen' },
      { id: `u-${kind}`, z: 1 }
    )

  // 1. True Isometric (35.264 / -45 deg) + 6 orthographic side views + clickable pole toggling.
  const cube = mk('cube')
  assert.equal(detectViewPreset3d(cube.geo), 'axon')
  assert.equal(isSideViewPreset('axon'), false)
  assert.equal(isSideViewPreset('iso'), false)
  assert.equal(isSideViewPreset('top'), true)

  const isoCube = applyViewPreset3d(cube, 'iso')
  assert.equal(detectViewPreset3d(isoCube.geo), 'iso')
  // Mathematical isometric projects X, Y, Z unit vectors with identical foreshortening sqrt(2/3).
  const isoM = quatToMat3(effectiveQuat(isoCube.geo))
  const lenX = Math.hypot(rotate3dMat([1, 0, 0], isoM)[0], rotate3dMat([1, 0, 0], isoM)[1])
  const lenY = Math.hypot(rotate3dMat([0, 1, 0], isoM)[0], rotate3dMat([0, 1, 0], isoM)[1])
  const lenZ = Math.hypot(rotate3dMat([0, 0, 1], isoM)[0], rotate3dMat([0, 0, 1], isoM)[1])
  near(lenX, Math.sqrt(2 / 3), 1e-4)
  near(lenY, Math.sqrt(2 / 3), 1e-4)
  near(lenZ, Math.sqrt(2 / 3), 1e-4)

  for (const preset of ['axon', 'iso', 'front', 'back', 'top', 'bottom', 'right', 'left'] as const) {
    assert.equal(detectViewPreset3d(applyViewPreset3d(cube, preset).geo), preset)
  }

  // Axis pole toggling flips +/- sides on repeated clicks.
  const r1 = toggleAxisViewPreset3d(cube, 'x')
  assert.equal(r1.preset, 'right')
  const r2 = toggleAxisViewPreset3d(r1.item, 'x')
  assert.equal(r2.preset, 'left')
  const y1 = toggleAxisViewPreset3d(cube, 'y')
  assert.equal(y1.preset, 'top')
  const y2 = toggleAxisViewPreset3d(y1.item, 'y')
  assert.equal(y2.preset, 'bottom')
  const z1 = toggleAxisViewPreset3d(cube, 'z')
  assert.equal(z1.preset, 'front')
  const z2 = toggleAxisViewPreset3d(z1.item, 'z')
  assert.equal(z2.preset, 'back')

  // Clicking a gizmo X/Y/Z pole hits kind='pole', and dragging poleX rotates the X ring.
  const cam = { x: 0, y: 0, zoom: 1 }
  const gizmo = buildGizmo3d(cube, 1, 'local')!
  const xPole = gizmo.rings.find((r) => r.id === 'rotX')!.pole!
  const poleHit = hitGizmo3dRing(gizmo, xPole.pos[0], xPole.pos[1], cam, 0)
  assert.ok(poleHit)
  assert.equal(poleHit.kind, 'pole')
  assert.equal(poleHit.id, 'poleX')
  const poleDrag = dragShapeItemHandle(
    cube,
    'poleX',
    [xPole.pos[0], xPole.pos[1] + 50],
    { ...baseOpts, shift: true },
    { startWorld: xPole.pos, startGeo: cube.geo, gizmoSpace: 'local' }
  )
  assert.ok(poleDrag.item.geo.rot3)
  assert.equal(poleDrag.gizmoArc?.id, 'rotX')

  // 2. Front-face depth priority in orthographic side views: in Top view, t0 (depth > 0) beats overlapping b0 (depth < 0).
  const topCube = applyViewPreset3d(cube, 'top')
  const topHandles = shapeItemHandles(topCube)
  const hB0 = topHandles.find((h) => h.id === 'b0')!
  const hT0 = topHandles.find((h) => h.id === 't0')!
  near(hB0.x, hT0.x, 1e-4)
  near(hB0.y, hT0.y, 1e-4)
  assert.ok((hT0.depth ?? 0) > (hB0.depth ?? 0))
  const pickedTop = hitShapeHandle(topHandles, hT0.x, hT0.y, cam, 0)
  assert.equal(pickedTop?.id, 't0')

  // 3. True free 3D vertex dragging via Alt + unlockFreeVertices on 3D polyhedra.
  assert.equal(canUnlockFreeVertices(cube.geo), true)
  assert.equal(canUnlockFreeVertices(mk('sphere').geo), false)
  const evTopBefore = evaluateShape(topCube)
  const t0Start = evTopBefore.vertices.find((v) => v.id === 't0')!
  const b0Start = evTopBefore.vertices.find((v) => v.id === 'b0')!
  const freeCubeDrag = dragShapeItemHandle(
    topCube,
    't0',
    [t0Start.pos[0] + 30, t0Start.pos[1] - 20],
    { ...baseOpts, alt: true },
    { startWorld: t0Start.pos, startGeo: topCube.geo }
  )
  assert.ok(freeCubeDrag.item.geo.vertices3, 'Alt+drag unlocks free 3D vertices')
  assert.equal(canUnlockFreeVertices(freeCubeDrag.item.geo), false)
  // In Top view, dragging in screen X/Y changes world X/Z with zero accidental Y depth drift and leaves all 7 other vertices pinned!
  const evFreeAfter = evaluateShape(freeCubeDrag.item)
  const t0After = evFreeAfter.vertices.find((v) => v.id === 't0')!
  near(t0After.pos[0], t0Start.pos[0] + 30, 1e-4)
  near(t0After.pos[1], t0Start.pos[1] - 20, 1e-4)
  near(t0After.pos3![1], t0Start.pos3![1], 1e-4)
  const b0After = evFreeAfter.vertices.find((v) => v.id === 'b0')!
  near(b0After.pos3![0], b0Start.pos3![0], 1e-4)
  near(b0After.pos3![1], b0Start.pos3![1], 1e-4)
  near(b0After.pos3![2], b0Start.pos3![2], 1e-4)
  assert.ok(Number.isFinite(t0After.angleDeg!))

  // Unlocking explicitly via "Free vertices" allows dragging without Alt, and Reset clears vertices3.
  const unlockedPyr = unlockFreeVertices(mk('pyramid', 4))
  assert.ok(unlockedPyr.geo.vertices3)
  const pyrWithAlt = toggleConstruction(unlockedPyr, { id: 'alt:apex', kind: 'altitude', from: 'apex' })
  const pyrB0 = evaluateShape(pyrWithAlt).vertices.find((v) => v.id === 'b0')!
  const tiltedPyr = dragShapeItemHandle(
    pyrWithAlt,
    'b0',
    [pyrB0.pos[0] + 15, pyrB0.pos[1] - 25],
    { ...baseOpts, alt: false },
    { startWorld: pyrB0.pos, startGeo: pyrWithAlt.geo }
  ).item
  const altCon = evaluateShape(tiltedPyr).constructions.find((c) => c.id === 'alt:apex')!
  assert.ok(altCon.segments.length >= 1)
  assert.ok(Number.isFinite(altCon.segments[0].pts[1][0]) && Number.isFinite(altCon.segments[0].pts[1][1]))
  const resetCube = resetShapeItemGeometry(freeCubeDrag.item)
  assert.equal(resetCube.geo.vertices3, undefined)

  // 4. Universal point-to-point line connections (all non-adjacent vertices + face diagonals + active center O & midpoints).
  const hex = mk('hexagon')
  const hexWithMidAndO = toggleConstruction(
    toggleConstruction(hex, { id: 'center', kind: 'center' }),
    { id: 'mid:e2', kind: 'midpoint', edge: 'e2' }
  )
  const hexConn = availableVertexActions(hexWithMidAndO, 'v0')!.connectTargets
  const hexTargetIds = hexConn.map((c) => c.targetId)
  assert.ok(hexTargetIds.includes('v2') && hexTargetIds.includes('v3') && hexTargetIds.includes('v4'), 'connects to ALL non-adjacent hexagon vertices')
  assert.ok(hexTargetIds.includes('center'), 'connects to active center O')
  assert.ok(hexTargetIds.includes('mid:e2'), 'connects to active edge midpoint')
  const midConn = hexConn.find((c) => c.targetId === 'mid:e2')!
  const hexLinked = toggleConstruction(hexWithMidAndO, midConn.construction)
  assert.equal(evaluateShape(hexLinked).constructions.some((c) => c.id === midConn.id && c.segments.length === 1), true)

  const cubeConn = availableVertexActions(cube, 'b0')!.connectTargets.map((c) => c.targetId)
  // b0 is adjacent to b1, b3, t0 -> connects to ALL 4 remaining vertices: b2 (base diag), t1 & t3 (face diags), t2 (space diag)!
  assert.deepEqual(cubeConn.sort(), ['b2', 't1', 't2', 't3'])
  const faceDiagCube = toggleConstruction(cube, { id: 'diag:b0-t1', kind: 'diagonal', from: 'b0', to: 't1' })
  assert.equal(evaluateShape(faceDiagCube).constructions.some((c) => c.id === 'diag:b0-t1' && c.segments.length === 1), true)

  const ell = mk('ellipse')
  const ellConn = availableVertexActions(ell, 'v0')!.connectTargets.map((c) => c.targetId)
  assert.ok(ellConn.includes('v1') && ellConn.includes('v2') && ellConn.includes('v3') && ellConn.includes('center'))

  // 5. Ctrl grid snap on 2D and 3D handles.
  const rect = mk('rectangle')
  const rectSnap = dragShapeItemHandle(rect, 'v1', [151, 29], { ...baseOpts, ctrl: true }, { startWorld: [144, 0], startGeo: rect.geo })
  assert.equal(rectSnap.snapped, true)
  near(rectSnap.item.geo.bx, 144, 1e-4)
  near(rectSnap.item.geo.ay, 24, 1e-4)

  const freeGridCube = dragShapeItemHandle(
    topCube,
    't0',
    [t0Start.pos[0] + 29, t0Start.pos[1] - 19],
    { ...baseOpts, alt: true, ctrl: true },
    { startWorld: t0Start.pos, startGeo: topCube.geo }
  )
  const t0Grid = evaluateShape(freeGridCube.item).vertices.find((v) => v.id === 't0')!.pos
  near(t0Grid[0] % 24, 0, 1e-3)
  near(t0Grid[1] % 24, 0, 1e-3)

  // 6. Docked ShapePanel lifecycle in Editor: stays open across shape edits, closes on deselect or lock.
  const editor = new Editor([strokesModule, shapesModule, shapeEditorModule])
  try {
    editor.scene.add([cube])
    editor.setSelection([cube])
    editor.session.setState({ shapePanel: true })
    assert.equal(editor.session.getState().shapePanel, true)
    editor.replaceShapeItem(isoCube)
    assert.equal(editor.session.getState().shapePanel, true, 'stays open while editing the selected shape')
    editor.clearSelection()
    assert.equal(editor.session.getState().shapePanel, false, 'closes automatically when deselected')
  } finally {
    editor.dispose()
  }

  // 7. 2D <-> 3D shape conversion preserves natural side counts and positive dimensions even on reversed boxes.
  const tri2d = createShapeItem(
    specToShapeData({ kind: 'triangle', ax: 160, ay: 140, bx: 20, by: 20 }),
    { color: '#1e1e1e', size: 2, tool: 'pen' },
    { id: 'tri-2d', z: 1 }
  )
  const triPrism = switchShapeItemKind(tri2d, 'prism')
  assert.equal(triPrism.geo.kind, 'prism')
  assert.equal(triPrism.geo.sides, 3)
  assert.ok(triPrism.geo.dim3!.every((d) => d > 0))
  assert.equal(evaluateShape(triPrism).is3D, true)

  const hexPyr = switchShapeItemKind(mk('hexagon'), 'pyramid')
  assert.equal(hexPyr.geo.kind, 'pyramid')
  assert.equal(hexPyr.geo.sides, 6)

  const backToPoly = switchShapeItemKind(hexPyr, 'polygon')
  assert.equal(backToPoly.geo.kind, 'polygon')
  assert.equal(backToPoly.geo.sides, 6)
  assert.equal(evaluateShape(backToPoly).is3D, false)
  assert.equal(backToPoly.geo.dim3, undefined)
})

test('pulling a pyramid apex straight down in a tilted view lowers it without leaning, so the height stays inside the base', () => {
  const mk = (): ShapeItem =>
    createShapeItem(specToShapeData({ kind: 'pyramid', ax: 0, ay: 0, bx: 160, by: 160, base: 4 }), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: 'pyr-down', z: 1 })
  const pyr = toggleConstruction(mk(), { id: 'alt:apex', kind: 'altitude', from: 'apex' })
  const apex = evaluateShape(pyr).vertices.find((v) => v.id === 'apex')!
  const center = evaluateShape(pyr).vertices.filter((v) => v.id.startsWith('b'))
  for (const dy of [40, 80, 200]) {
    const moved = dragShapeItemHandle(pyr, 'apex', [apex.pos[0], apex.pos[1] + dy], baseOpts, { startWorld: apex.pos, startGeo: pyr.geo }).item
    const ev = evaluateShape(moved)
    const a3 = ev.vertices.find((v) => v.id === 'apex')!.pos3!
    assert.ok(Math.abs(a3[0]) < 1 && Math.abs(a3[2]) < 1, `apex leaned to ${a3}`)
    const foot = ev.constructions.find((c) => c.id === 'alt:apex')!.dots![0].pos
    const cx = center.reduce((s, v) => s + v.pos[0], 0) / center.length
    const cy = center.reduce((s, v) => s + v.pos[1], 0) / center.length
    assert.ok(Math.hypot(foot[0] - cx, foot[1] - cy) < 1, `foot ${foot} left the base centre ${cx},${cy}`)
  }
  // Dragging sideways still leans the apex.
  const side = dragShapeItemHandle(pyr, 'apex', [apex.pos[0] + 60, apex.pos[1]], baseOpts, { startWorld: apex.pos, startGeo: pyr.geo }).item
  const s3 = evaluateShape(side).vertices.find((v) => v.id === 'apex')!.pos3!
  assert.ok(Math.hypot(s3[0], s3[2]) > 20)
})

test('cube size handles, regular polygon corners and parallelogram corners stay under the pointer', () => {
  const mk = (kind: ShapeSpec['kind'], extra: Partial<ShapeSpec> = {}): ShapeItem =>
    createShapeItem(specToShapeData({ kind, ax: 0, ay: 0, bx: 160, by: 120, ...extra }), { color: '#1e1e1e', size: 2, tool: 'pen' }, { id: `follow-${kind}`, z: 1 })
  const follow = (item: ShapeItem, id: string, dx: number, dy: number): number => {
    const h = shapeItemHandles(item).find((x) => x.id === id)!
    const moved = dragShapeItemHandle(item, id, [h.x + dx, h.y + dy], { ...baseOpts, alt: true }, { startWorld: [h.x, h.y], startGeo: item.geo }).item
    const nh = shapeItemHandles(moved).find((x) => x.id === id)!
    return Math.hypot(nh.x - h.x - dx, nh.y - h.y - dy)
  }
  // The depth handle points into the screen, so its axis looks short: pulling it along that axis must still track.
  const cube = mk('cube')
  const hz = shapeItemHandles(cube).find((x) => x.id === 'dimZ')!
  const c = evaluateShape(cube).center
  const len = Math.hypot(hz.x - c[0], hz.y - c[1])
  assert.ok(follow(cube, 'dimZ', ((hz.x - c[0]) / len) * 30, ((hz.y - c[1]) / len) * 30) < 1.5)
  // A stretched hexagon keeps its proportions; a corner pulled along its ray lands on the pointer.
  const hex = mk('hexagon')
  const hv = shapeItemHandles(hex).find((x) => x.id === 'v1')!
  const hc = evaluateShape(hex).center
  assert.ok(follow(hex, 'v1', (hv.x - hc[0]) * 0.3, (hv.y - hc[1]) * 0.3) < 0.5)
  const bigger = dragShapeItemHandle(hex, 'v1', [hc[0] + (hv.x - hc[0]) * 1.3, hc[1] + (hv.y - hc[1]) * 1.3], baseOpts, { startWorld: [hv.x, hv.y], startGeo: hex.geo }).item
  near((bigger.geo.bx - bigger.geo.ax) / (bigger.geo.by - bigger.geo.ay), 160 / 120, 1e-6)
  // Every parallelogram corner follows the pointer, also when the shape is turned.
  for (const rot of [0, 0.7]) for (const id of ['v0', 'v1', 'v2', 'v3']) {
    assert.ok(follow(mk('parallelogram', { rot }), id, 17, 23) < 0.5, `parallelogram ${id} rot ${rot}`)
  }
})
