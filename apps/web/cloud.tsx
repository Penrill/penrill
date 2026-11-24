import '@penrill/ui/styles.css'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Input } from '@penrill/ui/input'
import { CloudIcon } from '@heroicons/react/24/outline'
import { detectLanguage, translate, type MessageKey } from '../../src/board/i18n'
import { sendHttp } from '../../src/shared/http'
import { account, rememberAccount } from '../../src/renderer/src/sync/accounts'
import { ApiError, PenrillClient } from '../../src/renderer/src/sync/api'
import '../../src/board/styles.css'
import './cloud.css'

const origin = window.location.origin
const client = new PenrillClient(origin, sendHttp, () => account(origin)?.token ?? null)
const language = detectLanguage()
const t = (key: MessageKey, vars?: Record<string, string>) => translate(language, key, vars)

function inviteToken(pathname: string): string | null {
  const match = /^\/invite\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function CloudHeader() {
  return (
    <header>
      <CloudIcon width={28} />
      <span>Penrill Cloud</span>
      <Badge color="amber">{t('cloud.inDevelopment')}</Badge>
    </header>
  )
}

function CloudLogin({ unavailable }: { unavailable: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      rememberAccount(origin, await client.signIn(String(fields.get('name')), String(fields.get('password')), false))
      window.location.reload()
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0
      setError(status === 401 ? 'share.authError' : status === 429 ? 'cloud.tooManyTries' : 'storage.error')
      setBusy(false)
    }
  }
  return <main className="cloud-entry">
    <CloudHeader />
    <section>
      <h1>{t('cloud.heading')}</h1>
      {unavailable ? <><p role="alert">{t('storage.error')}</p><button className="text-btn outline" onClick={() => location.reload()}>{t('cloud.retry')}</button></> : <>
        <p>{t('cloud.intro')}</p>
        <p className="cloud-notice" role="note">{t('cloud.devNotice')}</p>
        <form onSubmit={e => void submit(e)}>
          <label>{t('share.username')}<Input name="name" required autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
          <label>{t('share.password')}<Input name="password" required type="password" maxLength={256} autoComplete="current-password" /></label>
          {error && <p role="alert">{t(error)}</p>}
          <Button type="submit" disabled={busy}>{t(busy ? 'storage.connecting' : 'share.login')}</Button>
        </form>
      </>}
    </section>
  </main>
}

function CloudInvite({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'failed'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)

  const check = useCallback(() => {
    setState('loading')
    client.checkInvite(token).then(
      valid => setState(valid ? 'ready' : 'invalid'),
      () => setState('failed')
    )
  }, [token])

  useEffect(() => {
    check()
  }, [check])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      rememberAccount(origin, await client.acceptInvite(token, String(fields.get('name')), String(fields.get('password'))))
      window.location.replace('/')
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0
      if (status === 404) {
        setState('invalid')
        return
      }
      setError(status === 409 ? 'share.taken' : status === 400 ? 'share.nameHint' : status === 429 ? 'cloud.tooManyTries' : 'storage.error')
      setBusy(false)
    }
  }

  return <main className="cloud-entry">
    <CloudHeader />
    <section>
      {state === 'loading' ? <p>{t('cloud.loading')}</p>
        : state === 'failed' ? <>
          <h1>{t('cloud.inviteTitle')}</h1>
          <p role="alert">{t('storage.error')}</p>
          <button type="button" className="text-btn outline" onClick={check}>{t('cloud.retry')}</button>
        </>
        : state === 'invalid' ? <>
          <h1>{t('cloud.inviteBadTitle')}</h1>
          <p role="alert">{t('cloud.inviteBad')}</p>
          <div className="cloud-actions">
            <Button type="button" outline onClick={() => window.location.assign('/')}>{t('share.login')}</Button>
          </div>
        </>
        : <>
          <h1>{t('cloud.inviteTitle')}</h1>
          <p>{t('cloud.inviteIntro')}</p>
          <form onSubmit={e => void submit(e)}>
            <label>{t('share.username')}<Input name="name" required autoComplete="username" pattern="[a-z0-9_\-]{3,32}" autoCapitalize="none" spellCheck={false} autoFocus /></label>
            <label>{t('share.password')}<Input name="password" required type="password" minLength={10} maxLength={256} autoComplete="new-password" /></label>
            <small>{t('share.nameHint')}</small>
            {error && <p role="alert">{t(error)}</p>}
            <Button type="submit" disabled={busy}>{t(busy ? 'storage.connecting' : 'share.register')}</Button>
          </form>
        </>}
    </section>
  </main>
}

/**
 * Where the Penrill editor sends people to allow a device (see sync/connect.ts): the code both
 * screens show, which device asks, and Allow or Deny for the signed-in account.
 */
function CloudLink({ user }: { user: string }) {
  const code = new URLSearchParams(location.search).get('code') ?? ''
  const [info, setInfo] = useState<{ device: string; code: string } | null | undefined>(undefined)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    client.describeLink(code).then(setInfo, () => setInfo(null))
  }, [code])
  async function decide(allow: boolean) {
    setBusy(true)
    try {
      const ok = info && await client.decideLink(code, allow)
      setDone(ok ? t(allow ? 'cloud.linkDone' : 'cloud.linkDenied', { device: info!.device }) : t('cloud.linkMissing'))
    } catch {
      setDone(t('storage.error'))
    } finally {
      setBusy(false)
    }
  }
  return <main className="cloud-entry">
    <CloudHeader />
    <section>
      {info === undefined ? <p>{t('cloud.loading')}</p>
        : done ? <p role="status">{done}</p>
        : !info ? <p role="alert">{t('cloud.linkMissing')}</p>
        : <>
          <h1>{t('cloud.linkTitle', { device: info.device })}</h1>
          <p>{t('cloud.linkText', { user })}</p>
          <p className="cloud-code">{info.code.slice(0, 4)}-{info.code.slice(4)}</p>
          <div className="cloud-actions">
            <Button type="button" disabled={busy} onClick={() => void decide(true)}>{t('cloud.allow')}</Button>
            <button type="button" className="text-btn outline" disabled={busy} onClick={() => void decide(false)}>{t('cloud.deny')}</button>
          </div>
        </>}
    </section>
  </main>
}

export async function startCloud() {
  document.title = 'Penrill Cloud'
  document.documentElement.lang = language
  const container = document.getElementById('root')!
  container.textContent = t('cloud.loading')
  const session = account(origin)
  window.addEventListener('storage', () => {
    if (account(origin)?.token !== session?.token) window.location.reload()
  })
  const invite = inviteToken(location.pathname)
  let unavailable = false
  if (session) {
    try {
      await client.boards()
      if (location.pathname === '/link') {
        createRoot(container).render(<CloudLink user={session.name} />)
        return
      }
      if (invite) history.replaceState(history.state, '', '/')
      await import('../../src/renderer/src/main')
      return
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) rememberAccount(origin, null)
      else unavailable = true
    }
  }
  if (invite && !unavailable) {
    createRoot(container).render(<CloudInvite token={invite} />)
    return
  }
  createRoot(container).render(<CloudLogin unavailable={unavailable} />)
}
