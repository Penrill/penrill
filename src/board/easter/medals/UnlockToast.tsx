import { useEffect, useState } from 'react'
import { EGGS } from '../eggs'
import { pick, useUk } from '../core/lang'
import { onUnlockToast } from '../core/store'
import type { Egg } from '../core/types'
import { Medal } from './Medals'

/** "Achievement unlocked!": slides in for a few seconds; a click sends it away. */
export function UnlockToast() {
  const uk = useUk()
  const [shown, setShown] = useState<{ egg: Egg; n: number } | null>(null)
  useEffect(
    () =>
      onUnlockToast((id) => {
        const egg = EGGS.find((e) => e.id === id)
        if (egg) setShown((s) => ({ egg, n: (s?.n ?? 0) + 1 }))
      }),
    []
  )
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 4500)
    return () => clearTimeout(t)
  }, [shown])
  if (!shown) return null
  const { egg, n } = shown
  return (
    <div
      className="ach-toast"
      key={n}
      role="status"
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
      <Medal egg={egg} />
      <div>
        <div className="ach-toast-kicker">{uk ? 'Нове досягнення!' : 'Achievement unlocked!'}</div>
        <div className="ach-toast-name">{pick(egg.name, uk)}</div>
        <div className="ach-toast-how">{pick(egg.how, uk)}</div>
      </div>
    </div>
  )
}
