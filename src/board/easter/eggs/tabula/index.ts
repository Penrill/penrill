import type { Egg } from '../../core/egg'
import { wiped } from '../../triggers/drawing'
import { typed } from '../../triggers/typed'
import { tabulaShow } from './show'

export const tabula: Egg = {
  id: 'tabula',
  icon: '🫧',
  name: { en: 'Tabula Rasa', uk: 'Tabula rasa' },
  how: { en: 'Cleared 30 things off a board at once', uk: 'Стерти з дошки 30 речей за раз' },
  triggers: [wiped(30), typed('TABULARASA')],
  show: tabulaShow
}
