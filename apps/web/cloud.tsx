import '@penrill/ui/styles.css'
import { useState, type FormEvent } from 'react'
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
const t = (key: MessageKey) => translate(language, key)

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
      await import('../../src/renderer/src/main')
      return
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) rememberAccount(origin, null)
      else unavailable = true
    }
  }
  createRoot(container).render(<CloudLogin unavailable={unavailable} />)
}
