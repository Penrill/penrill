import { useEffect, useRef } from 'react'
import { MAX_ZOOM } from '@inkboard/core/camera'
import { useSession } from '../../../editorContext'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import { Lens } from '../lens/Lens'
import './microscope.css'

/**
 * Microscope: zooming the board all the way in shows microbes swimming in a drop of water around it.
 * The pointer goes through, so zooming can go on.
 */

/** Microbes: [kind, start x %, start y %, end x %, end y %, seconds, size]. */
const MICROBES: Array<[string, number, number, number, number, number, number]> = [
  ['amoeba', 20, 30, 45, 55, 4.6, 1.1],
  ['amoeba', 70, 65, 50, 35, 5.2, 0.8],
  ['para', 10, 70, 80, 25, 3.8, 1],
  ['para', 85, 80, 25, 15, 4.4, 0.8],
  ['rod', 30, 15, 60, 80, 3.2, 1],
  ['rod', 60, 20, 35, 70, 2.8, 0.8],
  ['rod', 75, 45, 55, 85, 3.6, 0.9],
  ['cutie', 40, 70, 60, 40, 4, 1]
]

function Microscope({ uk }: ShowProps) {
  return (
    <Lens icon="🔬" text={uk ? 'Ой, а тут хтось живе!' : 'Oh, someone lives here!'}>
      <div className="mic-water">
        <div className="mic-caustics" />
        {MICROBES.map(([kind, x1, y1, x2, y2, s, size], i) => (
          <span
            key={i}
            className={`mic-microbe ${kind}`}
            style={{ '--x1': x1, '--y1': y1, '--x2': x2, '--y2': y2, '--t': `${s}s`, '--k': size, '--r': `${(rnd(i, 1) - 0.5) * 120}deg` } as Vars}
          >
            <i />
            {kind === 'cutie' && (
              <>
                <b />
                <b />
              </>
            )}
          </span>
        ))}
        {particles(16, (i) => (
          <span key={`b${i}`} className="mic-bubble" style={{ left: `${rnd(i, 2) * 100}%`, '--d': `${rnd(i, 3) * 3}s`, '--size': `${6 + rnd(i, 4) * 16}px` } as Vars} />
        ))}
      </div>
    </Lens>
  )
}

function useZoomedIn(play: () => void): void {
  const zoom = useSession((s) => s.camera.zoom)
  const atEdge = useRef(false)
  useEffect(() => {
    if (zoom >= MAX_ZOOM * 0.999) {
      if (!atEdge.current) {
        atEdge.current = true
        play()
      }
    } else if (zoom < MAX_ZOOM * 0.95) {
      atEdge.current = false
    }
  }, [zoom])
}

export const microscope: Egg = {
  id: 'microscope',
  icon: '🔬',
  name: { en: 'Microscope', uk: 'Мікроскоп' },
  how: { en: 'Zoomed all the way in', uk: 'Наблизити дошку до краю' },
  life: 5200,
  passThrough: true,
  Show: Microscope,
  useWatch: useZoomedIn
}
