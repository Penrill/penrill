import { isChalk } from '../../engine/surface'
import { prefsStore } from '../../store'
import type { Trigger } from '../core/egg'

/** Triggers from the clock and from the way the app is set up. */

/** It is `hour` o'clock (checked every minute); fires once per such hour. */
export const atHour = (hour: number): Trigger => ({
  arm: (_, fire) => {
    let lit = false
    const check = (): void => {
      const now = new Date().getHours() === hour
      if (now && !lit) fire()
      lit = now
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }
})

/** A board has been open without a break for `minutes`. */
export const boardFor = (minutes: number): Trigger => ({
  arm: ({ editor }, fire) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const follow = (active: boolean): void => {
      clearTimeout(timer)
      timer = active ? setTimeout(() => fire(), minutes * 60_000) : undefined
    }
    follow(editor.session.getState().active)
    const off = editor.session.subscribe((s, prev) => s.active !== prev.active && follow(s.active))
    return () => {
      off()
      clearTimeout(timer)
    }
  }
})

const isNight = (): boolean => {
  const h = new Date().getHours()
  return h >= 23 || h < 5
}

/** Switched to the light theme or to white paper in the middle of the night. */
export const lightAtNight = (): Trigger => ({
  arm: (_, fire) =>
    prefsStore.subscribe((s, prev) => {
      const lighter = (s.theme === 'light' && prev.theme !== 'light') || (isChalk(prev.background) && !isChalk(s.background))
      if (lighter && isNight()) fire()
    })
})
