import { near, type Egg } from '../../core/egg'
import { answer } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { newtonShow } from './show'

export const newton: Egg = {
  id: 'newton',
  icon: '🍎',
  name: { en: 'Universal Gravitation', uk: 'Всесвітнє тяжіння' },
  how: { en: 'Got g ≈ 9.81 or typed NEWTON on a board', uk: 'Отримати g ≈ 9,81 або набрати NEWTON' },
  triggers: [answer((v) => near(v, 9.8, 0.015) || near(v, 9.81, 0.015)), typed('NEWTON', 'GRAVITY')],
  show: newtonShow
}
