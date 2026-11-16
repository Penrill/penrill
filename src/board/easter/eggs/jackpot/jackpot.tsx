import { near, type Egg, type ShowProps, type Vars } from '../../core/types'
import { rnd } from '../../core/random'
import './jackpot.css'

/**
 * Jackpot: the first answer that comes out as exactly 777 pulls the lever of a slot machine. The
 * reels spin and land on three sevens, then coins and confetti rain down.
 */

/** How long the whole show lasts, ms. */
const LIFE = 10000
const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '🍉', '💎']
const SPINS = 14

function reel(seed: number): string[] {
  const strip = Array.from({ length: SPINS }, (_, i) => SYMBOLS[(i * 5 + seed * 3) % SYMBOLS.length])
  strip.push('7')
  return strip
}

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

function Jackpot({ uk }: ShowProps) {
  return (
    <>
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
    </>
  )
}

export const jackpot: Egg = {
  id: 'jackpot',
  icon: '🎰',
  name: { en: 'Jackpot', uk: 'Джекпот' },
  how: { en: 'Got 777 as an answer', uk: 'Отримати відповідь 777' },
  life: LIFE,
  toastAt: LIFE - 2500, // the medal shows up as the coins run out
  Show: Jackpot,
  answer: (v) => near(v, 777)
}
