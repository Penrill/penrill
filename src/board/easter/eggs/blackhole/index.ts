import type { Egg } from '../../core/egg'
import { formula } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { dividesByZero } from './zero'
import { blackholeShow } from './show'

export const blackhole: Egg = {
  id: 'blackhole',
  icon: '🕳️',
  name: { en: 'Event Horizon', uk: 'Горизонт подій' },
  how: { en: 'Divided by zero in a formula', uk: 'Поділити на нуль у формулі' },
  triggers: [formula(dividesByZero), typed('BLACKHOLE')],
  show: blackholeShow
}
