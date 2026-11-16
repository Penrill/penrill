import { particles } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import './dejavu.css'

/**
 * Déjà vu (secret medal, not counted in the total): Alt/Option-clicking the achievements switch in
 * the settings unlocks the repeatability panel and plays the black-cat glitch twice in a row.
 */

function DejaVu({ uk }: ShowProps) {
  return (
    <>
      <div className="djv-scanlines" />
      <div className="djv-glitch-bar" />

      <div className="djv-stage">
        {/* Doorway frame where the black cat walks past, glitches back, and walks past again */}
        <div className="djv-doorway">
          <div className="djv-grid-floor" />
          <div className="djv-cat-track">
            <span className="djv-cat-ghost">🐈‍⬛</span>
            <span className="djv-cat">🐈‍⬛</span>
          </div>
          <div className="djv-static" />
        </div>

        {/* Three glowing switches flipping on in sequence */}
        <div className="djv-switches">
          {particles(3, (i) => (
            <span key={i} className="djv-sw" style={{ '--d': `${1.8 + i * 0.22}s` } as Vars}>
              <i />
            </span>
          ))}
        </div>

        <div className="djv-kicker">{uk ? 'ЗБІЙ У МАТРИЦІ · СЕКРЕТ ВІДКРИТО' : 'GLITCH IN THE MATRIX · SECRET UNLOCKED'}</div>
        <div className="djv-title">{uk ? 'ДЕЖАВЮ' : 'DÉJÀ VU'}</div>
        <div className="djv-sub">{uk ? 'Повтори пасхалок тепер доступні в налаштуваннях' : 'Easter egg replays are now open in the settings'}</div>
      </div>
    </>
  )
}

export const dejavu: Egg = {
  id: 'dejavu',
  icon: '🐈‍⬛',
  name: { en: 'Déjà Vu', uk: 'Дежавю' },
  how: { en: 'Alt/Option-clicked the achievements switch', uk: 'Клікнути перемикач досягнень з Alt / Option' },
  life: 5600,
  toastAt: 4400,
  secret: true,
  repeatable: false,
  Show: DejaVu
}
