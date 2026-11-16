import { near, type Egg, type ShowProps, type Vars } from '../../core/types'
import './pi.css'

/**
 * Archimedes' constant (π): an answer of 3.14159… sends 96 digits of π spiraling out in an
 * Archimedean vortex around inscribed polygons, while a wheel of diameter 1 rolls one full turn
 * along a number line and unrolls its circumference onto the exact mark π.
 */

const DIGITS = '3.141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117'
const PALETTE = ['#ff6b8b', '#ffd166', '#4ce0b3', '#5ec8ff', '#c28dff', '#ff9b54', '#7bf1a8', '#ff75d8', '#9be2ff', '#fff29c']

function PiShow({ uk }: ShowProps) {
  return (
    <>
      <div className="pi-bg" />

      {/* Archimedean spiral of 96 digits of π */}
      <div className="pi-vortex">
        {[...DIGITS].map((ch, i) => {
          const deg = i * 21
          const r = 11 + i * 0.36
          const color = ch === '.' ? '#ffffff' : PALETTE[Number(ch) % PALETTE.length]
          return (
            <span
              key={i}
              className="pi-digit"
              style={{
                '--deg': `${deg}deg`,
                '--r': `${r}vmin`,
                '--d': `${0.15 + i * 0.024}s`,
                '--c': color,
                '--sz': `${Math.max(13, 25 - i * 0.11)}px`
              } as Vars}
            >
              {ch}
            </span>
          )
        })}
      </div>

      <div className="pi-stage">
        {/* Center emblem: Archimedes inscribed & circumscribed polygons around π */}
        <div className="pi-emblem">
          <svg viewBox="-100 -100 200 200" className="pi-poly-svg" aria-hidden>
            <polygon
              className="pi-poly outer"
              points="0,-92 80,-46 80,46 0,92 -80,46 -80,-46"
            />
            <circle cx="0" cy="0" r="78" className="pi-circle" />
            <polygon
              className="pi-poly inner"
              points="0,-78 39,-67.5 67.5,-39 78,0 67.5,39 39,67.5 0,78 -39,67.5 -67.5,39 -78,0 -67.5,-39 -39,-67.5"
            />
          </svg>
          <span className="pi-glyph">π</span>
        </div>

        {/* Unrolling circle of diameter d = 1 along the number line 0 .. 4 */}
        <div className="pi-ruler-wrap">
          <svg viewBox="0 0 620 145" className="pi-roll-svg" aria-hidden>
            {/* Number line 0 to 4 (1 unit = 120px, origin at x = 70, y = 100) */}
            <line x1="40" y1="100" x2="580" y2="100" className="pi-axis" />
            {[0, 1, 2, 3, 4].map((n) => {
              const x = 70 + n * 120
              return (
                <g key={n}>
                  <line x1={x} y1="93" x2={x} y2="107" className="pi-tick" />
                  <text x={x} y="128" className="pi-tick-label">{n}</text>
                </g>
              )
            })}

            {/* Unrolled circumference line from x = 70 to x = 70 + 120 * π = 446.99 */}
            <line x1="70" y1="100" x2="447" y2="100" className="pi-unrolled" pathLength={100} />

            {/* Target mark at π ≈ 3.14159 (x = 447) */}
            <g className="pi-mark-pi">
              <line x1="447" y1="84" x2="447" y2="112" className="pi-pi-tick" />
              <text x="447" y="135" className="pi-pi-label">π ≈ 3.14159…</text>
            </g>

            {/* Rolling wheel of diameter d = 1 (120px → radius 38.2px so 2πr = 120*π? Wait: circumference = π*d, so if 1 unit = 120px and d = 1 unit, r = 60px and 1 turn = 120*π = 377px!) */}
            <g className="pi-wheel-mover">
              <g className="pi-wheel-spinner">
                <circle cx="0" cy="0" r="38" className="pi-wheel-rim" />
                <line x1="-38" y1="0" x2="38" y2="0" className="pi-spoke" />
                <line x1="0" y1="-38" x2="0" y2="38" className="pi-spoke" />
                <circle cx="0" cy="38" r="5" className="pi-wheel-dot" />
              </g>
            </g>
          </svg>
        </div>

        <div className="pi-title">{uk ? 'ЧИСЛО ПІ · C = πd' : 'ARCHIMEDES’ CONSTANT · C = πd'}</div>
      </div>
    </>
  )
}

export const pi: Egg = {
  id: 'pi',
  icon: '🥧',
  name: { en: 'Archimedes’ Constant', uk: 'Число Пі' },
  how: { en: 'Got π ≈ 3.14159 as an answer', uk: 'Отримати у відповіді π ≈ 3,14159' },
  life: 8000,
  toastAt: 6800,
  Show: PiShow,
  answer: (v) => near(v, Math.PI, 0.002),
  words: ['ARCHIMEDES']
}
