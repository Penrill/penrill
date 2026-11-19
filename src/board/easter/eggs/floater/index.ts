import type { Egg } from '../../core/egg'
import { typed } from '../../triggers/typed'
import { floaterShow } from './show'

export const floater: Egg = {
  id: 'floater',
  icon: '🌙',
  name: { en: 'Moon Gravity', uk: 'Місячна гравітація' },
  how: { en: 'Typed FLOATER or BUBBLECARS on a board', uk: 'Набрати на дошці FLOATER чи BUBBLECARS' },
  triggers: [typed('FLOATER', 'BUBBLECARS')],
  show: floaterShow
}
