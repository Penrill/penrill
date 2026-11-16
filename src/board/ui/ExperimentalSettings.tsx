import { FEATURE_IDS } from '../../shared/features'
import { useFeatures } from '../features'
import { useT, type MessageKey } from '../i18n'
import { type ThemePref, usePrefs } from '../store'

const THEMES: ThemePref[] = ['system', 'light', 'dark']

/** Settings: interface theme (only while the dark theme flag is on). */
export function ThemeSettings() {
  const t = useT()
  const enabled = useFeatures((s) => s.flags.darkTheme)
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  if (!enabled) return null
  return (
    <>
      <div className="popover-title section">{t('settings.theme')}</div>
      <div className="lang-options">
        {THEMES.map((th) => (
          <button key={th} className={`lang-option ${theme === th ? 'active' : ''}`} onClick={() => setTheme(th)}>
            {t(`theme.${th}` as MessageKey)}
          </button>
        ))}
      </div>
    </>
  )
}

/** Settings: switches for the feature flags in src/shared/features.ts. */
export function ExperimentalSettings() {
  const t = useT()
  const flags = useFeatures((s) => s.flags)
  const setFlag = useFeatures((s) => s.set)
  return (
    <>
      <div className="popover-title section">{t('settings.experimental')}</div>
      <div className="settings-group">
        {FEATURE_IDS.map((id) => (
          <label key={id} className="settings-row">
            <span>{t(`feature.${id}` as MessageKey)}</span>
            <input type="checkbox" role="switch" className="switch-input" checked={flags[id]} onChange={(e) => void setFlag(id, e.target.checked)} />
          </label>
        ))}
      </div>
    </>
  )
}
