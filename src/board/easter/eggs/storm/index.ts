import type { Egg } from '../../core/egg'
import { typed } from '../../triggers/typed'
import { stormShow } from './show'

export const storm: Egg = {
  id: 'storm',
  icon: '⛈️',
  name: { en: 'Make It Rain', uk: 'Злива' },
  how: { en: 'Typed MAKEITRAIN or AUIFRVQS on a board', uk: 'Набрати на дошці MAKEITRAIN чи AUIFRVQS' },
  triggers: [typed('MAKEITRAIN', 'AUIFRVQS')],
  show: stormShow
}
