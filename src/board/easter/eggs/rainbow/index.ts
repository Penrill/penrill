import type { Egg } from '../../core/egg'
import { boardReaches, inkColours } from '../../triggers/drawing'
import { typed } from '../../triggers/typed'
import { rainbowShow } from './show'

export const rainbow: Egg = {
  id: 'rainbow',
  icon: '🌈',
  name: { en: 'Rainbow', uk: 'Веселка' },
  how: { en: 'Used seven ink colours on one board', uk: 'Використати сім кольорів на одній дошці' },
  triggers: [boardReaches(inkColours, 7), typed('RAINBOW')],
  show: rainbowShow
}
