import { useLayoutEffect } from 'react'
import { useFeature } from './features'
import { usePrefs } from './store'

/**
 * Applies the interface theme. The board surface (paper or chalkboard) is chosen separately in the
 * background picker: a dark interface with a white board, or a light one with a green board, are both fine.
 */
export function useAppTheme(): void {
  const enabled = useFeature('darkTheme')
  const pref = usePrefs((s) => s.theme)
  useLayoutEffect(() => {
    const root = document.documentElement
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = enabled && (pref === 'dark' || (pref === 'system' && system.matches))
      if (dark) root.dataset.theme = 'dark'
      else delete root.dataset.theme
    }
    apply()
    if (enabled && pref === 'system') system.addEventListener('change', apply)
    return () => system.removeEventListener('change', apply)
  }, [enabled, pref])
}
