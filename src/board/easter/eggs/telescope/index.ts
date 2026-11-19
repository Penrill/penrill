import type { Egg } from '../../core/egg'
import { zoomLimit } from '../../triggers/view'
import { telescopeShow } from './show'

export const telescope: Egg = {
  id: 'telescope',
  icon: '🔭',
  name: { en: 'Telescope', uk: 'Телескоп' },
  how: { en: 'Zoomed all the way out', uk: 'Віддалити дошку до краю' },
  triggers: [zoomLimit('out')],
  show: telescopeShow
}
