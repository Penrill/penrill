import { near, type Egg } from '../../core/egg'
import { answer } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { sixSevenShow } from './show'

export const sixseven: Egg = {
  id: 'sixseven',
  icon: '67',
  name: { en: 'Six Seven', uk: 'Шість-сім' },
  how: { en: 'Got 67 as an answer', uk: 'Отримати відповідь 67' },
  triggers: [answer((v) => near(v, 67)), typed('SIXSEVEN')],
  show: sixSevenShow
}
