import { formatShapeLength, shapeAnnotationsDisplay } from '@penrill/shape-editor/annotations'
import {
  applyShapeItemDefaults,
  canUnlockFreeVertices,
  isConstrained2dPolygon,
  isCustomizedShapeItem,
  resetShapeItemGeometry,
  resetShapeItemOrbit,
  setShapeItemSides,
  switchShapeItemKind,
  unlockFreeVertices
} from '@penrill/shape-editor/elements'
import { applyViewPreset3d, buildGizmo3d, hitGizmo3dRing, setEulerDeg3d, toggleAxisViewPreset3d } from '@penrill/shape-editor/gizmo3d'
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
  applyDefaultMeasurements,
  isPrimaryShapeStroke,
  toggleAllAngles,
  toggleAllLengths,
  toggleEdgeFeature,
  toggleVertexFeature
} from '@penrill/shape-editor/targets'
import type { FeatureModule } from '../registry'
import { currentShapeFormat } from './shapes'
import { hitShapeCorner, hitShapeEdge, hitShapeHandle, hitShapeItemEdge } from './shapeEditor/controller'
import { drawShapeEditorOverlay } from './shapeEditor/overlay'

/**
 * Direct on-canvas shape editor: constrained and unlocked 2D vertex dragging, real 3D orbit,
 * optional Blender-style 3-axis X/Y/Z + View-Roll + Trackball rotation gizmo, dimension handles,
 * unified per-vertex and per-edge constructions, magnetic snapping and vector measurements.
 */
export const shapeEditorModule: FeatureModule = {
  id: 'shape-editor',
  shapeEditor: {
    itemHandles: shapeItemHandles,
    isCustomizedItem: isCustomizedShapeItem,
    isConstrained2d: (item) => isConstrained2dPolygon(item.geo),
    canUnlockFreeVertices: (item) => canUnlockFreeVertices(item.geo),
    unlockFreeVertices,
    resetItemGeometry: resetShapeItemGeometry,
    resetItemOrbit: resetShapeItemOrbit,
    applyViewPreset3d,
    toggleAxisViewPreset3d,
    setEulerDeg3d,
    buildGizmo3d,
    hitGizmo3dRing: (gizmo, sx, sy, cam, reach) => {
      const hit = hitGizmo3dRing(gizmo, sx, sy, cam, reach)
      if (!hit) return null
      if (hit.kind === 'pole') {
        return {
          id: hit.id,
          kind: 'gizmoPole',
          x: hit.x,
          y: hit.y,
          hint: 'shape.hint.gizmoPole',
          cursor: 'pointer',
          draggable: true
        }
      }
      return {
        id: hit.ring.id,
        kind: 'gizmoRing',
        x: hit.x,
        y: hit.y,
        hint: 'shape.hint.gizmoRing',
        cursor: 'grab',
        draggable: true
      }
    },
    switchItemKind: switchShapeItemKind,
    setItemSides: setShapeItemSides,
    hitItemEdge: hitShapeItemEdge,
    dragItemHandle: dragShapeItemHandle,
    insertItemVertex: insertShapeItemVertex,
    removeItemVertex: removeShapeItemVertex,
    applyItemDefaults: applyShapeItemDefaults,
    handles: shapeHandles,
    usesVertexHandles,
    isCustomized: isCustomizedShape,
    resetGeometry: resetShapeGeometry,
    hitHandle: hitShapeHandle,
    hitEdge: hitShapeEdge,
    hitCorner: hitShapeCorner,
    dragHandle: dragShapeHandle,
    insertVertex: insertPolygonVertex,
    removeVertex: removePolygonVertex,
    toggleVertexFeature,
    toggleEdgeFeature,
    toggleAllAngles,
    toggleAllLengths,
    applyDefaults: applyDefaultMeasurements,
    formatLength: (worldLen) => formatShapeLength(worldLen, currentShapeFormat()),
    annotationsDisplay: (item) => {
      if (!item.shape || !isPrimaryShapeStroke(item)) return null
      return shapeAnnotationsDisplay(item.shape, item.color, item.size, currentShapeFormat())
    },
    drawOverlay: drawShapeEditorOverlay
  }
}
