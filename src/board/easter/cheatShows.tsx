import { useEffect, useState, type CSSProperties, type FC } from 'react'
import { particles, rnd } from './show'

/** The shows the GTA cheat codes play (cheats.tsx); styles in cheats.css. */

type Vars = CSSProperties & Record<`--${string}`, string | number>
export type ShowId = 'health' | 'tank' | 'nowanted' | 'wanted' | 'rocketman' | 'bigbang' | 'storm' | 'skyfall' | 'floater'
interface ShowDef {
  /** How long it runs, ms. */
  life: number
  /** A class put on <html> while it runs (for effects on the whole app). */
  appClass?: string
  Show: FC<{ uk: boolean }>
}

// ---------------------------------------------------------------- shared pieces

/** A fireball with a flash, a shock ring, smoke, flying debris and embers. */
function Explosion({ className }: { className: string }) {
  return (
    <div className={`boom ${className}`}>
      <span className="boom-flash" />
      <span className="boom-ring" />
      {particles(7, (i) => (
        <span
          key={`s${i}`}
          className="boom-smoke"
          style={{ '--dx': `${(rnd(i, 1) - 0.5) * 220}px`, '--dy': `${-60 - rnd(i, 2) * 160}px`, '--d': `${0.15 + rnd(i, 3) * 0.3}s`, '--s': 0.8 + rnd(i, 4) * 0.8 } as Vars}
        />
      ))}
      <span className="boom-fire" />
      <span className="boom-core" />
      {particles(22, (i) => {
        const a = (i / 22) * Math.PI * 2 + rnd(i, 5)
        const r = 160 + rnd(i, 6) * 260
        return (
          <span
            key={`d${i}`}
            className="boom-debris"
            style={{ '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r - 80}px`, '--rot': `${(rnd(i, 7) - 0.5) * 1440}deg`, '--w': `${4 + rnd(i, 8) * 9}px` } as Vars}
          />
        )
      })}
      {particles(26, (i) => (
        <span
          key={`e${i}`}
          className="boom-ember"
          style={{ '--dx': `${(rnd(i, 9) - 0.5) * 420}px`, '--dy': `${-120 - rnd(i, 10) * 320}px`, '--d': `${0.1 + rnd(i, 11) * 0.5}s` } as Vars}
        />
      ))}
    </div>
  )
}

/** Red and blue lights flashing at the screen edges. */
function Police({ fade }: { fade?: boolean }) {
  return (
    <div className={`police ${fade ? 'fade' : ''}`}>
      <i className="red" />
      <i className="blue" />
      <span className="police-bar">
        <b />
        <b />
      </span>
    </div>
  )
}

function Stars({ mode }: { mode: 'in' | 'out' }) {
  return (
    <div className={`wanted ${mode}`}>
      {particles(6, (i) => (
        <span key={i} style={{ '--d': `${0.5 + (mode === 'in' ? i : 5 - i) * 0.38}s` } as Vars}>
          ★
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- HESOYAM / TURTLE / ASPIRINE

function useCount(to: number, ms: number, delay: number): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now() + delay
    const tick = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - start) / ms))
      setV(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms, delay])
  return v
}

function Health() {
  const money = useCount(250000, 1800, 300)
  return (
    <>
      <div className="hp-glow" />
      <div className="hud">
        <div className="hud-money">${money.toLocaleString('en-US')}</div>
        <div className="hud-bar hp">
          <i />
        </div>
        <div className="hud-bar ar">
          <i />
        </div>
      </div>
      <div className="hp-rise">
        {particles(18, (i) => (
          <span
            key={i}
            className={i % 3 === 0 ? 'bill' : 'heart'}
            style={{ left: `${8 + rnd(i, 1) * 84}%`, '--d': `${0.2 + rnd(i, 2) * 2.2}s`, '--sway': `${(rnd(i, 3) - 0.5) * 120}px`, '--s': 0.7 + rnd(i, 4) * 0.8 } as Vars}
          >
            {i % 3 === 0 ? '💵' : '❤'}
          </span>
        ))}
      </div>
      <div className="hp-plus">+ 100% + $250,000</div>
    </>
  )
}

// ---------------------------------------------------------------- PANZER / AIWPRTON

function Tank() {
  return (
    <>
      <div className="tank">
        <div className="tank-dust">
          {particles(8, (i) => (
            <span key={i} style={{ '--d': `${i * 0.12}s`, '--y': `${rnd(i, 1) * 20}px` } as Vars} />
          ))}
        </div>
        <div className="tank-rumble">
          <div className="tank-turret">
            <span className="tank-hatch" />
            <span className="tank-antenna" />
            <span className="tank-barrel">
              <span className="tank-muzzle" />
            </span>
          </div>
          <div className="tank-body" />
          <div className="tank-tracks">
            {particles(7, (i) => (
              <span key={i} />
            ))}
          </div>
        </div>
        <span className="tank-shell" />
      </div>
      <Explosion className="tank-hit" />
    </>
  )
}

// ---------------------------------------------------------------- AEZAKMI / LAWYERUP and FUGITIVE

function NoWanted() {
  return (
    <>
      <Police fade />
      <Stars mode="out" />
    </>
  )
}

function Wanted() {
  return (
    <>
      <Police />
      <Stars mode="in" />
    </>
  )
}

// ---------------------------------------------------------------- ROCKETMAN / YECGAA: a glam rock show

const GLITTER_COLORS = ['#ff4fd8', '#ffd54a', '#7af6ff', '#b46bff', '#ffffff', '#ff8a3d', '#5dff9a']
const WHITE_KEYS = 22
/** Black keys sit after these white keys in every octave (C# D# · F# G# A#). */
const BLACK_AFTER = [0, 1, 3, 4, 5]

function RocketMan() {
  return (
    <>
      <div className="glam-stage" />
      <div className="glam-spots">
        {['#ff4fd8', '#ffd54a', '#7af6ff', '#b46bff'].map((c, i) => (
          <span key={i} style={{ '--c': c, '--x': `${12 + i * 25}%`, '--d': `${i * -0.7}s` } as Vars} />
        ))}
      </div>
      <div className="glam-glitter">
        {particles(90, (i) => (
          <span
            key={i}
            className={i % 4 === 0 ? 'star' : undefined}
            style={{
              left: `${rnd(i, 1) * 100}%`,
              '--c': GLITTER_COLORS[i % GLITTER_COLORS.length],
              '--d': `${rnd(i, 2) * 4}s`,
              '--fall': `${2.4 + rnd(i, 3) * 2.4}s`,
              '--sway': `${(rnd(i, 4) - 0.5) * 160}px`,
              '--size': `${4 + rnd(i, 5) * 8}px`
            } as Vars}
          />
        ))}
      </div>
      <div className="glam-feathers">
        {particles(12, (i) => (
          <span
            key={i}
            style={{ left: `${rnd(i, 6) * 100}%`, '--d': `${0.6 + rnd(i, 7) * 3}s`, '--h': `${rnd(i, 8) * 360}deg`, '--sway': `${(rnd(i, 9) - 0.5) * 240}px` } as Vars}
          >
            🪶
          </span>
        ))}
      </div>
      <div className="glam-rocket">
        <span className="glam-trail" />
        <span className="glam-flame" />
        <span className="glam-fin l" />
        <span className="glam-fin r" />
        <span className="glam-hull">
          <span className="glam-window">★</span>
        </span>
        <span className="glam-nose" />
      </div>
      <div className="glam-glasses">
        <span className="glam-star l">
          <i />
        </span>
        <span className="glam-bridge" />
        <span className="glam-star r">
          <i />
        </span>
        {particles(8, (i) => (
          <b key={i} className="glam-twinkle" style={{ left: `${rnd(i, 10) * 100}%`, top: `${rnd(i, 11) * 100}%`, '--d': `${0.8 + rnd(i, 12) * 1.6}s` } as Vars}>
            ✦
          </b>
        ))}
      </div>
      <div className="glam-title">
        {'ROCKET MAN'.split('').map((ch, i) => (
          <span key={i} style={{ '--d': `${1 + i * 0.06}s` } as Vars}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </div>
      <div className="glam-piano">
        {particles(WHITE_KEYS, (i) => (
          <span key={i} className="white" style={{ '--d': `${0.5 + Math.abs(i - WHITE_KEYS / 2) * 0.07}s` } as Vars} />
        ))}
        {particles(WHITE_KEYS - 1, (i) =>
          BLACK_AFTER.includes(i % 7) ? (
            <span key={`b${i}`} className="black" style={{ left: `calc(${((i + 1) / WHITE_KEYS) * 100}% - 1.2%)`, '--d': `${0.55 + Math.abs(i - WHITE_KEYS / 2) * 0.07}s` } as Vars} />
          ) : null
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- BIGBANG / CPKTNWT

function BigBang() {
  return (
    <>
      <div className="bang-white" />
      <Explosion className="bang-main" />
    </>
  )
}

// ---------------------------------------------------------------- MAKEITRAIN / AUIFRVQS

function Storm() {
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
    </>
  )
}

// ---------------------------------------------------------------- SKYFALL

function Skyfall() {
  return (
    <>
      <div className="sky-bg" />
      <div className="sky-clouds fast">
        {particles(9, (i) => (
          <span key={i} style={{ left: `${rnd(i, 1) * 90}%`, '--d': `${-rnd(i, 2) * 0.9}s`, '--s': 0.7 + rnd(i, 3) * 0.9 } as Vars} />
        ))}
      </div>
      <div className="sky-clouds slow">
        {particles(6, (i) => (
          <span key={i} style={{ left: `${rnd(i, 4) * 90}%`, '--d': `${-rnd(i, 5) * 4}s`, '--s': 0.7 + rnd(i, 6) * 0.9 } as Vars} />
        ))}
      </div>
      <div className="sky-wind">
        {particles(26, (i) => (
          <span key={i} style={{ left: `${rnd(i, 7) * 100}%`, '--d': `${-rnd(i, 8) * 0.5}s`, '--len': `${60 + rnd(i, 9) * 120}px` } as Vars} />
        ))}
      </div>
      <span className="sky-diver">🤸</span>
      <span className="sky-chute">🪂</span>
    </>
  )
}

// ---------------------------------------------------------------- FLOATER / BUBBLECARS: moon gravity

function Floater() {
  const things = ['✏️', '📐', '📏', '🧮', '📎', '✂️', '🖍️', '📓', '🔺', '⚽', '🍎', '🪐']
  return (
    <>
      <div className="moon-sky" />
      <div className="moon">
        <i />
        <i />
        <i />
      </div>
      <div className="float-things">
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
            {things[i % things.length]}
          </span>
        ))}
      </div>
    </>
  )
}

export const SHOWS: Record<ShowId, ShowDef> = {
  health: { life: 5200, Show: Health },
  tank: { life: 6200, Show: Tank, appClass: 'ach-rumble' },
  nowanted: { life: 5200, Show: NoWanted },
  wanted: { life: 5200, Show: Wanted },
  rocketman: { life: 8000, Show: RocketMan },
  bigbang: { life: 5000, Show: BigBang, appClass: 'ach-bang' },
  storm: { life: 6500, Show: Storm },
  skyfall: { life: 6800, Show: Skyfall },
  floater: { life: 7000, Show: Floater, appClass: 'ach-float' }
}
