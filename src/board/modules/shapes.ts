import type { ShapeAnnotationFormat } from '@penrill/shape-editor/annotations'
import { shapeDisplay } from '@penrill/shape-editor/shapeDisplay'
import { translate } from '../i18n'
import type { FeatureModule } from '../registry'
import { prefsStore } from '../store'

/** Active measurement formatting derived from Settings -> Shapes and interface language. */
export function currentShapeFormat(): ShapeAnnotationFormat {
  const { lang, shapeDefaults } = prefsStore.getState()
  const unit = shapeDefaults.unit
  const unitLabel = unit === 'cells' ? translate(lang, 'shapes.unitCellsShort') : translate(lang, 'instruments.cm')
  return { unit, unitLabel, comma: lang === 'uk' }
}

/** First-class parametric 2D and 3D geometric shapes (`ShapeItem`). */
export const shapesModule: FeatureModule = {
  id: 'shapes',
  items: {
    shape: {
      display: (item) => shapeDisplay(item, currentShapeFormat())
    }
  }
}
