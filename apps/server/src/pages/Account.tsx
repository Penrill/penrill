import { Button } from '@penrill/ui/button'
import { Divider } from '@penrill/ui/divider'
import { Description, Field, FieldGroup, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Strong, Text } from '@penrill/ui/text'
import { DevicePhoneMobileIcon } from '@heroicons/react/24/outline'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useT } from '../i18n'
import { DeviceTable } from './DeviceTable'
import { Empty, ErrorText, LoadFailed, Loading, Notice, PageTitle, SettingRow, useAction, useLoad } from '../parts'

export function AccountPage({ user }: { user: string }) {
  const t = useT()
  const devices = useLoad(api.devices)
  const password = useAction()
  const [notice, setNotice] = useState<string | null>(null)

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setNotice(null)
    if (await password.run(() => api.changePassword(String(fields.get('current')), String(fields.get('next'))))) {
      form.reset()
      setNotice(t('devices.changed'))
    }
  }

  return (
    <>
      <PageTitle title={t('devices.title')}>
        {t('devices.intro', { name: '\u0000' })
          .split('\u0000')
          .flatMap((part, i) => (i ? [<Strong key={i}>{user}</Strong>, part] : [part]))}
      </PageTitle>
      {notice && <Notice className="mt-6">{notice}</Notice>}

      <div className="mt-8">
        {devices.failed && !devices.data ? (
          <LoadFailed retry={devices.reload} />
        ) : !devices.data ? (
          <Loading />
        ) : devices.data.length === 0 ? (
          <Empty icon={<DevicePhoneMobileIcon />} title={t('devices.empty')}>
            <Text className="mt-1">{t('devices.emptyHint')}</Text>
            <Button outline href="/" className="mt-6">
              {t('home.connectTitle')}
            </Button>
          </Empty>
        ) : (
          <DeviceTable
            devices={devices.data}
            onDisconnect={async (id) => {
              await api.disconnect(id)
              setNotice(t('devices.disconnected'))
              devices.reload()
            }}
          />
        )}
      </div>

      <Divider soft className="my-12" />
      <SettingRow title={t('devices.passwordTitle')} text={t('devices.passwordText')}>
        <form onSubmit={changePassword}>
          <input type="text" name="username" value={user} autoComplete="username" hidden readOnly />
          <FieldGroup>
            <Field>
              <Label>{t('devices.current')}</Label>
              <Input name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field>
              <Label>{t('field.newPassword')}</Label>
              <Input name="next" type="password" autoComplete="new-password" required minLength={10} maxLength={256} />
              <Description>{t('field.passwordHint')}</Description>
            </Field>
            <ErrorText error={password.error} />
            <div>
              <Button type="submit" color="dark/zinc" disabled={password.busy}>
                {t('devices.change')}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </SettingRow>
    </>
  )
}
