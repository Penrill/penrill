import * as Headless from '@headlessui/react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import type { DockEdge } from '../workspaceLayout'
import { fitPopoverForEdge } from './dock'

// The board's chrome, in Catalyst's style (packages/ui). Every bar over the board is a Bar; tools
// are ToolButtons (icon only) or InsertButtons (icon and a label, collapsing to ToolButtons when
// rendered inside a compact, vertical or merged bar). One hover look and one selected look everywhere.

export interface ChromeBarContextValue {
  edge: DockEdge
  compact: boolean
  showShortcuts: boolean
}

const ChromeBarContext = createContext<ChromeBarContextValue>({ edge: 'bottom', compact: false, showShortcuts: false })

export function ChromeBarProvider({
  edge,
  compact,
  showShortcuts = false,
  children
}: {
  edge: DockEdge
  compact: boolean
  showShortcuts?: boolean
  children: ReactNode
}) {
  return <ChromeBarContext.Provider value={{ edge, compact, showShortcuts }}>{children}</ChromeBarContext.Provider>
}

export function useChromeBar(): ChromeBarContextValue {
  return useContext(ChromeBarContext)
}

/**
 * A floating bar over the board. Opaque on purpose, unlike Catalyst's frosted menus: the board
 * under it can be white paper or a dark chalkboard, and see-through panels go muddy over either.
 */
export function Bar({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'pointer-events-auto rounded-2xl bg-white p-1 shadow-lg ring-1 shadow-zinc-950/5 ring-zinc-950/10',
        'dark:bg-zinc-800 dark:shadow-black/30 dark:ring-white/10'
      )}
    />
  )
}

/** A hairline between groups of a Bar, across it. */
export function BarDivider({ vertical }: { vertical?: boolean }) {
  return (
    <span
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={clsx('shrink-0 self-stretch bg-zinc-950/10 dark:bg-white/10', vertical ? 'mx-1 my-1.5 w-px' : 'mx-1.5 my-1 h-px')}
    />
  )
}

const selectable = [
  'text-zinc-700 transition-colors duration-100 dark:text-zinc-200',
  'hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white',
  'data-open:bg-zinc-950/5 dark:data-open:bg-white/10',
  'disabled:opacity-35 disabled:hover:bg-transparent'
]

const selected = [
  'bg-blue-500/12 text-blue-700 ring-1 ring-blue-500/40 ring-inset',
  'hover:bg-blue-500/15 hover:text-blue-700 dark:bg-blue-500/25 dark:text-blue-200 dark:ring-blue-400/50 dark:hover:bg-blue-500/30 dark:hover:text-blue-100'
]

