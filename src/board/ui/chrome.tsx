import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'

// The board's chrome, in Catalyst's style (packages/ui). Every bar over the board is a Bar; tools
// are ToolButtons (icon only, in the drawing rail and the top bars) or InsertButtons (icon and a
// label, in the insert bar). One hover look and one selected look everywhere.

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

/** A square icon button: a tool in the drawing rail, or an action in a top bar. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { label, shortcut, active, className, children, ...props },
  ref
) {
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
    </button>
  )
})

type InsertButtonProps = {
  icon: ReactNode
  label: string
  active?: boolean
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>

/** An icon with its name under it: what the insert bar puts on the board. */
export const InsertButton = forwardRef<HTMLButtonElement, InsertButtonProps>(function InsertButton(
  { icon, label, active, className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
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
  className
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode; title?: string }[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx(className, 'flex shrink-0 rounded-[10px] bg-zinc-950/5 p-0.5 dark:bg-white/5')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title ?? o.label}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm/5 font-medium whitespace-nowrap transition-colors',
            value === o.value
              ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/10 dark:bg-zinc-600 dark:text-white dark:ring-white/10'
              : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white'
          )}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
