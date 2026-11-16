import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './floater.css'

/** Moon gravity: the board floats up weightlessly while school things drift toward a cratered Moon. */
const THINGS = ['✏️', '📐', '📏', '🧮', '📎', '✂️', '🖍️', '📓', '🔺', '⚽', '🍎', '🪐']

function Floater({ uk }: ShowProps) {
  return (
    <>
      <div className="flt-sky" />
      <div className="flt-moon">
        <i />
        <i />
        <i />
      </div>
      <div className="flt-things">
        {particles(18, (i) => (
          <span
            key={i}
            style={{
              left: `${4 + rnd(i, 1) * 90}%`,
              '--d': `${rnd(i, 2) * 2.2}s`,
              '--rise': `${4 + rnd(i, 3) * 2.5}s`,
              '--rot': `${(rnd(i, 4) - 0.5) * 540}deg`,
              '--sway': `${(rnd(i, 5) - 0.5) * 180}px`,
              '--s': 0.8 + rnd(i, 6) * 0.9
            } as Vars}
          >
            {THINGS[i % THINGS.length]}
          </span>
        ))}
      </div>
      <div className="flt-banner">{uk ? 'Місячна гравітація · g = 1,62 м/с²' : 'Moon gravity · g = 1.62 m/s²'}</div>
    </>
  )
}

export const floater: Egg = {
  id: 'floater',
  icon: '🌙',
  name: { en: 'Moon Gravity', uk: 'Місячна гравітація' },
  how: { en: 'Typed FLOATER or BUBBLECARS on a board', uk: 'Набрати на дошці FLOATER чи BUBBLECARS' },
  life: 7000,
  appClass: 'ach-float',
  Show: Floater,
  words: ['FLOATER', 'BUBBLECARS']
}
