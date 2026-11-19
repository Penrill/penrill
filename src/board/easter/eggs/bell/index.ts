import type { Egg } from '../../core/egg'
import { boardFor } from '../../triggers/time'
import { typed } from '../../triggers/typed'
import { bellShow } from './show'

export const bell: Egg = {
  id: 'bell',
  icon: '🔔',
  name: { en: 'Saved by the Bell', uk: 'Дзвінок на перерву' },
  how: { en: 'Spent 45 minutes on a board', uk: 'Провести за дошкою цілий урок (45 хв)' },
  triggers: [boardFor(45), typed('RECESS')],
  show: bellShow
}
