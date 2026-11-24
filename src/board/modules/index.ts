import type { FeatureModule } from '../registry'
import { formulasModule } from './formulas'
import { graphsModule } from './graphs'
import { imagesModule } from './images'
import { shapeEditorModule } from './shapeEditor'
import { shapeRecognitionModule } from './shapeRecognition'
import { shapesModule } from './shapes'
import { strokesModule } from './strokes'
import { textModule } from './text'

/**
 * Everything Penrill does today, as modules. An app passes the ones it wants to createEditor();
 * leaving one out removes the feature (a module that owns an item type also takes away the ability
 * to show such items, so leave item modules in and switch features off in their UI instead).
 */
export const builtinModules: readonly FeatureModule[] = [
  strokesModule,
  shapesModule,
  imagesModule,
  textModule,
  graphsModule,
  formulasModule,
  shapeRecognitionModule,
  shapeEditorModule
]

export { formulasModule, graphsModule, imagesModule, shapeEditorModule, shapeRecognitionModule, shapesModule, strokesModule, textModule }