type ToolButtonProps = {
  label: string
  /** Shown in the tooltip; the shortcut keeps working whether the button is shown or not. */
  shortcut?: string
  /** A tool that is on (pressed). Leave undefined for buttons that open something. */
  active?: boolean
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>

/** A square icon button: a tool in any bar, or an action in a top bar. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { label, shortcut, active, className, children, ...props },
  ref
) {
  const { showShortcuts } = useChromeBar()
  const showKey = showShortcuts && !!shortcut && shortcut.length <= 2
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      {...props}
      className={clsx(
        className,
        'relative flex size-10 shrink-0 items-center justify-center rounded-xl',
        active ? selected : selectable
      )}
    >
      {children}
      {showKey && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-0.5 bottom-0.5 rounded px-0.5 text-[9px]/3 font-semibold text-zinc-400 dark:text-zinc-500"
        >
          {shortcut}
        </kbd>
      )}
    </button>
  )
})

type InsertButtonProps = {
  icon: ReactNode
  label: string
  active?: boolean
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>

/**
 * An icon with its name under it (in a standalone horizontal insert bar), automatically collapsing
 * to a compact square ToolButton inside compact, vertical or merged bars.
 */
export const InsertButton = forwardRef<HTMLButtonElement, InsertButtonProps>(function InsertButton(
  { icon, label, active, className, title, ...props },
  ref
) {
  const { compact } = useChromeBar()
  if (compact) {
    return (
      <ToolButton ref={ref} label={title ?? label} active={active} className={className} {...props}>
        {icon}
      </ToolButton>
    )
  }
  return (
    <button
      ref={ref}
      type="button"
      title={title ?? label}
      {...props}
      className={clsx(
        className,
        'flex h-14 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px]/3 font-medium',
        'max-sm:h-12 max-sm:min-w-12 max-sm:*:data-[slot=label]:hidden',
        active ? selected : selectable
      )}
    >
      <span data-slot="icon" className="flex items-center justify-center">{icon}</span>
      <span data-slot="label" className="max-w-20 truncate">{label}</span>
    </button>
  )
})

/**
 * A floating Bar that scrolls gracefully when tools exceed the available width or height.
 * Horizontal bars gain subtle scroll chevrons and wheel-to-horizontal scrolling only when overflowing.
 */
export function ScrollableBar({
  vertical,
  label,
  className,
  onBarEl,
  onViewportEl,
  children
}: {
  vertical: boolean
  label: string
  className?: string
  onBarEl?: (el: HTMLDivElement | null) => void
  onViewportEl?: (el: HTMLDivElement | null) => void
  children: ReactNode
}) {
  const t = useT()
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ left: false, right: false })

  const setViewport = useCallback(
    (el: HTMLDivElement | null) => {
      viewportRef.current = el
      onViewportEl?.(el)
    },
    [onViewportEl]
  )

  const updateScroll = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const left = vp.scrollLeft > 1
    const right = vp.scrollLeft + vp.clientWidth < vp.scrollWidth - 1
    setScroll((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useLayoutEffect(() => {
    if (vertical) return
    const vp = viewportRef.current
    const content = contentRef.current
    if (!vp || !content) return
    updateScroll()
    const ro = new ResizeObserver(updateScroll)
    ro.observe(vp)
    ro.observe(content)
    const wheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey && !e.deltaX && vp.scrollWidth > vp.clientWidth) {
        e.preventDefault()
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.clientWidth : 1
        vp.scrollLeft += e.deltaY * unit
      }
    }
    vp.addEventListener('wheel', wheel, { passive: false })
    vp.addEventListener('scroll', updateScroll, { passive: true })
    return () => {
      ro.disconnect()
      vp.removeEventListener('wheel', wheel)
      vp.removeEventListener('scroll', updateScroll)
    }
  }, [vertical, updateScroll])

  if (vertical) {
    return (
      <div
        ref={(el) => {
          onBarEl?.(el)
          setViewport(el)
        }}
        role="toolbar"
        aria-label={label}
        aria-orientation="vertical"
        className={clsx(
          className,
          'pointer-events-auto flex max-h-[calc(100dvh-8.5rem)] w-14 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-1 shadow-lg ring-1 shadow-zinc-950/5 ring-zinc-950/10 [scrollbar-width:none]',
          'dark:bg-zinc-800 dark:shadow-black/30 dark:ring-white/10'
        )}
      >
        {children}
      </div>
    )
  }

  const overflowing = scroll.left || scroll.right
  return (
    <div
      ref={onBarEl}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className={clsx(
        className,
        'pointer-events-auto flex max-w-full min-w-0 items-center gap-0.5 rounded-2xl bg-white p-1 shadow-lg ring-1 shadow-zinc-950/5 ring-zinc-950/10',
        'dark:bg-zinc-800 dark:shadow-black/30 dark:ring-white/10'
      )}
    >
      {overflowing && (
        <button
          type="button"
          aria-label={t('toolbar.scrollLeft')}
          disabled={!scroll.left}
          onClick={() => viewportRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
          className={clsx('flex size-8 shrink-0 items-center justify-center rounded-xl', selectable)}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
      )}
      <div
        ref={setViewport}
        className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]"
      >
        <div ref={contentRef} className="flex items-center gap-0.5">
          {children}
        </div>
      </div>
      {overflowing && (
        <button
          type="button"
          aria-label={t('toolbar.scrollRight')}
          disabled={!scroll.right}
          onClick={() => viewportRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
          className={clsx('flex size-8 shrink-0 items-center justify-center rounded-xl', selectable)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      )}
    </div>
  )
}

/** A small panel that opens from a bar button (Headless UI popover, placed by `anchor`). */
export function FlyoutPanel({
  className,
  ...props
}: { className?: string } & Omit<Headless.PopoverPanelProps, 'as' | 'className'>) {
  return (
    <Headless.PopoverPanel
      transition
      {...props}
      className={clsx(
        className,
        'z-[80] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-zinc-950/10 [--anchor-gap:--spacing(2)] [--anchor-padding:--spacing(3)] focus:outline-none',
        'transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0',
        'dark:bg-zinc-800 dark:ring-white/10'
      )}
    />
  )
}

/**
 * A controlled Catalyst popover portaled to document.body so scrollable toolbars never clip it.
 * Used when clicking an already-active tool opens its options in popover mode.
 */
export function AnchoredPopover({
  anchorRef,
  edge,
  onClose,
  className,
  children
}: {
  anchorRef: RefObject<HTMLElement | null>
  edge: DockEdge
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const rect = anchor.getBoundingClientRect()
    const fit = fitPopoverForEdge(rect, panel.offsetWidth || 260, panel.offsetHeight || 200, edge, {
      w: window.innerWidth,
      h: window.innerHeight
    })
    setPos(fit)
  }, [anchorRef, edge])

  useLayoutEffect(() => {
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [place])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      closeRef.current()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape' || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      closeRef.current()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef])

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      onPointerDown={(e) => e.stopPropagation()}
      style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { left: -9999, top: -9999 }}
      className={clsx(
        className,
        'fixed z-[80] overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-3 shadow-xl ring-1 ring-zinc-950/10',
        'dark:bg-zinc-800 dark:ring-white/10'
      )}
    >
      {children}
    </div>,
    document.body
  )
}

/** A heading inside a flyout or a strip. */
export function PanelTitle({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'mb-2 text-xs/5 font-semibold text-zinc-500 dark:text-zinc-400')} />
}

/** One choice among a few: a sunken track with the chosen option raised. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  disabled
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode; title?: string }[]
  onChange: (value: T) => void
  label: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={clsx(className, 'flex shrink-0 rounded-[10px] bg-zinc-950/5 p-0.5 transition-opacity dark:bg-white/5', disabled && 'opacity-50')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title ?? o.label}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm/5 font-medium whitespace-nowrap transition-colors',
            value === o.value
              ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/10 dark:bg-zinc-600 dark:text-white dark:ring-white/10'
              : 'text-zinc-600 enabled:hover:text-zinc-950 dark:text-zinc-300 dark:enabled:hover:text-white'
          )}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
