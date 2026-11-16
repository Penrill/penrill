import { useEditor } from '../editorContext'
import { useT } from '../i18n'
import { SNAP_DELAY, type WheelMode, usePrefs, prefsStore } from '../store'

/** Settings: what the mouse wheel does, and hold-to-snap shapes. */
export function BoardSettings() {
  const t = useT()
  // Hold-to-snap comes from the shape recognition module; without it there is nothing to set.
  const canSnap = !!useEditor().features.strokeRecognizer
  const wheel = usePrefs((s) => s.wheelMode)
  const snap = usePrefs((s) => s.shapeSnap)
  const delay = usePrefs((s) => s.shapeSnapDelay)
  const lang = usePrefs((s) => s.lang)
  const seconds = (delay / 1000).toFixed(1)
  return (
    <>
      <div className="popover-title section">{t('settings.board')}</div>
      <div className="settings-group">
        <div className="settings-row">
          <span>{t('settings.wheel')}</span>
          <div className="lang-options">
            {(['scroll', 'zoom'] as WheelMode[]).map((m) => (
              <button key={m} className={`lang-option ${wheel === m ? 'active' : ''}`} onClick={() => prefsStore.setState({ wheelMode: m })}>
                {t(m === 'scroll' ? 'settings.wheelScroll' : 'settings.wheelZoom')}
              </button>
            ))}
          </div>
        </div>
        {canSnap && (
          <label className="settings-row">
            <span>{t('settings.shapeSnap')}</span>
            <input type="checkbox" role="switch" className="switch-input" checked={snap} onChange={(e) => prefsStore.setState({ shapeSnap: e.target.checked })} />
          </label>
        )}
        {canSnap && snap && (
          <div className="settings-row size-row">
            <span className="line-label">{t('settings.shapeSnapDelay')}</span>
            <input
              type="range"
              min={SNAP_DELAY.min}
              max={SNAP_DELAY.max}
              step={100}
              value={delay}
              aria-label={t('settings.shapeSnapDelay')}
              onChange={(e) => prefsStore.setState({ shapeSnapDelay: Number(e.target.value) })}
            />
            <span className="size-value">{t('settings.seconds', { n: lang === 'uk' ? seconds.replace('.', ',') : seconds })}</span>
          </div>
        )}
      </div>
    </>
  )
}
