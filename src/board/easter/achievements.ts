import { useSyncExternalStore } from 'react'

/**
 * Achievements: a playful opt-in. Until it is switched on (a grey medal on the home screen offers it,
 * and there is a switch at the bottom of the settings) no easter egg plays. Kept in localStorage, per
 * computer, and part of src/board/easter/ so the whole thing can be thrown away in one go.
 */

export interface Achievement {
  id: string
  icon: string
  name: { en: string; uk: string }
  /** How it was earned; shown once unlocked (before that the medal is a secret). */
  how: { en: string; uk: string }
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'jackpot',
    icon: '🎰',
    name: { en: 'Jackpot', uk: 'Джекпот' },
    how: { en: 'Got 777 as an answer', uk: 'Отримати відповідь 777' }
  },
  {
    id: 'sixseven',
    icon: '🫴',
    name: { en: 'Six Seven', uk: 'Шість-сім' },
    how: { en: 'Got 67 as an answer', uk: 'Отримати відповідь 67' }
  },
  // GTA cheat codes typed on a board (cheats.tsx); codes that do the same thing share a medal.
  {
    id: 'health',
    icon: '💰',
    name: { en: 'Full Health', uk: 'Повне здоров’я' },
    how: { en: 'Typed HESOYAM, ASPIRINE or TURTLE on a board', uk: 'Набрати на дошці HESOYAM, ASPIRINE чи TURTLE' }
  },
  {
    id: 'tank',
    icon: '🪖',
    name: { en: 'Tank Driver', uk: 'Танкіст' },
    how: { en: 'Typed PANZER or AIWPRTON on a board', uk: 'Набрати на дошці PANZER чи AIWPRTON' }
  },
  {
    id: 'nowanted',
    icon: '😇',
    name: { en: 'Never Wanted', uk: 'Невловимий' },
    how: { en: 'Typed AEZAKMI, LEAVEMEALONE or LAWYERUP on a board', uk: 'Набрати на дошці AEZAKMI, LEAVEMEALONE чи LAWYERUP' }
  },
  {
    id: 'wanted',
    icon: '🚨',
    name: { en: 'Most Wanted', uk: 'У розшуку' },
    how: { en: 'Typed FUGITIVE or OSRBLHH on a board', uk: 'Набрати на дошці FUGITIVE чи OSRBLHH' }
  },
  {
    id: 'rocketman',
    icon: '🕶️',
    name: { en: 'Rocket Man', uk: 'Rocket Man' },
    how: { en: 'Typed ROCKETMAN or YECGAA on a board', uk: 'Набрати на дошці ROCKETMAN чи YECGAA' }
  },
  {
    id: 'bigbang',
    icon: '💥',
    name: { en: 'Big Bang', uk: 'Великий вибух' },
    how: { en: 'Typed BIGBANG or CPKTNWT on a board', uk: 'Набрати на дошці BIGBANG чи CPKTNWT' }
  },
  {
    id: 'storm',
    icon: '⛈️',
    name: { en: 'Make It Rain', uk: 'Злива' },
    how: { en: 'Typed MAKEITRAIN or AUIFRVQS on a board', uk: 'Набрати на дошці MAKEITRAIN чи AUIFRVQS' }
  },
  {
    id: 'skyfall',
    icon: '🪂',
    name: { en: 'Skyfall', uk: 'Вільне падіння' },
    how: { en: 'Typed SKYFALL on a board', uk: 'Набрати на дошці SKYFALL' }
  },
  {
    id: 'floater',
    icon: '🌙',
    name: { en: 'Moon Gravity', uk: 'Місячна гравітація' },
    how: { en: 'Typed FLOATER or BUBBLECARS on a board', uk: 'Набрати на дошці FLOATER чи BUBBLECARS' }
  },
  {
    id: 'owl',
    icon: '🦉',
    name: { en: 'Night Owl', uk: 'Нічна сова' },
    how: { en: 'Was on a board at 3 a.m.', uk: 'Сидіти над дошкою о третій ночі' }
  },
  {
    id: 'microscope',
    icon: '🔬',
    name: { en: 'Microscope', uk: 'Мікроскоп' },
    how: { en: 'Zoomed all the way in', uk: 'Наблизити дошку до краю' }
  },
  {
    id: 'telescope',
    icon: '🔭',
    name: { en: 'Telescope', uk: 'Телескоп' },
    how: { en: 'Zoomed all the way out', uk: 'Віддалити дошку до краю' }
  }
]

const ON = 'inkboard.achievements.on'
const GOT = 'inkboard.achievements.got'

interface State {
  on: boolean
  /** Unlocked achievements: id → when (ms). */
  got: Record<string, number>
}

function load(): State {
  try {
    return {
      on: localStorage.getItem(ON) === '1',
      got: JSON.parse(localStorage.getItem(GOT) ?? '{}') as Record<string, number>
    }
  } catch {
    return { on: false, got: {} }
  }
}

let state = load()
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((f) => f())

function save(next: State): void {
  state = next
  try {
    localStorage.setItem(ON, next.on ? '1' : '0')
    localStorage.setItem(GOT, JSON.stringify(next.got))
  } catch {
    /* storage blocked: still works for this session */
  }
  emit()
}

const subscribe = (f: () => void): (() => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

export function useAchievements(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export function setAchievementsOn(on: boolean): void {
  save({ ...state, on })
}

/** True when this one can still be earned: collecting is on and it isn't unlocked yet. */
export function canEarn(id: string): boolean {
  return state.on && !state.got[id]
}

const toastListeners = new Set<(a: Achievement) => void>()
export function onUnlockToast(f: (a: Achievement) => void): () => void {
  toastListeners.add(f)
  return () => void toastListeners.delete(f)
}

/** Unlocks an achievement (once) and announces it after `toastDelay` ms. */
export function unlock(id: string, toastDelay = 0): void {
  const a = ACHIEVEMENTS.find((x) => x.id === id)
  if (!a || !canEarn(id)) return
  save({ ...state, got: { ...state.got, [id]: Date.now() } })
  setTimeout(() => toastListeners.forEach((f) => f(a)), toastDelay)
}
