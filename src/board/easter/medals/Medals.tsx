import { useState } from 'react'
import { Popover } from '../../ui/Popover'
import { EGGS } from '../eggs'
import { pick, useUk } from '../core/lang'
import { setAchievementsOn, useAchievements } from '../core/store'
import type { Egg } from '../core/egg'
import './medals.css'

/** A medal: a ribbon and a disc with the egg's icon, or a grey one with `mark` while locked. */
export function Medal({ egg, mark = '?' }: { egg?: Egg; mark?: string }) {
  return (
    <span className={`ach-medal ${egg ? 'got' : 'locked'}${egg?.secret ? ' secret' : ''}`} aria-hidden>
      <span className="ach-ribbon" />
      <span className="ach-disc">{egg ? egg.icon : mark}</span>
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
        <Medal mark="★" />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="ach-offer">
          <div className="ach-offer-title">{uk ? 'Збирати досягнення?' : 'Collect achievements?'}</div>
          <p>
            {uk
              ? 'У Penrill сховано кілька пасхалок. Знайдете одну, і тут з’явиться медаль. Вимкнути можна будь-коли в налаштуваннях.'
              : 'Penrill has a few easter eggs hidden in it. Find one and a medal shows up here. You can switch this off any time in the settings.'}
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
  const total = EGGS.filter((e) => !e.secret).length
  const earned = EGGS.filter((e) => got[e.id]).sort((a, b) => got[a.id] - got[b.id])
  const tally = uk ? `Відкрито ${earned.length} з ${total}` : `${earned.length} of ${total} unlocked`
  return (
    <div className="ach-shelf" aria-label={uk ? 'Досягнення' : 'Achievements'}>
      {earned.length === 0 && (
        <span className="ach-item" tabIndex={0}>
          <Medal mark="★" />
          <span className="ach-tip" role="tooltip">
            <strong>{tally}</strong>
            <span>{uk ? 'Пасхалки десь поруч. Шукайте!' : 'The easter eggs are out there. Go find them!'}</span>
          </span>
        </span>
      )}
      {earned.map((e) => (
        <span key={e.id} className="ach-item" tabIndex={0}>
          <Medal egg={e} />
          <span className="ach-tip" role="tooltip">
            {e.secret && <em className="ach-secret-tag">{uk ? '★ Поза списком' : '★ Off the record'}</em>}
            <strong>{pick(e.name, uk)}</strong>
            <span>{pick(e.how, uk)}</span>
            <em>{new Date(got[e.id]).toLocaleDateString(uk ? 'uk' : 'en')}</em>
            <em className="ach-tally">{tally}</em>
          </span>
        </span>
      ))}
    </div>
  )
}
