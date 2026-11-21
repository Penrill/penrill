import { useLayoutEffect } from 'react'
import { withSurface } from './engine/surface'
import { useFeature } from './features'
import { prefsStore, usePrefs } from './store'

/**
 * Applies the interface theme. The board surface (paper or chalkboard) is normally chosen separately
 * in the background picker: a dark interface with a white board, or a light one with a green board,
 * are both fine. With `linkBoardToTheme` on, the surface follows the theme instead (chalkboard when
 * dark, paper when light), including the system's light/dark switch when the theme is "System".
 */
export function useAppTheme(): void {
  const enabled = useFeature('darkTheme')
  const pref = usePrefs((s) => s.theme)
  const linked = usePrefs((s) => s.linkBoardToTheme)
  useLayoutEffect(() => {
    const root = document.documentElement
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = enabled && (pref === 'dark' || (pref === 'system' && system.matches))
      if (dark) root.dataset.theme = 'dark'
      else delete root.dataset.theme
      if (enabled && linked) {
        const { background, setBackground } = prefsStore.getState()
        const next = withSurface(background, dark)
        if (next !== background) setBackground(next)
      }
    }
    apply()
    if (enabled && pref === 'system') system.addEventListener('change', apply)
    return () => system.removeEventListener('change', apply)
  }, [enabled, pref, linked])
}
