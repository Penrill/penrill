import { usePrefs } from '../store'
import { makeShow } from './show'

/**
 * Easter egg: an answer of exactly 67 does the "six seven" meme: two palms seesawing the 6 and the 7
 * up and down, again and again.
 */
const show = makeShow('sixseven', 5000)

export function maybeSixSeven(value: number): void {
  if (Math.abs(value - 67) < 1e-9) show.earn()
}

export function SixSeven() {
  const uk = usePrefs((s) => s.lang) === 'uk'
  const [run, stop] = show.useShow()
  if (!run) return null
  return (
    <div className="ss" key={run} onPointerDown={stop}>
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
    </div>
  )
}
