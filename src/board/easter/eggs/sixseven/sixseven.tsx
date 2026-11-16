import { near, type Egg, type ShowProps } from '../../core/types'
import './sixseven.css'

/** Six seven: an answer of exactly 67 does the meme, two palms seesawing the 6 and the 7. */
function SixSeven({ uk }: ShowProps) {
  return (
    <>
      <div className="ss-scale">
        <div className="ss-side ss-left">
          <span className="ss-num">6</span>
          <span className="ss-hand">🫴</span>
        </div>
        <div className="ss-side ss-right">
          <span className="ss-num">7</span>
          <span className="ss-hand">🫴</span>
        </div>
      </div>
      <div className="ss-title">{uk ? 'ШІСТЬ-СІМ!' : 'SIX SEVEN!'}</div>
      <span className="ss-ball">🏀</span>
    </>
  )
}

export const sixseven: Egg = {
  id: 'sixseven',
  icon: '67',
  name: { en: 'Six Seven', uk: 'Шість-сім' },
  how: { en: 'Got 67 as an answer', uk: 'Отримати відповідь 67' },
  life: 5000,
  Show: SixSeven,
  answer: (v) => near(v, 67)
}
