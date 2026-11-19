import type { Egg } from '../../core/egg'
import { atHour } from '../../triggers/time'
import { typed } from '../../triggers/typed'
import { owlShow } from './show'

export const owl: Egg = {
  id: 'owl',
  icon: '🦉',
  name: { en: 'Night Owl', uk: 'Нічна сова' },
  how: { en: 'Was on a board at 3 a.m.', uk: 'Сидіти над дошкою о третій ночі' },
  triggers: [atHour(3), typed('NIGHTOWL')],
  show: owlShow
}
