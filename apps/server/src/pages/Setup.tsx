import { Button } from '@penrill/ui/button'
import { Description, Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import { CopyField, ErrorText, Notice, PageTitle, useAction } from '../parts'
import { navigate } from '../router'
import { loadSession, notify, useSession } from '../session'

/** The setup link carries its key in the fragment (#k=…), so it stays out of server logs. */
function keyFromFragment(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('k')
}

export function SetupPage() {
  const t = useT()
  const server = useSession((s) => s.session?.server ?? '')
  const [token, setToken] = useState<string | null>(keyFromFragment)
  const [expired, setExpired] = useState(false)
  const { busy, error, run } = useAction()

  useEffect(() => {
    const read = (): void => {
      const key = keyFromFragment()
      if (!key) return
      setToken(key)
      setExpired(false)
      history.replaceState(null, '', window.location.pathname)
    }
    read()
    // Opening the link while this page is open only changes the fragment.
    window.addEventListener('hashchange', read)
    // In development the server hands this machine's browser a key, so nobody digs it out of the console.
    if (!keyFromFragment()) void api.setupToken().then(({ token: dev }) => dev && setToken((old) => old ?? dev), () => undefined)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const ok = await run(() =>
      api.setup({
        token,
        serverName: String(form.get('serverName')),
        name: String(form.get('name')),
        password: String(form.get('password')),
        email: String(form.get('email'))
      })
    )
    if (ok) {
      notify('setup.done')
      await loadSession()
      navigate('/', true)
    }
  }

  useEffect(() => {
    if (error === 'error.expired') {
      setExpired(true)
      setToken(null)
    }
  }, [error])

  if (!token)
    return (
      <>
        <PageTitle title={t('setup.title')} />
        {expired && <Notice tone="bad" className="mt-4">{t('setup.expired')}</Notice>}
        <Text className="mt-2">{t('setup.needLink')}</Text>
        <div className="mt-8 rounded-lg bg-zinc-950/2.5 p-4 ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          <Text className="font-medium text-zinc-950! dark:text-white!">{t('setup.run')}</Text>
          <div className="mt-3">
            <CopyField value="sudo penrill-server setup" label={t('setup.run')} />
          </div>
          <Text className="mt-3">{t('setup.runHint')}</Text>
        </div>
        <Text className="mt-6">{t('setup.installed')}</Text>
      </>
    )

  return (
    <>
      <PageTitle title={t('setup.title')}>{t('setup.intro')}</PageTitle>
      <form onSubmit={submit} className="mt-8">
        <FieldGroup>
          <Field>
            <Label>{t('setup.serverName')}</Label>
            <Input name="serverName" required maxLength={64} defaultValue={server} />
            <Description>{t('setup.serverNameHint')}</Description>
          </Field>
          <Field>
            <Label>{t('setup.username')}</Label>
            <Input name="name" autoComplete="username" required pattern="[a-z0-9_\-]{3,32}" autoCapitalize="none" spellCheck={false} />
            <Description>{t('field.usernameHint')}</Description>
          </Field>
          <Field>
            <Label>{t('field.password')}</Label>
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={256} />
            <Description>{t('field.passwordHint')}</Description>
          </Field>
          <Field>
            <Label>{t('setup.email')}</Label>
            <Input name="email" type="email" autoComplete="email" required maxLength={254} />
            <Description>{t('setup.emailHint')}</Description>
          </Field>
          <ErrorText error={error === 'error.expired' ? null : error} />
          <Button type="submit" color="dark/zinc" className="w-full" disabled={busy}>
            {t('setup.submit')}
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
