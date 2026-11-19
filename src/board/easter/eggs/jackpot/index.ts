import { near, type Egg } from '../../core/egg'
import { answer } from '../../triggers/formula'
import { typed } from '../../triggers/typed'
import { jackpotShow } from './show'

export const jackpot: Egg = {
  id: 'jackpot',
  icon: '🎰',
  name: { en: 'Jackpot', uk: 'Джекпот' },
  how: { en: 'Got 777 as an answer', uk: 'Отримати відповідь 777' },
  triggers: [answer((v) => near(v, 777)), typed('JACKPOT')],
  show: jackpotShow
}
