import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { MAX_ZOOM, MIN_ZOOM } from '@inkboard/core/camera'
import { useSession } from '../editorContext'
import { usePrefs } from '../store'
import { makeShow, particles, rnd } from './show'

/**
 * Easter eggs: zooming the board all the way in shows microbes swimming in a drop of water (a
 * microscope); all the way out, planets and stars (a telescope). The view lets the pointer through,
 * so zooming can go on, and leaves by itself.
 */
const LIFE = 5200
const micro = makeShow('microscope', LIFE)
const tele = makeShow('telescope', LIFE)

type Vars = CSSProperties & Record<`--${string}`, string | number>

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

function Microscope() {
  return (
    <div className="lens-view water">
      <div className="caustics" />
      {MICROBES.map(([kind, x1, y1, x2, y2, s, size], i) => (
        <span
          key={i}
          className={`microbe ${kind}`}
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
        <span key={`b${i}`} className="bubble" style={{ left: `${rnd(i, 2) * 100}%`, '--d': `${rnd(i, 3) * 3}s`, '--size': `${6 + rnd(i, 4) * 16}px` } as Vars} />
      ))}
    </div>
  )
}

function Telescope() {
  return (
    <div className="lens-view space">
      <div className="space-drift">
        {particles(70, (i) => (
          <span
            key={i}
            className="twinkle"
            style={{ left: `${rnd(i, 5) * 100}%`, top: `${rnd(i, 6) * 100}%`, '--d': `${rnd(i, 7) * 2}s`, '--size': `${1 + rnd(i, 8) * 2.5}px` } as Vars}
          />
        ))}
        <span className="planet saturn">
          <i className="ring back" />
          <b />
          <i className="ring front" />
        </span>
        <span className="planet earth">
          <b />
          <span className="moonlet" />
        </span>
        <span className="planet mars">
          <b />
        </span>
        <span className="comet" />
      </div>
    </div>
  )
}

export function ZoomEggs() {
  const uk = usePrefs((s) => s.lang) === 'uk'
  const zoom = useSession((s) => s.camera.zoom)
  const [inRun] = micro.useShow()
  const [outRun] = tele.useShow()
  useEffect(() => {
    if (zoom >= MAX_ZOOM * 0.999) micro.earn()
    else if (zoom <= MIN_ZOOM * 1.001) tele.earn()
  }, [zoom])
  const lens = (run: number, view: ReactNode, icon: string, text: string, far: boolean) => (
    <div className={`lens ${far ? 'far' : 'near'}`} key={run}>
      {view}
      <div className="lens-rim" />
      <div className="lens-label">
        <span className="lens-icon">{icon}</span>
        <span>{text}</span>
      </div>
    </div>
  )
  return (
    <>
      {inRun ? lens(inRun, <Microscope />, '🔬', uk ? 'Ой, а тут хтось живе!' : 'Oh, someone lives here!', false) : null}
      {outRun ? lens(outRun, <Telescope />, '🔭', uk ? 'Привіт з орбіти!' : 'Hello from orbit!', true) : null}
    </>
  )
}
