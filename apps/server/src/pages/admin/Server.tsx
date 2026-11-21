import { BadgeButton } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@penrill/ui/description-list'
import { Divider } from '@penrill/ui/divider'
import { Input } from '@penrill/ui/input'
import { Code } from '@penrill/ui/text'
import { ArrowDownTrayIcon } from '@heroicons/react/16/solid'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useT, type MessageKey } from '../../i18n'
import { ErrorText, LoadFailed, Loading, Notice, PageTitle, SettingRow, useAction, useLoad } from '../../parts'
import { loadSession } from '../../session'

function SaveField({
  label,
  initial,
  type = 'text',
  maxLength,
  autoComplete,
  save,
  saved
}: {
  label: string
  initial: string
  type?: 'text' | 'email'
  maxLength: number
  autoComplete?: string
  save: (value: string) => Promise<void>
  saved: MessageKey
}) {
  const t = useT()
  const action = useAction()
  const [done, setDone] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDone(false)
    const value = String(new FormData(event.currentTarget).get('value'))
    if (await action.run(() => save(value))) setDone(true)
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-start gap-2">
        <Input name="value" type={type} defaultValue={initial} required maxLength={maxLength} autoComplete={autoComplete} aria-label={label} className="min-w-0 flex-1" />
        <Button type="submit" outline disabled={action.busy}>
          {t('app.save')}
        </Button>
      </div>
      <ErrorText error={action.error} />
      {done && <Notice>{t(saved)}</Notice>}
    </form>
  )
}

export function ServerPage() {
  const t = useT()
  const { data: info, failed, reload } = useLoad(api.admin.server)
  if (failed && !info) return <LoadFailed retry={reload} />
  if (!info) return <Loading />

  return (
    <>
      <PageTitle title={t('nav.server')}>{t('server.intro')}</PageTitle>

      <DescriptionList className="mt-8">
        <DescriptionTerm>{t('server.address')}</DescriptionTerm>
        <DescriptionDetails className="font-mono">{info.origin}</DescriptionDetails>
        <DescriptionTerm>{t('server.reachable')}</DescriptionTerm>
        <DescriptionDetails>{t(info.lan ? 'server.lan' : 'server.local')}</DescriptionDetails>
        {info.shortPin && (
          <>
            <DescriptionTerm>{t('server.certificate')}</DescriptionTerm>
            <DescriptionDetails>
              {t('server.certificateText', { pin: '\u0000' })
                .split('\u0000')
                .flatMap((part, i) => (i ? [<Code key={i}>{info.shortPin}</Code>, part] : [part]))}
            </DescriptionDetails>
          </>
        )}
        <DescriptionTerm>{t('server.version')}</DescriptionTerm>
        <DescriptionDetails>{info.version}</DescriptionDetails>
        <DescriptionTerm>{t('home.people')}</DescriptionTerm>
        <DescriptionDetails>{info.users}</DescriptionDetails>
        <DescriptionTerm>{t('home.devices')}</DescriptionTerm>
        <DescriptionDetails>{info.devices}</DescriptionDetails>
        <DescriptionTerm>{t('home.boards')}</DescriptionTerm>
        <DescriptionDetails>
          <span className="flex flex-wrap items-center gap-2">
            {info.boards}
            {info.orphans > 0 && (
              <BadgeButton color="amber" href="/admin/boards">
                {t('server.orphans', { n: info.orphans })}
              </BadgeButton>
            )}
          </span>
        </DescriptionDetails>
      </DescriptionList>

      <Divider soft className="my-10" />
      <SettingRow title={t('server.nameTitle')} text={t('server.nameText')}>
        <SaveField
          label={t('setup.serverName')}
          initial={info.name}
          maxLength={64}
          saved="server.renamed"
          save={async (name) => {
            await api.admin.rename(name)
            await loadSession()
          }}
        />
      </SettingRow>

      <Divider soft className="my-10" />
      <SettingRow title={t('server.emailTitle')} text={t('server.emailText')}>
        <SaveField label={t('server.emailTitle')} initial={info.email ?? ''} type="email" maxLength={254} autoComplete="email" saved="server.emailSaved" save={api.admin.setEmail} />
      </SettingRow>

      <Divider soft className="my-10" />
      <SettingRow title={t('server.backupTitle')} text={t('server.backupText')}>
        <Button outline href={api.admin.backupUrl} download target="_self">
          <ArrowDownTrayIcon />
          {t('server.backup')}
        </Button>
      </SettingRow>
    </>
  )
}
