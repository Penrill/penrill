import { useEffect, useState, type CSSProperties } from 'react'
import { usePrefs } from '../store'
import { canEarn, unlock } from './achievements'
import './jackpot.css'

/**
 * Easter egg: with achievements on, the first answer that comes out as exactly 777 spins a little
 * slot machine and earns the "Jackpot" medal. Only once: after that it is a plain answer again.
 */
const listeners = new Set<() => void>()

/** Plays the jackpot if `value` is 777 and the Jackpot achievement can still be earned. */
export function maybeJackpot(value: number): void {
  if (Math.abs(value - 777) > 1e-9 || !canEarn('jackpot')) return
  unlock('jackpot', LIFE - 2500) // the medal shows up as the coins run out
  listeners.forEach((f) => f())
}

/** How long the whole show lasts, in ms (keep in step with jackpot-life in the CSS). */
const LIFE = 10000
const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '🍉', '💎']
const SPINS = 14

function reel(seed: number): string[] {
  const strip = Array.from({ length: SPINS }, (_, i) => SYMBOLS[(i * 5 + seed * 3) % SYMBOLS.length])
  strip.push('7')
  return strip
}

/** A cheap repeatable "random" number in [0, 1), so the show looks the same every time. */
const rnd = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

type Vars = CSSProperties & Record<`--${string}`, string | number>

/** Light bulbs around the machine, clockwise from the top left corner. */
const BULBS: Vars[] = (() => {
  const out: Array<[number, number]> = []
  const across = 12
  const down = 5
  for (let i = 0; i < across; i++) out.push([(i / (across - 1)) * 100, 0])
  for (let i = 1; i < down; i++) out.push([100, (i / down) * 100])
  for (let i = across - 1; i >= 0; i--) out.push([(i / (across - 1)) * 100, 100])
  for (let i = down - 1; i >= 1; i--) out.push([0, (i / down) * 100])
  return out.map(([x, y], i) => ({ left: `${x}%`, top: `${y}%`, '--i': i % 3 }))
})()

/** Coins raining down from the top. */
const RAIN: Vars[] = Array.from({ length: 60 }, (_, i) => ({
  left: `${rnd(i, 1) * 100}%`,
  '--size': `${22 + rnd(i, 2) * 18}px`,
  '--delay': `${2 + rnd(i, 3) * 3.5}s`,
  '--fall': `${1.9 + rnd(i, 4) * 1.4}s`,
  '--flip': `${0.45 + rnd(i, 5) * 0.6}s`,
  '--sway': `${(rnd(i, 6) - 0.5) * 120}px`
}))

const CONFETTI_COLORS = ['#ff3b5c', '#ffd54a', '#3bd16f', '#3ba8ff', '#b46bff', '#ff8a1f', '#ffffff']

/** Paper bits tumbling down from the top. */
const CONFETTI: Vars[] = Array.from({ length: 110 }, (_, i) => ({
  left: `${rnd(i, 13) * 100}%`,
  '--paint': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  width: `${7 + rnd(i, 14) * 6}px`,
  height: `${10 + rnd(i, 15) * 8}px`,
  borderRadius: i % 4 === 0 ? '50%' : '1px',
  '--delay': `${2 + rnd(i, 16) * 4}s`,
  '--fall': `${2.6 + rnd(i, 17) * 2}s`,
  '--tumble': `${0.5 + rnd(i, 18) * 0.7}s`,
  '--sway': `${(rnd(i, 19) - 0.5) * 220}px`,
  '--twist': `${(rnd(i, 20) - 0.5) * 1440}deg`
}))

/** Coins shot up out of the machine when it hits. */
const FOUNTAIN: Vars[] = Array.from({ length: 26 }, (_, i) => ({
  '--size': `${24 + rnd(i, 7) * 16}px`,
  '--delay': `${1.95 + rnd(i, 8) * 0.5}s`,
  '--fall': `${1.6 + rnd(i, 9) * 0.8}s`,
  '--flip': `${0.35 + rnd(i, 10) * 0.4}s`,
  '--dx': `${(rnd(i, 11) - 0.5) * 900}px`,
  '--up': `${-(180 + rnd(i, 12) * 260)}px`
}))

/** A gold coin with two faces and an edge, so it looks solid while it turns over. */
function Coin({ style, className }: { style: Vars; className: string }) {
  return (
    <span className={className} style={style}>
      <span className="jackpot-coin">
        <span className="jackpot-coin-face" />
        <span className="jackpot-coin-edge" />
        <span className="jackpot-coin-face jackpot-coin-back" />
      </span>
    </span>
  )
}

export function Jackpot() {
  const uk = usePrefs((s) => s.lang) === 'uk'
  const [run, setRun] = useState(0)
  useEffect(() => {
    const play = (): void => setRun((n) => n + 1)
    listeners.add(play)
    return () => void listeners.delete(play)
  }, [])
  useEffect(() => {
    if (!run) return
    const id = setTimeout(() => setRun(0), LIFE)
    return () => clearTimeout(id)
  }, [run])
  if (!run) return null
  return (
    <div className="jackpot" key={run} aria-live="polite" onPointerDown={() => setRun(0)}>
      <div className="jackpot-rays" />
      <div className="jackpot-flash" />
      <div className="jackpot-stage">
        <div className="jackpot-machine">
          {BULBS.map((b, i) => (
            <span key={i} className="jackpot-bulb" style={b} />
          ))}
          <div className="jackpot-sign">{uk ? '★ ЩАСЛИВА СІМКА ★' : '★ LUCKY SEVENS ★'}</div>
          <div className="jackpot-reels">
            {[0, 1, 2].map((r) => (
              <div key={r} className="jackpot-window">
                <div className="jackpot-strip" style={{ '--n': SPINS, '--spin': `${0.9 + r * 0.35}s` } as Vars}>
                  {reel(r).map((s, i) => (
                    <span key={i} className={s === '7' ? 'jackpot-seven' : undefined}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="jackpot-title">{uk ? 'ДЖЕКПОТ!' : 'JACKPOT!'}</div>
          <div className="jackpot-lever">
            <span className="jackpot-lever-arm" />
          </div>
          <div className="jackpot-fountain">
            {FOUNTAIN.map((c, i) => (
              <Coin key={i} className="jackpot-jet" style={c} />
            ))}
          </div>
        </div>
      </div>
      <div className="jackpot-rain">
        {CONFETTI.map((c, i) => (
          <span key={i} className="jackpot-confetti" style={c}>
            <span />
          </span>
        ))}
        {RAIN.map((c, i) => (
          <Coin key={i} className="jackpot-drop" style={c} />
        ))}
      </div>
    </div>
  )
}
