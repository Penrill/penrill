import type { Egg } from '../../core/egg'
import { zoomLimit } from '../../triggers/view'
import { microscopeShow } from './show'

export const microscope: Egg = {
  id: 'microscope',
  icon: '🔬',
  name: { en: 'Microscope', uk: 'Мікроскоп' },
  how: { en: 'Zoomed all the way in', uk: 'Наблизити дошку до краю' },
  triggers: [zoomLimit('in')],
  show: microscopeShow
}
