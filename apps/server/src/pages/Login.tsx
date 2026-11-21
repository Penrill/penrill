import { Button } from '@penrill/ui/button'
import { Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import type { FormEvent } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import { ErrorText, FlashNotice, PageTitle, useAction } from '../parts'
import { navigate } from '../router'
import { loadSession } from '../session'

export function LoginPage({ returnTo }: { returnTo: string }) {
  const t = useT()
  const { busy, error, run } = useAction()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const ok = await run(() => api.login(String(form.get('name')), String(form.get('password'))))
    if (!ok) return
    await loadSession()
    navigate(returnTo, true)
  }
  return (
    <>
      <FlashNotice className="mb-6" />
      <PageTitle title={t('login.title')}>{t('login.intro')}</PageTitle>
      <form onSubmit={submit} className="mt-8">
        <FieldGroup>
          <Field>
            <Label>{t('field.username')}</Label>
            <Input name="name" autoComplete="username" required autoCapitalize="none" spellCheck={false} autoFocus />
          </Field>
          <Field>
            <Label>{t('field.password')}</Label>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" color="dark/zinc" className="w-full" disabled={busy}>
            {t('login.submit')}
          </Button>
        </FieldGroup>
      </form>
      <Text className="mt-8">{t('login.help')}</Text>
    </>
  )
}
