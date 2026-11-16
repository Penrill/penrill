import { useEffect, useRef } from 'react'
import { isChalk } from '../../../engine/surface'
import { usePrefs } from '../../../store'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './flashbang.css'

/**
 * Flashbang: manually switching to the light theme (or from chalkboard to white paper) in the middle
 * of the night (23:00 to 05:00) tosses an M84 stun grenade onto the board. The pin and spoon fly off,
 * the screen goes blinding white with a sonic shockwave and ringing-ears sine wave, then slowly clears.
 */

function isNight(): boolean {
  const h = new Date().getHours()
  return h >= 23 || h < 5
}

function useLightAtNight(play: () => void): void {
  const theme = usePrefs((s) => s.theme)
  const bg = usePrefs((s) => s.background)
  const prevTheme = useRef(theme)
  const prevChalk = useRef(isChalk(bg))

  useEffect(() => {
    const switchedToLightTheme = prevTheme.current !== 'light' && theme === 'light'
    const switchedToWhitePaper = prevChalk.current && !isChalk(bg)
    prevTheme.current = theme
    prevChalk.current = isChalk(bg)
    if ((switchedToLightTheme || switchedToWhitePaper) && isNight()) play()
  }, [theme, bg])
}

function Flashbang({ uk }: ShowProps) {
  return (
    <>
      {/* The M84 stun grenade tossing in before the 0.95 s detonation */}
      <div className="fb-throw">
        <span className="fb-ring-pin" />
        <span className="fb-spoon" />
        <div className="fb-grenade">
          <span className="fb-fuze" />
          <div className="fb-cylinder">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="fb-sparks">
          {particles(10, (i) => (
            <b
              key={i}
              style={{
                '--dx': `${(rnd(i, 1) - 0.5) * 140}px`,
                '--dy': `${-30 - rnd(i, 2) * 90}px`
              } as Vars}
            />
          ))}
        </div>
      </div>

      {/* Blinding whiteout flash at 0.95 s */}
      <div className="fb-whiteout" />

      {/* Supersonic shockwave rings */}
      <div className="fb-shock">
        <span className="r1" />
        <span className="r2" />
      </div>

      {/* Chromatic retina afterimage + tinnitus ringing-ears wave */}
      <div className="fb-afterimage">
        <svg className="fb-sine" viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden>
          <path d="M 0 40 Q 25 5 50 40 T 100 40 T 150 40 T 200 40 T 250 40 T 300 40 T 350 40 T 400 40 T 450 40 T 500 40 T 550 40 T 600 40 T 650 40 T 700 40 T 750 40 T 800 40" />
        </svg>

        <div className="fb-stars">
          {particles(8, (i) => (
            <span key={i} style={{ '--deg': `${i * 45}deg` } as Vars}>
              ✦
            </span>
          ))}
        </div>

        <div className="fb-kicker">{uk ? 'СВІТЛА ТЕМА ОНОЧІ' : 'LIGHT THEME AT NIGHT'}</div>
        <div className="fb-title">{uk ? 'МОЇ ОЧІ!' : 'MY EYES!'}</div>
      </div>
    </>
  )
}

export const flashbang: Egg = {
  id: 'flashbang',
  icon: '💣',
  name: { en: 'Flashbang', uk: 'Світлошумова' },
  how: { en: 'Switched to a bright theme in the middle of the night', uk: 'Увімкнути світлу тему посеред ночі' },
  life: 6500,
  toastAt: 5300,
  Show: Flashbang,
  useWatch: useLightAtNight,
  words: ['FLASHBANG']
}
