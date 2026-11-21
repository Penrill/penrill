import { Alert, AlertActions, AlertTitle } from '@penrill/ui/alert'
import { Button } from '@penrill/ui/button'
import { Heading, Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import { CheckCircleIcon, ClipboardDocumentIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { CheckCircleIcon as CheckBig } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from './api'
import { errorKey, useT, type MessageKey } from './i18n'
import { clearNotice, useSession } from './session'

/** Loads what a page shows; `reload` after a change. Keeps the last data while reloading. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; failed: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    load().then(
      (value) => live && (setData(value), setFailed(false)),
      () => live && setFailed(true)
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  return { data, failed, reload: useCallback(() => setVersion((v) => v + 1), []) }
}

/** Runs a change against the server, keeps the button busy meanwhile and turns refusals into words. */
export function useAction(): {
  busy: boolean
  error: MessageKey | null
  run: (action: () => Promise<void>) => Promise<boolean>
  setError: (key: MessageKey | null) => void
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (failure) {
      setError(failure instanceof ApiError ? errorKey(failure.code) : 'app.failed')
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, setError }
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    const server = useSession.getState().session?.server
    document.title = server ? `${title} · ${server}` : title
  }, [title])
  return (
    <>
      <Heading>{title}</Heading>
      {children && <Text className="mt-2 max-w-2xl">{children}</Text>}
    </>
  )
}

export function Notice({ children, tone = 'good', className }: { children: ReactNode; tone?: 'good' | 'bad'; className?: string }) {
  const Icon = tone === 'good' ? CheckCircleIcon : ExclamationTriangleIcon
  return (
    <p
      role={tone === 'good' ? 'status' : 'alert'}
      className={clsx(
        className,
        'flex items-start gap-2 rounded-lg px-3 py-2 text-sm/6 ring-1 ring-inset',
        tone === 'good'
          ? 'bg-green-500/10 text-green-800 ring-green-600/20 dark:text-green-300 dark:ring-green-400/20'
          : 'bg-red-500/10 text-red-800 ring-red-600/20 dark:text-red-300 dark:ring-red-400/20'
      )}
    >
      <Icon className="mt-1 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** The message a previous page left ("Password changed."), shown once. */
export function FlashNotice({ className }: { className?: string }) {
  const t = useT()
  const notice = useSession((s) => s.notice)
  const shown = useRef(notice)
  // Cleared after it has been on screen, so going to another page drops it.
  useEffect(() => {
    shown.current = notice
    if (!notice) return
    const timer = window.setTimeout(() => {
      if (useSession.getState().notice === shown.current) clearNotice()
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [notice])
  return notice ? <Notice className={className}>{t(notice.key, notice.vars)}</Notice> : null
}

export function ErrorText({ error }: { error: MessageKey | null }) {
  const t = useT()
  return error ? <Notice tone="bad">{t(error)}</Notice> : null
}

export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      input.current?.select()
    }
  }
  return (
    <div className="flex gap-2">
      <Input
        ref={input}
        readOnly
        value={value}
        aria-label={label}
        className={clsx('min-w-0 flex-1', mono && '*:font-mono')}
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button outline onClick={copy}>
        <ClipboardDocumentIcon />
        {copied ? t('app.copied') : t('app.copy')}
      </Button>
    </div>
  )
}

/** A QR code drawn by the server (QRCoder): dark on white in both themes, so phones read it. */
export function Qr({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="qr size-40 shrink-0 overflow-hidden rounded-lg bg-white p-1 ring-1 ring-zinc-950/10 dark:ring-white/10"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** A step of "Get started": its number, or a check once done. */
export function Step({ number, done, label }: { number: number; done: boolean; label: string }) {
  return done ? (
    <span title={label} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
      <CheckBig className="size-5" />
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-zinc-950/15 ring-inset dark:ring-white/20">
      {number}
    </span>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-950/15 px-6 py-12 text-center dark:border-white/15">
      {icon && (
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 *:size-6 dark:bg-white/5 dark:text-zinc-400">
          {icon}
        </span>
      )}
      <Subheading>{title}</Subheading>
      {children}
    </div>
  )
}

/** A setting: what it is on the left, its form on the right. */
export function SettingRow({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <div className="space-y-1">
        <Subheading>{title}</Subheading>
        <Text>{text}</Text>
      </div>
      <div>{children}</div>
    </section>
  )
}

export function Loading() {
  const t = useT()
  return <Text className="animate-pulse">{t('app.loading')}</Text>
}

export function LoadFailed({ retry }: { retry: () => void }) {
  const t = useT()
  return (
    <div className="space-y-4">
      <Notice tone="bad">{t('app.failed')}</Notice>
      <Button outline onClick={retry}>
        {t('app.retry')}
      </Button>
    </div>
  )
}

/** A button that asks first: for changes that cut someone off or cannot be undone. */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  danger = true
}: {
  label: string
  question: string
  onConfirm: () => Promise<void> | void
  danger?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  return (
    <>
      <Button plain className={clsx(danger && 'text-red-700! dark:text-red-400!')} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Alert open={open} onClose={() => !busy && setOpen(false)}>
        <AlertTitle>{question}</AlertTitle>
        <AlertActions>
          <Button plain onClick={() => setOpen(false)} disabled={busy}>
            {t('app.cancel')}
          </Button>
          <Button color={danger ? 'red' : 'dark/zinc'} onClick={() => void confirm()} disabled={busy}>
            {label}
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}

/** A table cell for actions, kept to the right. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="-my-1.5 flex justify-end gap-1">{children}</div>
}
