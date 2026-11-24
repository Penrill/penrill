// Modular shape editor (@penrill/shape-editor + src/board/modules/shapeEditor). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene } from '@penrill/core/scene'
import { createShapeItem, specToShapeData } from '@penrill/core/shapeConvert'
import { evaluateShape } from '@penrill/core/shapeEval'
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
  isConstrained2dPolygon,
  isCustomizedShapeItem,
  resetShapeItemGeometry,
  setLabel,
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

    // Headless controller: tapping a cube corner does not mutate scene; dragging orbit records one undo step!
    editor.scene.add([cube])
    editor.setSelection([cube])
    const b0 = feature.itemHandles(cube).find((h) => h.id === 'b0')!
    const verBefore = editor.scene.version
    const tap = beginShapeItemHandle(feature, editor, cube, b0, [b0.x, b0.y])
    tap.move([b0.x + 10, b0.y + 10], { shift: false, ctrl: false, alt: false }, [24, 24])
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
