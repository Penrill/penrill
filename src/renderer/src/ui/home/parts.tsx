import { Badge } from '@penrill/ui/badge'
import { Heading, Subheading } from '@penrill/ui/heading'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'

// Pieces shared by the home screen's pages: a page header, card grids and empty states, all made
// of Catalyst's own typography and colours.

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="max-w-2xl min-w-0">
        <Heading className="m-0">{title}</Heading>
        {description && <Text className="mt-2 mb-0">{description}</Text>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  )
}

export function Section({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      {title && <Subheading className="m-0 mb-4">{title}</Subheading>}
      {children}
    </section>
  )
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-5 p-0">{children}</ul>
}

/**
 * A card with a picture on top and a few lines below. The whole card opens it (a button stretched
 * over it); the menu and the buttons inside the text sit above that button.
 */
export function Card({
  label,
  picture,
  onOpen,
  disabled = false,
  menu,
  children
}: {
  label: string
  picture: ReactNode
  onOpen?: () => void
  disabled?: boolean
  menu?: ReactNode
  children: ReactNode
}) {
  return (
    <li
      className={clsx(
        'group relative flex flex-col overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-zinc-950/10 transition-shadow',
        'dark:bg-zinc-800/60 dark:ring-white/10',
        !disabled && onOpen && 'hover:shadow-md hover:ring-zinc-950/20 dark:hover:ring-white/20'
      )}
    >
      <div className={clsx('aspect-[16/10] overflow-hidden border-b border-zinc-950/5 bg-zinc-50 dark:border-white/5 dark:bg-zinc-900', disabled && 'opacity-50 grayscale')}>
        {picture}
      </div>
      <div className="flex items-start gap-1 py-3 pr-1.5 pl-3">
        <div className="min-w-0 flex-1">{children}</div>
        {menu && <div className="relative z-10 -my-1">{menu}</div>}
      </div>
      {onOpen && (
        <button
          type="button"
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={onOpen}
          className="absolute inset-0 cursor-pointer rounded-xl focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default"
        />
      )}
    </li>
  )
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-1.5 text-sm/6 font-semibold text-zinc-950 dark:text-white">
      {icon && <span className="flex shrink-0 text-zinc-400 *:size-3.5">{icon}</span>}
      <span className="truncate">{children}</span>
    </p>
  )
}

export function CardMeta({ children }: { children: ReactNode }) {
  return <p className="m-0 truncate text-xs/5 text-zinc-500 dark:text-zinc-400">{children}</p>
}

export function CardBadges({ children }: { children: ReactNode }) {
  return <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1 empty:hidden">{children}</div>
}

/** A thumbnail, or dot paper while there is none. */
export function Picture({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" draggable={false} className="block size-full object-cover" />
  ) : (
    <div className="size-full bg-[radial-gradient(circle,var(--color-zinc-300)_1px,transparent_1.2px)] bg-[length:14px_14px] dark:bg-[radial-gradient(circle,var(--color-zinc-700)_1px,transparent_1.2px)]" />
  )
}

/** Loads an image URL (a thumbnail) and keeps it while `deps` stay the same. */
export function useImageUrl(load: () => Promise<string | null>, deps: unknown[]): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void load().then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, deps)
  return url
}

export function EmptyState({ icon, title, hint, action }: { icon: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-zinc-950/15 px-6 py-16 text-center dark:border-white/15">
      <span className="flex size-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 *:size-6 dark:bg-white/5 dark:text-zinc-400">{icon}</span>
      <p className="mt-4 mb-0 text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">{title}</p>
      {hint && <Text className="mt-1 mb-0 max-w-sm">{hint}</Text>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

type BadgeColor = NonNullable<ComponentProps<typeof Badge>['color']>

// Tag colours (TAG_COLORS) as Catalyst's badge colours, so tags look like the rest of the kit.
const TAG_BADGES: Record<string, BadgeColor> = {
  '#e03131': 'red',
  '#f76707': 'orange',
  '#f59f00': 'amber',
  '#2f9e44': 'green',
  '#0c8599': 'cyan',
  '#1971c2': 'blue',
  '#6741d9': 'violet',
  '#c2255c': 'pink'
}

export const tagBadgeColor = (hex: string): BadgeColor => TAG_BADGES[hex.toLowerCase()] ?? 'zinc'

export function TagDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={clsx('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />
}
