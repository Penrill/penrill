import { useEffect, useRef } from 'react'
import { MIN_ZOOM } from '@inkboard/core/camera'
import { useSession } from '../../../editorContext'
import { particles, rnd } from '../../core/random'
import type { Egg, ShowProps, Vars } from '../../core/types'
import { Lens } from '../lens/Lens'
import './telescope.css'

/**
 * Telescope: zooming the board all the way out opens a brass telescope eyepiece onto deep space,
 * with detailed planets (Saturn with the Cassini division, Jupiter with the Great Red Spot and moons,
 * Earth with clouds and Moon, Mars with its polar cap, Neptune) and a twin-tailed comet.
 */
function Telescope({ uk }: ShowProps) {
  return (
    <Lens far icon="🔭" text={uk ? 'Привіт з орбіти!' : 'Hello from orbit!'}>
      <div className="tel-space">
        <div className="tel-drift">
          <div className="tel-nebula" />
          {particles(85, (i) => (
            <span
              key={i}
              className={i % 11 === 0 ? 'tel-star spike' : 'tel-star'}
              style={{
                left: `${rnd(i, 5) * 100}%`,
                top: `${rnd(i, 6) * 100}%`,
                '--d': `${rnd(i, 7) * 2.4}s`,
                '--size': `${1.2 + rnd(i, 8) * 2.8}px`,
                '--hue': i % 3 === 0 ? '#cfe4ff' : i % 3 === 1 ? '#fff4d8' : '#ffffff'
              } as Vars}
            />
          ))}

          {/* Saturn: banded golden globe with concentric A/B/C rings and Cassini division */}
          <div className="tel-planet tel-saturn">
            <span className="tel-saturn-ring back" />
            <span className="tel-saturn-globe">
              <i className="tel-saturn-shadow" />
            </span>
            <span className="tel-saturn-ring front" />
          </div>

          {/* Jupiter: swirling belts, zones, the Great Red Spot and two Galilean moons */}
          <div className="tel-planet tel-jupiter">
            <span className="tel-jup-globe">
              <i className="tel-jup-spot" />
              <i className="tel-jup-shade" />
            </span>
            <span className="tel-moon io" />
            <span className="tel-moon europa" />
          </div>

          {/* Earth: oceans, continents, polar cap, drifting cloud layer, atmosphere glow and Moon */}
          <div className="tel-planet tel-earth">
            <span className="tel-earth-globe">
              <i className="tel-earth-land" />
              <i className="tel-earth-clouds" />
              <i className="tel-earth-shade" />
            </span>
            <span className="tel-moon luna" />
          </div>

          {/* Mars: rusty globe with north polar ice cap and canyon */}
          <div className="tel-planet tel-mars">
            <span className="tel-mars-globe">
              <i className="tel-mars-cap" />
              <i className="tel-mars-canyon" />
            </span>
          </div>

          {/* Neptune: deep azure ice giant with a faint tilted ring */}
          <div className="tel-planet tel-neptune">
            <span className="tel-nep-ring back" />
            <span className="tel-nep-globe" />
            <span className="tel-nep-ring front" />
          </div>

          {/* Comet with blue ion tail and curved golden dust tail */}
          <span className="tel-comet">
            <i className="tel-comet-ion" />
            <i className="tel-comet-dust" />
          </span>
        </div>
      </div>
    </Lens>
  )
}

function useZoomedOut(play: () => void): void {
  const zoom = useSession((s) => s.camera.zoom)
  const atEdge = useRef(false)
  useEffect(() => {
    if (zoom <= MIN_ZOOM * 1.001) {
      if (!atEdge.current) {
        atEdge.current = true
        play()
      }
    } else if (zoom > MIN_ZOOM * 1.05) {
      atEdge.current = false
    }
  }, [zoom])
}

export const telescope: Egg = {
  id: 'telescope',
  icon: '🔭',
  name: { en: 'Telescope', uk: 'Телескоп' },
  how: { en: 'Zoomed all the way out', uk: 'Віддалити дошку до краю' },
  life: 5800,
  passThrough: true,
  Show: Telescope,
  useWatch: useZoomedOut
}
