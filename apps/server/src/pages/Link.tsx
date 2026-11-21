import { Button } from '@penrill/ui/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@penrill/ui/description-list'
import { Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Strong, Text } from '@penrill/ui/text'
import { useState, type FormEvent } from 'react'
import { api, ApiError, type LinkRequest } from '../api'
import { useDates, useT } from '../i18n'
import { Loading, Notice, PageTitle, useLoad } from '../parts'
import { navigate } from '../router'

/** Where Penrill sends people to allow a new device: shows which device asks, by the code both screens show. */
export function LinkPage({ code, user }: { code: string | null; user: string }) {
  const t = useT()
  const dates = useDates()
  const request = useLoad<LinkRequest | 'missing' | 'none'>(
    () => (code ? api.linkRequest(code).catch((e) => (e instanceof ApiError && e.status === 404 ? ('missing' as const) : Promise.reject(e))) : Promise.resolve('none' as const)),
    [code]
  )
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lost, setLost] = useState(false)

  async function decide(info: LinkRequest, allow: boolean) {
    setBusy(true)
    try {
      await api.decide(info.code, allow)
      setDone(t(allow ? 'link.allowed' : 'link.denied', { device: info.device }))
    } catch {
      setLost(true)
    } finally {
      setBusy(false)
    }
  }

  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('code')).trim()
    if (value) navigate('/link?code=' + encodeURIComponent(value), true)
  }

  if (done)
    return (
      <>
        <PageTitle title={t('link.doneTitle')}>{done}</PageTitle>
        <Button outline href="/" className="mt-8">
          {t('link.home')}
        </Button>
      </>
    )
  if (request.data === null && !request.failed) return <Loading />

  const info = typeof request.data === 'object' && request.data && !lost ? request.data : null
  if (info)
    return (
      <>
        <PageTitle title={t('link.ask', { device: info.device })} />
        <Text className="mt-2">
          {t('link.askText', { user: '\u0000' })
            .split('\u0000')
            .flatMap((part, i) => (i ? [<Strong key={i}>{user}</Strong>, part] : [part]))}
        </Text>
        <p className="mt-6 rounded-lg bg-zinc-950/2.5 py-4 text-center font-mono text-3xl font-semibold tracking-[0.15em] ring-1 ring-zinc-950/5 dark:bg-white/5 dark:ring-white/10">
          {info.code}
        </p>
        <DescriptionList className="mt-6">
          {info.app && (
            <>
              <DescriptionTerm>{t('link.app')}</DescriptionTerm>
              <DescriptionDetails>{info.app}</DescriptionDetails>
            </>
          )}
          {info.address && (
            <>
              <DescriptionTerm>{t('link.from')}</DescriptionTerm>
              <DescriptionDetails>{info.address}</DescriptionDetails>
            </>
          )}
          <DescriptionTerm>{t('link.asked')}</DescriptionTerm>
          <DescriptionDetails>
            <time dateTime={info.created}>{dates.time(info.created)}</time>
          </DescriptionDetails>
        </DescriptionList>
        <div className="mt-8 flex gap-3">
          <Button color="blue" className="flex-1" disabled={busy} onClick={() => void decide(info, true)}>
            {t('link.allow')}
          </Button>
          <Button outline className="flex-1" disabled={busy} onClick={() => void decide(info, false)}>
            {t('link.deny')}
          </Button>
        </div>
        <Text className="mt-6">{t('link.notYou')}</Text>
      </>
    )

  return (
    <>
      <PageTitle title={t('link.title')}>{t('link.intro')}</PageTitle>
      <form onSubmit={enter} className="mt-8">
        <FieldGroup>
          <Field>
            <Label>{t('link.code')}</Label>
            <Input
              name="code"
              defaultValue={code ?? ''}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="WDJB-MJHT"
              required
              className="*:font-mono"
            />
          </Field>
          {(request.data === 'missing' || lost || request.failed) && <Notice tone="bad">{t('link.missing')}</Notice>}
          <Button type="submit" color="dark/zinc" className="w-full">
            {t('link.continue')}
          </Button>
        </FieldGroup>
      </form>
    </>
  )
}
