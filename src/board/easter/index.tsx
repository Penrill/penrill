import { useEffect, useState } from 'react'
import { usePrefs } from '../store'
import { Popover } from '../ui/Popover'
import { ACHIEVEMENTS, onUnlockToast, setAchievementsOn, useAchievements, type Achievement } from './achievements'
import { Jackpot, maybeJackpot } from './jackpot'
import { Cheats } from './cheats'
import { NightOwl } from './nightowl'
import { SixSeven, maybeSixSeven } from './sixseven'
import { ZoomEggs } from './zoom'
import './easter.css'
import './eggs.css'

/**
 * Easter eggs and achievements, all in this folder. To throw it away: delete src/board/easter/ and
 * the lines marked "easter egg" (BoardWorkspace.tsx, FormulaEditor.tsx, BackgroundPicker.tsx,
 * HomeScreen.tsx). Typecheck points at any line left behind.
 */

/** Called when a formula's answer is shown: some answers are special. */
export function onAnswer(value: number): void {
  maybeJackpot(value)
  maybeSixSeven(value)
}

function useUk(): boolean {
  return usePrefs((s) => s.lang) === 'uk'
}

/** Mounted once over the board: the shows themselves and the "achievement unlocked" toast. */
export function Easter() {
  return (
    <>
      <Jackpot />
      <SixSeven />
      <Cheats />
      <NightOwl />
      <ZoomEggs />
      <UnlockToast />
    </>
  )
}

function UnlockToast() {
  const uk = useUk()
  const [shown, setShown] = useState<{ a: Achievement; n: number } | null>(null)
  useEffect(() => onUnlockToast((a) => setShown((s) => ({ a, n: (s?.n ?? 0) + 1 }))), [])
  useEffect(() => {
    if (!shown) return
    const id = setTimeout(() => setShown(null), 4500)
    return () => clearTimeout(id)
  }, [shown])
  if (!shown) return null
  const { a, n } = shown
  return (
    <div className="ach-toast" key={n} role="status" onPointerDown={() => setShown(null)}>
      <Medal a={a} got />
      <div>
        <div className="ach-toast-kicker">{uk ? 'Нове досягнення!' : 'Achievement unlocked!'}</div>
        <div className="ach-toast-name">{uk ? a.name.uk : a.name.en}</div>
        <div className="ach-toast-how">{uk ? a.how.uk : a.how.en}</div>
      </div>
    </div>
  )
}

/** Settings, at the very bottom: the one switch that turns the silly stuff on. */
export function AchievementsSettings() {
  const uk = useUk()
  const { on } = useAchievements()
  return (
    <>
      <div className="popover-title section">{uk ? 'Досягнення' : 'Achievements'}</div>
      <div className="settings-group">
        <label className="settings-row">
          <span>{uk ? 'Хочу збирати досягнення' : 'I want to collect achievements'}</span>
          <input type="checkbox" role="switch" className="switch-input" checked={on} onChange={(e) => setAchievementsOn(e.target.checked)} />
        </label>
      </div>
    </>
  )
}

function Medal({ a, got }: { a: Achievement; got: boolean }) {
  return (
    <span className={`ach-medal ${got ? 'got' : 'locked'}`} aria-hidden>
      <span className="ach-ribbon" />
      <span className="ach-disc">{got ? a.icon : '?'}</span>
    </span>
  )
}

/** While collecting is off: one grey medal that offers to switch it on; "no thanks" just leaves it grey. */
function MedalOffer() {
  const uk = useUk()
  const [open, setOpen] = useState(false)
  return (
    <div className="ach-offer-wrap">
      <button
        data-popover-anchor
        className="ach-item ach-offer-btn"
        title={uk ? 'Досягнення' : 'Achievements'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ach-medal locked" aria-hidden>
          <span className="ach-ribbon" />
          <span className="ach-disc">★</span>
        </span>
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="ach-offer">
          <div className="ach-offer-title">{uk ? 'Збирати досягнення?' : 'Collect achievements?'}</div>
          <p>
            {uk
              ? 'У Inkboard сховано кілька пасхалок. Знайдете одну, і тут з’явиться медаль. Вимкнути можна будь-коли в налаштуваннях.'
              : 'Inkboard has a few easter eggs hidden in it. Find one and a medal shows up here. You can switch this off any time in the settings.'}
          </p>
          <div className="ach-offer-actions">
            <button className="text-btn outline" onClick={() => setOpen(false)}>
              {uk ? 'Ні, дякую' : 'No, thanks'}
            </button>
            <button
              className="text-btn primary"
              onClick={() => {
                setOpen(false)
                setAchievementsOn(true)
              }}
            >
              {uk ? 'Так, хочу!' : 'Yes, please!'}
            </button>
          </div>
        </Popover>
      )}
    </div>
  )
}

/** The medals on the home screen: only the ones earned (how many of all, on hover); while off, the offer. */
export function Medals() {
  const uk = useUk()
  const { on, got } = useAchievements()
  if (!on) return <MedalOffer />
  const earned = ACHIEVEMENTS.filter((a) => got[a.id]).sort((a, b) => got[a.id] - got[b.id])
  const tally = uk ? `Відкрито ${earned.length} з ${ACHIEVEMENTS.length}` : `${earned.length} of ${ACHIEVEMENTS.length} unlocked`
  return (
    <div className="ach-shelf" aria-label={uk ? 'Досягнення' : 'Achievements'}>
      {earned.length === 0 && (
        <span className="ach-item" tabIndex={0}>
          <span className="ach-medal locked" aria-hidden>
            <span className="ach-ribbon" />
            <span className="ach-disc">★</span>
          </span>
          <span className="ach-tip" role="tooltip">
            <strong>{tally}</strong>
            <span>{uk ? 'Пасхалки десь поруч. Шукайте!' : 'The easter eggs are out there. Go find them!'}</span>
          </span>
        </span>
      )}
      {earned.map((a) => (
        <span key={a.id} className="ach-item" tabIndex={0}>
          <Medal a={a} got />
          <span className="ach-tip" role="tooltip">
            <strong>{uk ? a.name.uk : a.name.en}</strong>
            <span>{uk ? a.how.uk : a.how.en}</span>
            <em>{new Date(got[a.id]).toLocaleDateString(uk ? 'uk' : 'en')}</em>
            <em className="ach-tally">{tally}</em>
          </span>
        </span>
      ))}
    </div>
  )
}
