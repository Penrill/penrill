import { Button } from '@penrill/ui/button'
import { Description, Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import type { FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useT } from '../i18n'
import { ErrorText, Loading, PageTitle, useAction, useLoad } from '../parts'
import { navigate } from '../router'
import { notify } from '../session'

export function ResetPage({ token }: { token: string }) {
  const t = useT()
  const check = useLoad(
    () => api.checkReset(token).then((r) => r.user, (e) => (e instanceof ApiError && e.status === 404 ? '' : Promise.reject(e))),
    [token]
  )
  const { busy, error, run } = useAction()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password'))
    if (!(await run(() => api.reset(token, password)))) return
    notify('reset.done')
    navigate('/login', true)
  }

  if (check.data === null && !check.failed) return <Loading />
  if (!check.data || error === 'error.expired') return <PageTitle title={t('reset.badTitle')}>{t('invite.bad')}</PageTitle>
  return (
    <>
      <PageTitle title={t('reset.title', { name: check.data })}>{t('reset.intro')}</PageTitle>
      <form onSubmit={submit} className="mt-8">
        <input type="text" name="username" value={check.data} autoComplete="username" hidden readOnly />
        <FieldGroup>
          <Field>
            <Label>{t('field.newPassword')}</Label>
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={256} autoFocus />
            <Description>{t('field.passwordHint')}</Description>
          </Field>
          <ErrorText error={error === 'error.invalid' ? 'error.shortPassword' : error} />
          <Button type="submit" color="dark/zinc" className="w-full" disabled={busy}>
            {t('reset.submit')}
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
