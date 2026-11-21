import { ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'
import { CloudIcon, ComputerDesktopIcon, ServerStackIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@penrill/ui/description-list'
import { Divider } from '@penrill/ui/divider'
import { Description, ErrorMessage, Field, FieldGroup, Fieldset, Label, Legend } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Radio, RadioField, RadioGroup } from '@penrill/ui/radio'
import { Text, TextLink } from '@penrill/ui/text'
import { useState, type ReactNode } from 'react'
import { useT, type MessageKey } from '../../../../board/i18n'
import { serverOrigin } from '../../../../shared/http'
import { boardLibrary } from '../../boardLibrary'
import { cloudLabel, cloudOrigin, hostedCloud, storagePreference, type StorageSource } from '../../storagePreference'
import { account, rememberAccount, useAccounts } from '../../sync/accounts'
import { ApiError } from '../../sync/api'
import { clientFor } from '../../sync/clients'
import { useRemoteBoards, useSyncStatus } from '../../sync/librarySync'
import { linkedBoards, useLinks } from '../../sync/links'
import { PageHeader } from './parts'

const SELF_HOST_URL = 'https://github.com/Penrill/penrill-server'

type Preference = ReturnType<typeof storagePreference>

/** Is the saved server answering, and how many boards are synced with it. */
function Connection({ origin }: { origin: string }) {
  const t = useT()
  const catalog = useRemoteBoards()
  const states = useSyncStatus((s) => s.states)
  useLinks((s) => s.version)
  const linked = linkedBoards().filter(([, link]) => link.origin === origin)
  const problems = linked.filter(([id]) => states[id] === 'denied' || states[id] === 'offline').length
  const known = catalog.origin === origin
  return (
    <>
      <DescriptionTerm>{t('sync.status')}</DescriptionTerm>
      <DescriptionDetails>
        {known ? (
          <Badge color={catalog.error ? 'amber' : 'green'}>{t(catalog.error ? 'storage.offline' : 'storage.online')}</Badge>
        ) : (
          <Badge>{t('storage.connecting')}</Badge>
        )}
      </DescriptionDetails>
      <DescriptionTerm>{t('sync.boards')}</DescriptionTerm>
      <DescriptionDetails className="flex flex-wrap items-center gap-2">
        {linked.length}
        {problems > 0 && <Badge color="amber">{t('sync.problem', { n: problems })}</Badge>}
      </DescriptionDetails>
    </>
  )
}

function SignedIn({ origin, name, live, busy, onSignOut }: { origin: string; name: string; live: boolean; busy: boolean; onSignOut: () => void }) {
  const t = useT()
  return (
    <>
      <DescriptionList className="mt-4">
        <DescriptionTerm>{t('share.account')}</DescriptionTerm>
        <DescriptionDetails>{name}</DescriptionDetails>
        <DescriptionTerm>{t('sync.server')}</DescriptionTerm>
        <DescriptionDetails className="break-all">{origin}</DescriptionDetails>
        {live && <Connection origin={origin} />}
      </DescriptionList>
      <div className="mt-6">
        <Button outline disabled={busy} onClick={onSignOut}>
          {t('share.logout')}
        </Button>
      </div>
    </>
  )
}

function Option({ value, icon, label, hint }: { value: StorageSource; icon: ReactNode; label: string; hint: string }) {
  return (
    <RadioField>
      <Radio value={value} color="blue" />
      <Label className="flex items-center gap-2">
        <span className="flex text-zinc-500 *:size-4 dark:text-zinc-400">{icon}</span>
        {label}
      </Label>
      <Description>{hint}</Description>
    </RadioField>
  )
}

/**
 * Where boards are kept besides this device: nowhere, Penrill Cloud or a self-hosted Penrill Server,
 * and the account there. Not something most people need, but it should be easy to find.
 */
export function SyncPage({ pref, onChange }: { pref: Preference; onChange: () => void }) {
  const t = useT()
  useAccounts((s) => s.version)
  const [source, setSource] = useState<StorageSource>(pref.source)
  const [address, setAddress] = useState(pref.address)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  let origin = ''
  try {
    origin = source === 'server' ? serverOrigin(address.trim()) : source === 'cloud' ? cloudOrigin : ''
  } catch {
    // Checked when saving.
  }
  const session = account(origin)
  const changed = source !== pref.source || (source === 'server' && origin !== pref.origin)

  function resetCredentials(): void {
    setName('')
    setPassword('')
    setRegister(false)
    setError(null)
  }

  async function save(): Promise<void> {
    if (source !== 'device' && !origin) {
      setError('storage.invalid')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (origin && !session) {
        const signedIn = await clientFor(origin).signIn(name, password, register)
        if (!signedIn.name || !signedIn.token) throw new Error('Invalid account')
        rememberAccount(origin, signedIn)
      } else if (origin) await clientFor(origin).boards()
      if (source === 'server') localStorage.setItem('penrill-server-origin', origin)
      localStorage.setItem('penrill-library-source', source)
      resetCredentials()
      onChange()
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0
      if (session && status === 401) {
        rememberAccount(origin, null)
        onChange()
      }
      setError(status === 401 ? 'share.authError' : status === 409 ? 'share.taken' : 'storage.error')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  async function signOut(): Promise<void> {
    setBusy(true)
    try {
      await boardLibrary.save()
      try {
        await clientFor(origin).signOut()
      } catch (reason) {
        if (!(reason instanceof ApiError && reason.status === 401)) throw reason
      }
      rememberAccount(origin, null)
      resetCredentials()
      onChange()
      // Penrill Cloud only has boards of a signed-in account: start over at its sign-in page.
      if (hostedCloud) window.location.reload()
    } catch {
      setError('storage.error')
    } finally {
      setBusy(false)
    }
  }

  // Penrill Cloud in the browser: the account is the whole story.
  if (hostedCloud) {
    return (
      <>
        <PageHeader title={t('home.sync')} description={t('sync.cloudHint')} />
        <Divider className="my-10" soft />
        <Subheading className="m-0">{t('share.account')}</Subheading>
        {session && <SignedIn origin={cloudOrigin} name={session.name} live busy={busy} onSignOut={() => void signOut()} />}
        {error && <Text className="mt-4 text-red-600! dark:text-red-500!">{t(error)}</Text>}
      </>
    )
  }

  const submitLabel: MessageKey = busy ? 'storage.connecting' : origin && !session ? (register ? 'share.register' : 'share.login') : 'storage.apply'
  const canSubmit = !busy && (changed || (!!origin && !session))

  return (
    <>
      <PageHeader title={t('home.sync')} description={t('sync.intro')} />
      <form
        className="max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Divider className="my-10" soft />
        <Fieldset disabled={busy}>
          <Legend>{t('storage.destination')}</Legend>
          <RadioGroup
            className="mt-4!"
            value={source}
            onChange={(value: string) => {
              setSource(value as StorageSource)
              resetCredentials()
            }}
          >
            <Option value="device" icon={<ComputerDesktopIcon />} label={t('storage.device')} hint={t('sync.deviceHint')} />
            {cloudOrigin && <Option value="cloud" icon={<CloudIcon />} label={t(cloudLabel)} hint={t('sync.cloudHint')} />}
            <Option value="server" icon={<ServerStackIcon />} label={t('storage.server')} hint={t('sync.serverHint')} />
          </RadioGroup>
          {source === 'server' && (
            <Field className="mt-8">
              <Label>{t('storage.address')}</Label>
              <Input
                type="url"
                required
                value={address}
                placeholder="https://"
                onChange={(e) => {
                  setAddress(e.target.value)
                  resetCredentials()
                }}
              />
              <Description>
                <TextLink href={SELF_HOST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                  {t('sync.selfHost')}
                  <ArrowTopRightOnSquareIcon className="size-3.5" />
                </TextLink>
              </Description>
            </Field>
          )}
        </Fieldset>

        {source !== 'device' && origin && (
          <>
            <Divider className="my-10" soft />
            <Subheading className="m-0">{t('share.account')}</Subheading>
            {session ? (
              <SignedIn origin={origin} name={session.name} live={!changed} busy={busy} onSignOut={() => void signOut()} />
            ) : (
              <Fieldset disabled={busy} className="mt-2">
                <Text className="m-0">{t('sync.signInHint')}</Text>
                <FieldGroup className="mt-6!">
                  <Field>
                    <Label>{t('share.username')}</Label>
                    <Input required autoComplete="username" pattern="[a-z0-9_\-]{3,32}" title={t('share.nameHint')} value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>{t('share.password')}</Label>
                    <Input
                      required
                      type="password"
                      autoComplete={register ? 'new-password' : 'current-password'}
                      minLength={10}
                      maxLength={256}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {register && <Description>{t('share.nameHint')}</Description>}
                  </Field>
                </FieldGroup>
                <Button
                  plain
                  className="mt-4"
                  onClick={() => {
                    setRegister(!register)
                    setError(null)
                  }}
                >
                  {t(register ? 'share.existing' : 'share.createAccount')}
                </Button>
              </Fieldset>
            )}
          </>
        )}

        {error && (
          <Field className="mt-6">
            <ErrorMessage className="whitespace-pre-line" role="alert">
              {t(error)}
            </ErrorMessage>
          </Field>
        )}
        <Divider className="my-10" soft />
        <div className="flex justify-end">
          <Button type="submit" color="blue" disabled={!canSubmit}>
            {t(submitLabel)}
          </Button>
        </div>
      </form>
    </>
  )
}
