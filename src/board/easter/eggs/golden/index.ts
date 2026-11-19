import { near, type Egg } from '../../core/egg'
import { answer } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { goldenShow } from './show'

export const golden: Egg = {
  id: 'golden',
  icon: 'φ',
  name: { en: 'Golden Ratio', uk: 'Золотий перетин' },
  how: { en: 'Got φ ≈ 1.618 as an answer', uk: 'Отримати у відповіді φ ≈ 1,618' },
  triggers: [answer((v) => near(v, (1 + Math.sqrt(5)) / 2, 0.002)), typed('FIBONACCI', 'GOLDEN')],
  show: goldenShow
}
