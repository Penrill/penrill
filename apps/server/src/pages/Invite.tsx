import { Button } from '@penrill/ui/button'
import { Description, Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useT } from '../i18n'
import { ErrorText, Loading, PageTitle, useAction, useLoad } from '../parts'
import { navigate } from '../router'
import { loadSession, notify } from '../session'

export function InvitePage({ token }: { token: string }) {
  const t = useT()
  const check = useLoad(() => api.checkInvite(token).then(() => true, (e) => (e instanceof ApiError && e.status === 404 ? false : Promise.reject(e))), [token])
  const { busy, error, run } = useAction()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name'))
    if (!(await run(() => api.acceptInvite(token, name, String(form.get('password')))))) return
    notify('invite.welcome', { name })
    await loadSession()
    navigate('/', true)
  }

  if (check.data === null && !check.failed) return <Loading />
  if (!check.data || error === 'error.expired')
    return <PageTitle title={t('invite.badTitle')}>{t('invite.bad')}</PageTitle>
  return (
    <>
      <PageTitle title={t('invite.title')}>{t('invite.intro')}</PageTitle>
      <form onSubmit={submit} className="mt-8">
        <FieldGroup>
          <Field>
            <Label>{t('field.username')}</Label>
            <Input name="name" autoComplete="username" required pattern="[a-z0-9_\-]{3,32}" autoCapitalize="none" spellCheck={false} autoFocus />
            <Description>{t('invite.usernameHint')}</Description>
          </Field>
          <Field>
            <Label>{t('field.password')}</Label>
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={256} />
            <Description>{t('field.passwordHint')}</Description>
          </Field>
          <ErrorText error={error} />
          <Button type="submit" color="dark/zinc" className="w-full" disabled={busy}>
            {t('invite.submit')}
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
