import { EGGS } from '../eggs'
import { pick, useUk } from '../core/lang'
import { play } from '../core/play'
import { setAchievementsOn, setRepeat, setRepeatMany, toggleRepeatMenu, useAchievements } from '../core/store'

/**
 * Settings, at the very bottom: the switch that turns achievements on. Alt/Option-clicking the
 * switch unlocks a secret achievement (not counted in the total) and opens the repeatability list
 * so chosen easter eggs can play every time instead of only once.
 */
export function AchievementsSettings() {
  const uk = useUk()
  const { on, got, repeat, repeatOpen } = useAchievements()
  const repeatable = EGGS.filter((e) => e.repeatable !== false && !e.secret)
  const repeatableIds = repeatable.map((e) => e.id)
  const allRepeated = repeatableIds.length > 0 && repeatableIds.every((id) => repeat[id])

  const onAltClick = (): void => {
    toggleRepeatMenu(repeatableIds)
    const secret = EGGS.find((e) => e.id === 'dejavu')
    if (secret) play(secret)
  }

  return (
    <>
      <div className="popover-title section">{uk ? 'Досягнення' : 'Achievements'}</div>
      <div className="settings-group">
        <label
          className="settings-row"
          onClickCapture={(e) => {
            if (!e.altKey) return
            e.preventDefault()
            e.stopPropagation()
            onAltClick()
          }}
        >
          <span>{uk ? 'Хочу збирати досягнення' : 'I want to collect achievements'}</span>
          <input type="checkbox" role="switch" className="switch-input" checked={on} onChange={(e) => setAchievementsOn(e.target.checked)} />
        </label>
        {on && repeatOpen && (
          <div className="ach-repeat-panel">
            <div className="ach-repeat-head">
              <span>{uk ? 'Повторювати анімації' : 'Replay animations'}</span>
              <label className="ach-repeat-all">
                <span>{uk ? 'Усі' : 'All'}</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch-input"
                  checked={allRepeated}
                  onChange={(e) => setRepeatMany(repeatableIds, e.target.checked)}
                />
              </label>
            </div>
            <div className="ach-repeat-list">
              {repeatable.map((e) => {
                const unlocked = !!got[e.id]
                return (
                  <label key={e.id} className="settings-row ach-repeat-row">
                    <span className="ach-repeat-label">
                      <span className="ach-repeat-icon">{unlocked ? e.icon : '❔'}</span>
                      <span>{pick(e.name, uk)}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch-input"
                      checked={!!repeat[e.id]}
                      onChange={(ev) => setRepeat(e.id, ev.target.checked)}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
