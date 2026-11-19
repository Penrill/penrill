import { near, type Egg } from '../../core/egg'
import { answer } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { piShow } from './show'

export const pi: Egg = {
  id: 'pi',
  icon: 'π',
  name: { en: 'Archimedes’ Constant', uk: 'Число Пі' },
  how: { en: 'Got π ≈ 3.14159 as an answer', uk: 'Отримати у відповіді π ≈ 3,14159' },
  triggers: [answer((v) => near(v, Math.PI, 0.002)), typed('ARCHIMEDES')],
  show: piShow
}
