import { useEffect } from 'react'
import { usePrefs } from '../store'
import { makeShow } from './show'

/** Easter egg: still at it between 3:00 and 4:00 at night? A sleepy owl flies over the board. */
const show = makeShow('owl', 7000)

export function NightOwl() {
  const uk = usePrefs((s) => s.lang) === 'uk'
  const [run, stop] = show.useShow()
  useEffect(() => {
    const check = (): void => void (new Date().getHours() === 3 && show.earn())
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])
  if (!run) return null
  return (
    <div className="owl" key={run} onPointerDown={stop}>
      <div className="owl-night" />
      <div className="owl-flyer">
        <span className="owl-bird">🦉</span>
        <span className="owl-bubble">{uk ? 'Ух-ух… Третя ночі. Може, спати?' : 'Hoo-hoo… 3 a.m. Bedtime, maybe?'}</span>
      </div>
      <span className="owl-zz">z</span>
      <span className="owl-zz">z</span>
      <span className="owl-zz">Z</span>
    </div>
  )
}
