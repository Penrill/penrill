import { useEffect, useState } from 'react'
import { canEarn, unlock } from './achievements'

/**
 * One easter egg's show: `earn()` unlocks its achievement (only while collecting is on and only the
 * first time) and plays the show; `useShow()` tells the component when to draw it.
 */
export function makeShow(id: string, life: number, toastAfter = life - 500) {
  const listeners = new Set<() => void>()
  return {
    /** Unlocks and plays; false when this one can't be earned (any more). */
    earn(): boolean {
      if (!canEarn(id)) return false
      unlock(id, toastAfter)
      listeners.forEach((f) => f())
      return true
    },
    /** A number that changes on every play while the show runs (use as `key`), 0 when it doesn't; and a stop. */
    useShow(): [number, () => void] {
      const [run, setRun] = useState(0)
      useEffect(() => {
        const play = (): void => setRun((n) => n + 1)
        listeners.add(play)
        return () => void listeners.delete(play)
      }, [])
      useEffect(() => {
        if (!run) return
        const t = setTimeout(() => setRun(0), life)
        return () => clearTimeout(t)
      }, [run])
      return [run, () => setRun(0)]
    }
  }
}

/** A repeatable "random" number in [0, 1), so particle shows look the same every time. */
export function rnd(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** A list of `n` particles made by `f` (index → inline style with CSS variables). */
export function particles<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i))
}
