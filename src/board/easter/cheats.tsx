import { useEffect, useState } from 'react'
import { useEditor } from '../editorContext'
import { usePrefs } from '../store'
import { canEarn, unlock, useAchievements } from './achievements'
import { SHOWS, type ShowId } from './cheatShows'
import './cheats.css'

/**
 * Easter egg: GTA cheat codes (Vice City, San Andreas, GTA V), typed on a board outside any text
 * field. Codes that do the same thing in different games share one show and one medal. Like every
 * egg, each show plays once (while achievements are on) and earns its medal.
 *
 * The letters also reach the board's own shortcuts (P pen, R ruler, S set square…), so the tools and
 * instruments are put back as they were before the code's first letter once it is complete.
 */
export const CODES: Record<string, ShowId> = {
  HESOYAM: 'health', // San Andreas
  ASPIRINE: 'health', // Vice City
  TURTLE: 'health', // GTA V
  PANZER: 'tank', // Vice City
  AIWPRTON: 'tank', // San Andreas
  AEZAKMI: 'nowanted', // San Andreas
  LEAVEMEALONE: 'nowanted', // Vice City
  LAWYERUP: 'nowanted', // GTA V
  FUGITIVE: 'wanted', // GTA V
  OSRBLHH: 'wanted', // San Andreas
  ROCKETMAN: 'rocketman', // San Andreas
  YECGAA: 'rocketman', // San Andreas
  BIGBANG: 'bigbang', // Vice City
  CPKTNWT: 'bigbang', // San Andreas
  MAKEITRAIN: 'storm', // GTA V
  AUIFRVQS: 'storm', // San Andreas
  SKYFALL: 'skyfall', // GTA V
  FLOATER: 'floater', // GTA V
  BUBBLECARS: 'floater' // San Andreas
}
const LONGEST = Math.max(...Object.keys(CODES).map((c) => c.length))

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
}

type Snapshot = Record<string, unknown>

export function Cheats() {
  const editor = useEditor()
  const { on } = useAchievements()
  const uk = usePrefs((s) => s.lang) === 'uk'
  const [show, setShow] = useState<{ id: ShowId; n: number } | null>(null)

  useEffect(() => {
    if (!on) return
    // The last letters typed, each with the tools as they were just before it.
    let typed: Array<{ ch: string; before: Snapshot }> = []
    const snapshot = (): Snapshot => {
      const s = editor.session.getState()
      return { tool: s.tool, activePen: s.activePen, ruler: s.ruler, setSquare: s.setSquare, protractor: s.protractor, compass: s.compass }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      const m = /^Key([A-Z])$/.exec(e.code)
      if (!m) {
        typed = []
        return
      }
      typed = [...typed, { ch: m[1], before: snapshot() }].slice(-LONGEST)
      const text = typed.map((t) => t.ch).join('')
      const code = Object.keys(CODES).find((c) => text.endsWith(c))
      if (!code) return
      const before = typed[typed.length - code.length].before
      typed = []
      const id = CODES[code]
      if (!canEarn(id)) return
      // After the board has handled this last letter: put the tools back as they were.
      setTimeout(() => editor.session.setState(before), 0)
      unlock(id, SHOWS[id].life - 400)
      setShow((s) => ({ id, n: (s?.n ?? 0) + 1 }))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [on, editor])

  useEffect(() => {
    if (!show) return
    const { life, appClass } = SHOWS[show.id]
    const html = document.documentElement
    if (appClass) html.classList.add(appClass)
    const t = setTimeout(() => setShow(null), life)
    return () => {
      clearTimeout(t)
      if (appClass) html.classList.remove(appClass)
    }
  }, [show])

  if (!show) return null
  const { Show, life } = SHOWS[show.id]
  return (
    <div className={`cheat cheat-${show.id}`} key={show.n} style={{ animationDuration: `${life}ms` }} onPointerDown={() => setShow(null)}>
      <Show uk={uk} />
      <div className="cheat-banner">{uk ? 'Чит активовано' : 'Cheat activated'}</div>
    </div>
  )
}
