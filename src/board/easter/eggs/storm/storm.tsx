import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './storm.css'

/** Thunderstorm: dark clouds, slanted rain, splashes, twin lightning bolts and thunder flashes. */
function Storm({ uk }: ShowProps) {
  return (
    <>
      <div className="storm-sky" />
      <div className="storm-clouds">
        {particles(7, (i) => (
          <span key={i} style={{ left: `${-10 + i * 17}%`, '--s': 0.8 + rnd(i, 1) * 0.6, '--d': `${rnd(i, 2) * 0.6}s` } as Vars} />
        ))}
      </div>
      <div className="storm-rain">
        {particles(140, (i) => (
          <span key={i} style={{ left: `${rnd(i, 3) * 110 - 5}%`, '--d': `${0.3 + rnd(i, 4) * 1.4}s`, '--fall': `${0.45 + rnd(i, 5) * 0.35}s`, '--len': `${14 + rnd(i, 6) * 22}px` } as Vars} />
        ))}
      </div>
      <div className="storm-splashes">
        {particles(16, (i) => (
          <span key={i} style={{ left: `${rnd(i, 7) * 100}%`, bottom: `${2 + rnd(i, 8) * 16}%`, '--d': `${0.6 + rnd(i, 9) * 1.2}s` } as Vars} />
        ))}
      </div>
      <svg className="storm-bolt b1" viewBox="0 0 100 300" aria-hidden>
        <path d="M60 0 L30 120 L55 120 L20 300 L80 100 L52 100 L75 0 Z" />
      </svg>
      <svg className="storm-bolt b2" viewBox="0 0 100 300" aria-hidden>
        <path d="M60 0 L30 120 L55 120 L20 300 L80 100 L52 100 L75 0 Z" />
      </svg>
      <div className="storm-flash" />
      <div className="storm-banner">{uk ? 'Грозовий фронт' : 'Thunderstorm'}</div>
    </>
  )
}

export const storm: Egg = {
  id: 'storm',
  icon: '⛈️',
  name: { en: 'Make It Rain', uk: 'Злива' },
  how: { en: 'Typed MAKEITRAIN or AUIFRVQS on a board', uk: 'Набрати на дошці MAKEITRAIN чи AUIFRVQS' },
  life: 6500,
  Show: Storm,
  words: ['MAKEITRAIN', 'AUIFRVQS']
}
