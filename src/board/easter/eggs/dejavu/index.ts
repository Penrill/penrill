import type { Egg } from '../../core/egg'
import { dejavuShow } from './show'

/** Off the record: Alt/Option-clicking the achievements switch plays it (medals/AchievementsSettings). */
export const dejavu: Egg = {
  id: 'dejavu',
  icon: '🐈‍⬛',
  name: { en: 'Déjà Vu', uk: 'Дежавю' },
  how: { en: 'Alt/Option-clicked the achievements switch', uk: 'Клікнути перемикач досягнень з Alt / Option' },
  secret: true,
  repeatable: false,
  triggers: [],
  show: dejavuShow
}
