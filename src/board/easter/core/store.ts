import { useSyncExternalStore } from 'react'

/**
 * Which achievements are earned, whether collecting is on, and which shows are set to play every
 * time (unlocked by Alt/Option-clicking the switch in the settings). Kept in localStorage, per
 * computer. Knows only ids: the eggs themselves are listed in eggs/index.ts.
 */

const ON = 'inkboard.achievements.on'
const GOT = 'inkboard.achievements.got'
const REPEAT = 'inkboard.achievements.repeat'

export interface AchievementsState {
  on: boolean
  /** Unlocked achievements: id → when (ms). */
  got: Record<string, number>
  /** Achievements allowed to play their show every time: id → true. */
  repeat: Record<string, boolean>
  /** Whether the secret repeat list in the settings is open right now. */
  repeatOpen: boolean
}

function load(): AchievementsState {
  try {
    return {
      on: localStorage.getItem(ON) === '1',
      got: JSON.parse(localStorage.getItem(GOT) ?? '{}') as Record<string, number>,
      repeat: JSON.parse(localStorage.getItem(REPEAT) ?? '{}') as Record<string, boolean>,
      repeatOpen: false
    }
  } catch {
    return { on: false, got: {}, repeat: {}, repeatOpen: false }
  }
}

let state = load()
const listeners = new Set<() => void>()

function save(next: AchievementsState): void {
  state = next
  try {
    localStorage.setItem(ON, next.on ? '1' : '0')
    localStorage.setItem(GOT, JSON.stringify(next.got))
    localStorage.setItem(REPEAT, JSON.stringify(next.repeat))
  } catch {
    /* storage blocked: still works for this session */
  }
  listeners.forEach((f) => f())
}

const subscribe = (f: () => void): (() => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

export function useAchievements(): AchievementsState {
  return useSyncExternalStore(subscribe, () => state)
}

export function setAchievementsOn(on: boolean): void {
  save({ ...state, on })
}

export function setRepeat(id: string, on: boolean): void {
  const next = { ...state.repeat }
  if (on) next[id] = true
  else delete next[id]
  save({ ...state, repeat: next })
}

export function setRepeatMany(ids: string[], on: boolean): void {
  const next = { ...state.repeat }
  for (const id of ids) {
    if (on) next[id] = true
    else delete next[id]
  }
  save({ ...state, repeat: next })
}

export function toggleRepeatMenu(defaultRepeatIds: string[]): boolean {
  const firstTime = !state.got.dejavu
  const repeat = firstTime && Object.keys(state.repeat).length === 0 ? Object.fromEntries(defaultRepeatIds.map((id) => [id, true])) : state.repeat
  const repeatOpen = firstTime ? true : !state.repeatOpen
  save({ ...state, on: true, repeat, repeatOpen })
  return firstTime
}

/** True when this achievement hasn't been unlocked yet (while collecting is on). */
export function canEarn(id: string): boolean {
  return state.on && !state.got[id]
}

/** True when this egg's show should play: first time, or repeatability is switched on for it. */
export function canPlay(id: string): boolean {
  return state.on && (!state.got[id] || !!state.repeat[id])
}

const toastListeners = new Set<(id: string) => void>()

/** Called with the id of every achievement unlocked, when it's time to announce it. */
export function onUnlockToast(f: (id: string) => void): () => void {
  toastListeners.add(f)
  return () => void toastListeners.delete(f)
}

/** Unlocks an achievement (once) and announces it after `toastDelay` ms. */
export function unlock(id: string, toastDelay = 0): void {
  if (!canEarn(id)) return
  save({ ...state, got: { ...state.got, [id]: Date.now() } })
  setTimeout(() => toastListeners.forEach((f) => f(id)), toastDelay)
}
