import { particles, rnd } from '../../core/random'
import { near, type Egg, type ShowProps, type Vars } from '../../core/types'
import './newton.css'

/**
 * Universal gravitation: getting g ≈ 9.8 / 9.81 as an answer or typing NEWTON / GRAVITY drops an
 * apple from a leafy branch onto Isaac Newton's powdered wig. At the impact, the whole board drops
 * and bounces under Earth's gravity while formulas and a shower of apples bounce across the screen.
 */

const FORMULAS = ['F = G·m₁m₂ / r²', 'g = 9.81 m/s²', 'F = m·a', 'Eₚ = m·g·h', 'v = g·t', 's = ½g·t²']

function Newton({ uk }: ShowProps) {
  return (
    <>
      <div className="nwt-sky" />

      {/* Leafy apple tree branch at the top */}
      <div className="nwt-branch">
        <span className="nwt-wood" />
        {particles(9, (i) => (
          <span
            key={i}
            className="nwt-leaf"
            style={{
              left: `${18 + i * 8}%`,
              '--rot': `${-28 + (i % 3) * 22}deg`,
              '--s': 0.85 + rnd(i, 1) * 0.45
            } as Vars}
          />
        ))}
      </div>

      {/* Strobe trajectory marks y = ½ g t² */}
      <div className="nwt-strobe">
        {[8, 17, 30, 47, 68].map((top, i) => (
          <span key={i} style={{ top: `${top}%`, '--d': `${0.68 + i * 0.13}s` } as Vars}>
            <i>t = {(i + 1) * 0.1}s</i>
          </span>
        ))}
      </div>

      {/* The hero apple that snaps off the stem and bonks Newton */}
      <div className="nwt-hero-apple">
        <span className="nwt-apple-body">
          <i className="nwt-apple-stem" />
          <i className="nwt-apple-leaf" />
        </span>
      </div>

      {/* Impact burst, flying physics formulas, and Isaac Newton's powdered wig */}
      <div className="nwt-target">
        <div className="nwt-bonk">
          <span className="nwt-bonk-star" />
          <span className="nwt-bonk-word">{uk ? 'БУМ!' : 'BONK!'}</span>
        </div>

        <div className="nwt-ideas">
          {FORMULAS.map((eq, i) => {
            const angle = -70 + (i / (FORMULAS.length - 1)) * 140
            const dist = 160 + (i % 2) * 55
            const rad = (angle * Math.PI) / 180
            return (
              <span
                key={i}
                style={{
                  '--dx': `${Math.sin(rad) * dist}px`,
                  '--dy': `${-Math.cos(rad) * dist - 40}px`,
                  '--rot': `${angle * 0.25}deg`,
                  '--d': `${1.38 + i * 0.07}s`
                } as Vars}
              >
                {eq}
              </span>
            )
          })}
        </div>

        {/* Newton bust with 17th-century powdered curls */}
        <div className="nwt-bust">
          <div className="nwt-wig">
            <i className="curl l1" />
            <i className="curl l2" />
            <i className="curl l3" />
            <i className="curl r1" />
            <i className="curl r2" />
            <i className="curl r3" />
            <div className="nwt-face">
              <b className="eye l" />
              <b className="eye r" />
              <b className="nose" />
              <b className="mouth" />
            </div>
          </div>
          <div className="nwt-collar" />
        </div>
      </div>

      {/* Shower of 24 red and green apples falling and bouncing along the bottom */}
      <div className="nwt-rain">
        {particles(24, (i) => (
          <span
            key={i}
            className="nwt-drop"
            style={{
              left: `${4 + rnd(i, 2) * 92}%`,
              '--d': `${1.45 + rnd(i, 3) * 2.1}s`,
              '--dur': `${1.7 + rnd(i, 4) * 0.7}s`,
              '--drift': `${(rnd(i, 5) - 0.5) * 140}px`,
              '--spin': `${(rnd(i, 6) - 0.5) * 540}deg`,
              '--sz': `${34 + rnd(i, 7) * 22}px`
            } as Vars}
          >
            {i % 4 === 0 ? '🍏' : '🍎'}
          </span>
        ))}
      </div>

      <div className="nwt-banner">
        <div className="nwt-eq">F = G · (m₁ · m₂) / r²</div>
        <div className="nwt-title">{uk ? 'ВСЕСВІТНЄ ТЯЖІННЯ' : 'UNIVERSAL GRAVITATION'}</div>
      </div>
    </>
  )
}

export const newton: Egg = {
  id: 'newton',
  icon: '🍎',
  name: { en: 'Universal Gravitation', uk: 'Всесвітнє тяжіння' },
  how: { en: 'Got g ≈ 9.81 or typed NEWTON on a board', uk: 'Отримати g ≈ 9,81 або набрати NEWTON' },
  life: 7200,
  toastAt: 6100,
  appClass: 'ach-newton',
  Show: Newton,
  answer: (v) => near(v, 9.8, 0.015) || near(v, 9.81, 0.015),
  words: ['NEWTON', 'GRAVITY']
}
