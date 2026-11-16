import { useEffect } from 'react'
import { useSession } from '../../../editorContext'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './bell.css'

/**
 * Saved by the bell: 45 minutes on a board rings a double-dome brass school bell at the top of the
 * screen. Acoustic rings ripple out, a classroom clock hits the 45-minute mark, and folded paper
 * airplanes swoop across the screen amid flying notebook sheets.
 */

const PLANES: Array<{ y: number; d: number; dur: number; tilt: number; scale: number }> = [
  { y: 22, d: 0.3, dur: 3.2, tilt: -8, scale: 1.1 },
  { y: 58, d: 0.7, dur: 2.9, tilt: -14, scale: 1.25 },
  { y: 38, d: 1.1, dur: 3.4, tilt: -5, scale: 0.9 },
  { y: 74, d: 1.4, dur: 3.0, tilt: -18, scale: 1.05 },
  { y: 30, d: 1.9, dur: 2.8, tilt: -10, scale: 0.95 },
  { y: 64, d: 2.3, dur: 3.1, tilt: -12, scale: 1.15 },
  { y: 46, d: 2.7, dur: 2.9, tilt: -7, scale: 1.0 }
]

const ITEMS = ['📐', '📏', '✏️', '📓', '✂️', '📎', '🖍️', '🎒']

function SchoolBell({ uk }: ShowProps) {
  return (
    <>
      <div className="bell-bg" />

      {/* Concentric sound waves radiating from the top bell */}
      <div className="bell-waves">
        {particles(6, (i) => (
          <span key={i} style={{ '--d': `${i * 0.42}s` } as Vars} />
        ))}
      </div>

      {/* Double-dome brass school wall bell at top center */}
      <div className="bell-rig">
        <span className="bell-mount" />
        <span className="bell-dome left" />
        <span className="bell-dome right" />
        <span className="bell-hammer">
          <i className="bell-ball" />
        </span>
        <div className="bell-sparks">
          {particles(10, (i) => (
            <b
              key={i}
              style={{
                '--dx': `${(rnd(i, 1) - 0.5) * 130}px`,
                '--dy': `${10 + rnd(i, 2) * 70}px`,
                '--d': `${(i % 5) * 0.12}s`
              } as Vars}
            />
          ))}
        </div>
      </div>

      {/* Classroom wall clock hitting 45 minutes + banner */}
      <div className="bell-center">
        <div className="bell-clock">
          {particles(12, (i) => (
            <i key={i} className="bell-hour-tick" style={{ transform: `rotate(${i * 30}deg)` }} />
          ))}
          <span className="bell-sector" />
          <span className="bell-hand hour" />
          <span className="bell-hand min" />
          <span className="bell-pin" />
        </div>
        <div className="bell-kicker">{uk ? '45 ХВИЛИН МИНУЛИ' : '45 MINUTES ARE UP'}</div>
        <div className="bell-title">{uk ? 'ПЕРЕРВА!' : 'RECESS!'}</div>
      </div>

      {/* Origami paper airplanes swooping across the classroom */}
      <div className="bell-planes">
        {PLANES.map((p, i) => (
          <div
            key={i}
            className="bell-plane"
            style={{
              top: `${p.y}%`,
              '--d': `${p.d}s`,
              '--dur': `${p.dur}s`,
              '--tilt': `${p.tilt}deg`,
              '--sc': p.scale
            } as Vars}
          >
            <span className="bell-trail" />
            <svg viewBox="0 0 120 70" className="bell-plane-svg" aria-hidden>
              <polygon points="0,28 118,12 48,44" fill="#ffffff" />
              <polygon points="48,44 118,12 58,64" fill="#cbd5e8" />
              <polygon points="58,64 118,12 68,48" fill="#9fb0ce" />
              <polygon points="68,48 118,12 18,54" fill="#eef3fc" />
            </svg>
          </div>
        ))}
      </div>

      {/* Flying school supplies */}
      <div className="bell-confetti">
        {particles(20, (i) => (
          <span
            key={i}
            style={{
              left: `${6 + rnd(i, 3) * 88}%`,
              '--d': `${0.4 + rnd(i, 4) * 1.8}s`,
              '--dx': `${(rnd(i, 5) - 0.5) * 240}px`,
              '--rot': `${(rnd(i, 6) - 0.5) * 720}deg`,
              '--sz': `${30 + rnd(i, 7) * 20}px`
            } as Vars}
          >
            {ITEMS[i % ITEMS.length]}
          </span>
        ))}
      </div>
    </>
  )
}

const LESSON_MS = 45 * 60 * 1000

function useFortyFiveMinutes(play: () => void): void {
  const active = useSession((s) => s.active)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(play, LESSON_MS)
    return () => clearTimeout(t)
  }, [active])
}

export const bell: Egg = {
  id: 'bell',
  icon: '🔔',
  name: { en: 'Saved by the Bell', uk: 'Дзвінок на перерву' },
  how: { en: 'Spent 45 minutes on a board', uk: 'Провести за дошкою цілий урок (45 хв)' },
  life: 7000,
  toastAt: 5800,
  Show: SchoolBell,
  useWatch: useFortyFiveMinutes,
  words: ['RECESS']
}
