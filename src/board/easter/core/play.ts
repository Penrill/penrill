import type { Egg } from './egg'
import { canEarn, canPlay, unlock } from './store'

/** Plays eggs: checks they may play, unlocks the medal the first time and hands the show to the stage. */

const stages = new Set<(egg: Egg, data: unknown) => void>()

export function play(egg: Egg, data?: unknown): boolean {
  if (!canPlay(egg.id)) return false
  const { duration, toastAt } = egg.show
  if (canEarn(egg.id)) unlock(egg.id, (toastAt ?? duration - 0.8) * 1000)
  stages.forEach((f) => f(egg, data))
  return true
}

export function onPlay(f: (egg: Egg, data: unknown) => void): () => void {
  stages.add(f)
  return () => void stages.delete(f)
}
