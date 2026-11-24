import { XMarkIcon } from '@heroicons/react/16/solid'
import clsx from 'clsx'
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { usePrefs } from '../store'

// Short notices (tips and updates) all appear in one place, the bottom-left corner,
// and go away by themselves: a notice that waits to be closed only gets in the way of drawing.

const AREA_ID = 'penrill-notices'

/**
 * Where notices stack: bottom left, kept clear of bottom-left zoom controls or bottom-center bars.
 */
export function NoticeArea() {
  const layout = usePrefs((s) => s.workspaceLayout)
  const zoomBottomLeft = layout.zoomDock === 'bottom-left'
  const hasBottomCenter =
    layout.toolsDock === 'bottom' ||
    (layout.insertDock === 'bottom') ||
    (layout.optionsMode === 'strip' && layout.optionsDock === 'bottom')
  return (
    <div
      id={AREA_ID}
      aria-live="polite"
      className={clsx(
        'pointer-events-none fixed left-3 z-[70] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col-reverse items-start gap-2',
        zoomBottomLeft
          ? 'bottom-[4.5rem]'
          : hasBottomCenter
            ? 'bottom-[5.25rem] lg:bottom-3 lg:max-w-[min(20rem,calc(50vw-16.5rem))]'
            : 'bottom-3'
      )}
    />
  )
}

/** Renders into the notice area once it is on the page (null until then). */
export function useNoticeArea(): HTMLElement | null {
  const [area, setArea] = useState<HTMLElement | null>(null)
  useEffect(() => setArea(document.getElementById(AREA_ID)), [])
  return area
}

/** A text button inside a notice; `primary` for the one thing the notice asks for. */
export function NoticeButton({ primary, className, ...props }: { primary?: boolean } & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        className,
        'rounded-md px-2 py-1 text-sm/5 font-semibold',
        primary
          ? 'bg-blue-600 text-white hover:bg-blue-500'
          : 'text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/10'
      )}
    />
  )
}

/**
 * One notice: a line or two of text, optional buttons, and a close button. It closes itself after
 * `timeout` ms (the timer waits while the pointer is on it, so it can be read and clicked).
 */
export function Notice({
  children,
  actions,
  onClose,
  timeout = 8000,
  closable = true,
  tone = 'default'
}: {
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  timeout?: number
  closable?: boolean
  tone?: 'default' | 'success'
}) {
  const t = useT()
  const area = useNoticeArea()
  const [hover, setHover] = useState(false)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (hover || !timeout) return
    const id = setTimeout(() => close.current(), timeout)
    return () => clearTimeout(id)
  }, [hover, timeout])
  if (!area) return null
  return createPortal(
    <div
      role="status"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => e.stopPropagation()}
      className={clsx(
        'pointer-events-auto flex w-full items-start gap-2 rounded-xl bg-white py-2.5 pr-1.5 pl-3.5 text-sm/5 text-zinc-700 shadow-lg ring-1 ring-zinc-950/10',
        'transition duration-200 ease-out starting:-translate-x-3 starting:opacity-0 motion-reduce:transition-none',
        'dark:bg-zinc-800 dark:text-zinc-200 dark:ring-white/10',
        tone === 'success' && 'border-l-4 border-green-500'
      )}
    >
      <div className="min-w-0 flex-1 py-0.5">
        <div>{children}</div>
        {actions && <div className="-ml-2 mt-1.5 flex flex-wrap gap-1">{actions}</div>}
      </div>
      {closable && (
        <button
          type="button"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={() => close.current()}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
    </div>,
    area
  )
}
