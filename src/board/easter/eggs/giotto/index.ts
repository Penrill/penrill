import type { Egg } from '../../core/egg'
import { fitRound, isRound } from '../../triggers/circle'
import { drew } from '../../triggers/drawing'
import { giottoShow } from './show'

export const giotto: Egg = {
  id: 'giotto',
  icon: '⭕',
  name: { en: 'Giotto’s O', uk: 'Коло Джотто' },
  how: { en: 'Drew a circle by hand that came out round', uk: 'Намалювати від руки майже ідеальне коло' },
  triggers: [
    // A freehand pen line (not a snapped shape), closed and round to within 3% of its radius.
    drew((s) => {
      if (s.tool !== 'pen' || s.geom || s.shape) return null
      const fit = fitRound(s.points)
      return isRound(fit) ? fit : null
    })
  ],
  show: giottoShow
}
