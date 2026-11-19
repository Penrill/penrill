import type { Egg } from '../../core/egg'
import { boardReaches, strokeCount } from '../../triggers/drawing'
import { typed } from '../../triggers/typed'
import { fireworksShow } from './show'

export const fireworks: Egg = {
  id: 'fireworks',
  icon: '🎆',
  name: { en: 'Five Hundred', uk: 'Пів тисячі' },
  how: { en: 'Drew 500 strokes on one board', uk: 'Намалювати 500 штрихів на одній дошці' },
  triggers: [boardReaches(strokeCount, 500), typed('FIREWORKS')],
  show: fireworksShow
}
