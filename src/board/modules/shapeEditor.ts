import { formatShapeLength, shapeAnnotationsDisplay } from '@penrill/shape-editor/annotations'
import {
  applyShapeItemDefaults,
  isConstrained2dPolygon,
  isCustomizedShapeItem,
  resetShapeItemGeometry,
  setShapeItemSides,
  switchShapeItemKind,
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
 * Direct on-canvas shape editor: constrained and unlocked 2D vertex dragging, real 3D orbit &
 * dimension handles, unified per-vertex and per-edge constructions (altitude, median, bisector,
 * diagonal, midpoint, midline, apothem, axis, labels, angles, lengths), magnetic snapping and
 * vector measurements.
 */
export const shapeEditorModule: FeatureModule = {
  id: 'shape-editor',
  shapeEditor: {
    itemHandles: shapeItemHandles,
    isCustomizedItem: isCustomizedShapeItem,
    isConstrained2d: (item) => isConstrained2dPolygon(item.geo),
    unlockFreeVertices,
    resetItemGeometry: resetShapeItemGeometry,
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
