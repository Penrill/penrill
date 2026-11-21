import '@penrill/ui/styles.css'
import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
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

function CloudLogin({ unavailable }: { unavailable: boolean }) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      rememberAccount(origin, await client.signIn(String(fields.get('name')), String(fields.get('password')), register))
      window.location.reload()
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0
      setError(status === 401 ? 'share.authError' : status === 409 ? 'share.taken' : 'storage.error')
      setBusy(false)
    }
  }
  return <main className="cloud-entry">
    <header><CloudIcon width={28} /> Penrill Cloud</header>
    <section>
      <h1>{t('cloud.heading')}</h1>
      {unavailable ? <><p role="alert">{t('storage.error')}</p><button className="text-btn outline" onClick={() => location.reload()}>{t('cloud.retry')}</button></> : <>
        <p>{t('cloud.intro')}</p>
        <div className="cloud-tabs">{[false, true].map(mode =>
          <button key={String(mode)} disabled={busy} aria-pressed={register === mode}
            onClick={() => { setRegister(mode); setError(null) }}>{t(mode ? 'share.register' : 'share.login')}</button>)}</div>
        <form onSubmit={e => void submit(e)}>
          <label>{t('share.username')}<Input name="name" required autoComplete="username" pattern={register ? '[a-z0-9_\\-]{3,32}' : undefined} /></label>
          <label>{t('share.password')}<Input name="password" required type="password" minLength={register ? 10 : undefined} maxLength={256}
            autoComplete={register ? 'new-password' : 'current-password'} /></label>
          {register && <small>{t('share.nameHint')}</small>}
          {error && <p role="alert">{t(error)}</p>}
          <Button type="submit" disabled={busy}>{t(busy ? 'storage.connecting' : register ? 'share.register' : 'share.login')}</Button>
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
    <header><CloudIcon width={28} /> Penrill Cloud</header>
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
  let unavailable = false
  if (session) {
    try {
      await client.boards()
      if (location.pathname === '/link') {
        createRoot(container).render(<CloudLink user={session.name} />)
        return
      }
      await import('../../src/renderer/src/main')
      return
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) rememberAccount(origin, null)
      else unavailable = true
    }
  }
  createRoot(container).render(<CloudLogin unavailable={unavailable} />)
}
