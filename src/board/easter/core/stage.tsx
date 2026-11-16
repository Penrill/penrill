import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUk } from './lang'
import { canEarn, canPlay, unlock } from './store'
import type { Egg, Vars } from './types'
import './stage.css'

/**
 * The stage: one full-screen layer that plays one egg's show at a time. It sits on <body>, outside
 * the app, so a show can move the whole app (shake it, float it, swallow it) and stay put itself.
 * A click ends the show early, unless the egg lets the pointer through.
 */

const listeners = new Set<(egg: Egg) => void>()

/** Plays the egg's show (first time, or again when repeatable) and unlocks its medal the first time. */
export function play(egg: Egg): void {
  if (!canPlay(egg.id)) return
  if (canEarn(egg.id)) unlock(egg.id, egg.toastAt ?? egg.life - 500)
  listeners.forEach((f) => f(egg))
}

export function Stage() {
  const uk = useUk()
  const [shown, setShown] = useState<{ egg: Egg; n: number } | null>(null)

  useEffect(() => {
    const f = (egg: Egg): void => setShown((s) => ({ egg, n: (s?.n ?? 0) + 1 }))
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])

  useEffect(() => {
    if (!shown) return
    const { life, appClass } = shown.egg
    const html = document.documentElement
    if (appClass) html.classList.add(appClass)
    const t = setTimeout(() => setShown(null), life)
    return () => {
      clearTimeout(t)
      if (appClass) html.classList.remove(appClass)
    }
  }, [shown])

  if (!shown) return null
  const { egg, n } = shown
  const { Show } = egg
  return createPortal(
    <div
      key={n}
      className={`egg egg-${egg.id}${egg.passThrough ? ' egg-pass' : ''}`}
      style={{ '--life': `${egg.life}ms` } as Vars}
      aria-live="polite"
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setShown(null)
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <Show uk={uk} />
    </div>,
    document.body
  )
}
