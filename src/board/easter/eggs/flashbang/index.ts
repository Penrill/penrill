import type { Egg } from '../../core/egg'
import { lightAtNight } from '../../triggers/time'
import { typed } from '../../triggers/typed'
import { flashbangShow } from './show'

export const flashbang: Egg = {
  id: 'flashbang',
  icon: '💥',
  name: { en: 'Flashbang', uk: 'Світлошумова' },
  how: { en: 'Switched to a bright theme in the middle of the night', uk: 'Увімкнути світлу тему посеред ночі' },
  triggers: [lightAtNight(), typed('FLASHBANG')],
  show: flashbangShow
}
