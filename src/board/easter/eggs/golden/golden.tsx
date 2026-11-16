import { particles } from '../../core/random'
import { near, type Egg, type ShowProps, type Vars } from '../../core/types'
import './golden.css'

/**
 * Golden ratio: an answer of φ = (1 + √5) / 2 ≈ 1.618 unfolds the eight Fibonacci squares one by
 * one, draws the golden spiral through their corners, shimmers nautilus shell chambers over them,
 * and blooms a sunflower of 96 seeds arranged at the golden angle 137.508°.
 */

const PHI = (1 + Math.sqrt(5)) / 2
const GOLDEN_ANGLE = 137.50776405003785

/** Exact Fibonacci squares inside a 340 × 210 golden rectangle, from smallest (1) to largest (21). */
const SQUARES: Array<{ n: number; x: number; y: number; s: number; hue: string }> = [
  { n: 1, x: 240, y: 150, s: 10, hue: 'rgba(255, 232, 140, 0.28)' },
  { n: 1, x: 250, y: 150, s: 10, hue: 'rgba(255, 215, 105, 0.25)' },
  { n: 2, x: 240, y: 130, s: 20, hue: 'rgba(255, 198, 85, 0.22)' },
  { n: 3, x: 210, y: 130, s: 30, hue: 'rgba(245, 178, 70, 0.20)' },
  { n: 5, x: 210, y: 160, s: 50, hue: 'rgba(235, 155, 58, 0.18)' },
  { n: 8, x: 260, y: 130, s: 80, hue: 'rgba(220, 135, 48, 0.16)' },
  { n: 13, x: 210, y: 0, s: 130, hue: 'rgba(200, 118, 40, 0.15)' },
  { n: 21, x: 0, y: 0, s: 210, hue: 'rgba(180, 100, 32, 0.14)' }
]

/** Exact quarter-circle arcs spiraling outward from the 1×1 core to the 21×21 square. */
const SPIRAL_PATH =
  'M 240 150 A 10 10 0 0 0 250 160 A 10 10 0 0 0 260 150 A 20 20 0 0 0 240 130 A 30 30 0 0 0 210 160 A 50 50 0 0 0 260 210 A 80 80 0 0 0 340 130 A 130 130 0 0 0 210 0 A 210 210 0 0 0 0 210'

/** Nautilus septa (chamber dividers) along each quarter turn. */
const SEPTA = [
  'M 240 160 Q 248 153 260 150',
  'M 240 150 Q 244 138 240 130',
  'M 240 160 Q 223 152 210 160',
  'M 260 160 Q 252 188 260 210',
  'M 260 130 Q 302 142 340 130',
  'M 210 130 Q 230 62 210 0',
  'M 210 210 Q 95 182 0 210'
]

function Golden({ uk }: ShowProps) {
  return (
    <>
      <div className="phi-bg" />

      {/* Vogel phyllotaxis sunflower: 96 seeds at multiples of the golden angle 137.508° */}
      <div className="phi-floret">
        {particles(96, (i) => {
          const r = Math.sqrt(i + 1) * 4.4
          const deg = (i * GOLDEN_ANGLE) % 360
          return (
            <span
              key={i}
              style={{
                '--deg': `${deg}deg`,
                '--r': `${r}vmin`,
                '--d': `${0.4 + i * 0.022}s`,
                '--s': `${4 + (i / 96) * 6}px`
              } as Vars}
            />
          )
        })}
      </div>

      <div className="phi-stage">
        <svg className="phi-svg" viewBox="-8 -8 356 226" aria-hidden>
          <defs>
            <linearGradient id="phi-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff7c2" />
              <stop offset="45%" stopColor="#ffd447" />
              <stop offset="100%" stopColor="#e08b19" />
            </linearGradient>
            <linearGradient id="phi-shell" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255, 214, 102, 0.35)" />
              <stop offset="50%" stopColor="rgba(255, 160, 120, 0.25)" />
              <stop offset="100%" stopColor="rgba(255, 248, 210, 0.42)" />
            </linearGradient>
          </defs>

          {/* The 8 Fibonacci squares unfolding in sequence */}
          {SQUARES.map((sq, i) => (
            <g key={i} className="phi-sq" style={{ '--d': `${0.15 + i * 0.22}s` } as Vars}>
              <rect x={sq.x} y={sq.y} width={sq.s} height={sq.s} fill={sq.hue} stroke="#ffd56b" strokeWidth="1.2" />
              {sq.s >= 20 && (
                <text x={sq.x + sq.s / 2} y={sq.y + sq.s / 2} className="phi-num" fontSize={Math.max(8, sq.s * 0.24)}>
                  {sq.n}
                </text>
              )}
            </g>
          ))}

          {/* Nautilus shell pearlescent chambers */}
          {SEPTA.map((d, i) => (
            <path key={i} d={d} className="phi-septum" style={{ '--d': `${1.9 + i * 0.14}s` } as Vars} />
          ))}

          {/* The golden spiral glow and crisp stroke */}
          <path d={SPIRAL_PATH} className="phi-spiral-glow" pathLength={1000} />
          <path d={SPIRAL_PATH} className="phi-spiral" stroke="url(#phi-gold)" pathLength={1000} />
        </svg>

        <div className="phi-formula">φ = (1 + √5) / 2 ≈ 1.6180339887…</div>
        <div className="phi-seq">1 · 1 · 2 · 3 · 5 · 8 · 13 · 21 · 34 · 55 · 89 · 144</div>
        <div className="phi-title">{uk ? 'ЗОЛОТИЙ ПЕРЕТИН' : 'GOLDEN RATIO'}</div>
      </div>
    </>
  )
}

export const golden: Egg = {
  id: 'golden',
  icon: '🐚',
  name: { en: 'Golden Ratio', uk: 'Золотий перетин' },
  how: { en: 'Got φ ≈ 1.618 as an answer', uk: 'Отримати у відповіді φ ≈ 1,618' },
  life: 8000,
  toastAt: 6800,
  Show: Golden,
  answer: (v) => near(v, PHI, 0.002),
  words: ['FIBONACCI', 'GOLDEN']
}
