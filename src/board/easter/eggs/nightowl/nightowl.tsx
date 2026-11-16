import { useEffect, useRef } from 'react'
import type { Egg, ShowProps } from '../../core/types'
import './nightowl.css'

/** Night owl: still at it between 3:00 and 4:00 at night? A sleepy owl flies over the board. */
function NightOwl({ uk }: ShowProps) {
  return (
    <>
      <div className="owl-night" />
      <div className="owl-flyer">
        <span className="owl-bird">🦉</span>
        <span className="owl-bubble">{uk ? 'Ух-ух… Третя ночі. Може, спати?' : 'Hoo-hoo… 3 a.m. Bedtime, maybe?'}</span>
      </div>
      <span className="owl-zz">z</span>
      <span className="owl-zz">z</span>
      <span className="owl-zz">Z</span>
    </>
  )
}

function useThreeAm(play: () => void): void {
  const fired = useRef(false)
  useEffect(() => {
    const check = (): void => {
      if (new Date().getHours() === 3) {
        if (!fired.current) {
          fired.current = true
          play()
        }
      } else {
        fired.current = false
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [])
}

export const nightowl: Egg = {
  id: 'owl',
  icon: '🦉',
  name: { en: 'Night Owl', uk: 'Нічна сова' },
  how: { en: 'Was on a board at 3 a.m.', uk: 'Сидіти над дошкою о третій ночі' },
  life: 7000,
  Show: NightOwl,
  useWatch: useThreeAm
}
