import { ArrowTopRightOnSquareIcon } from '@heroicons/react/16/solid'
import { CloudIcon, ServerStackIcon, SignalIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { DescriptionDetails, DescriptionList, DescriptionTerm } from '@penrill/ui/description-list'
import { Divider } from '@penrill/ui/divider'
import { Description, Field, Label } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Text, TextLink } from '@penrill/ui/text'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT, type MessageKey } from '../../../../board/i18n'
import { shortPin } from '../../../../shared/connect'
import type { FoundServer } from '../../../../shared/platform'
import { boardLibrary } from '../../boardLibrary'
import { platform } from '../../platform'
import { cloudLabel, cloudOrigin, setStoragePreference, storagePreference } from '../../storagePreference'
import { account, rememberAccount, useAccounts } from '../../sync/accounts'
import { ApiError } from '../../sync/api'
import { clientFor } from '../../sync/clients'
import { connectFlow, useConnect, type ConnectState } from '../../sync/connect'
import { useRemoteBoards } from '../../sync/librarySync'
import { PageHeader } from './parts'
import { FoldersSection } from './Folders'
import { askWhichBoards, ChooseBoards, isChoosingBoards, SyncedBoards } from './SyncBoards'

const SELF_HOST_URL = 'https://github.com/Penrill/penrill-server'

type Preference = ReturnType<typeof storagePreference>

/** Is the saved server answering. */
function Connection({ origin }: { origin: string }) {
  const t = useT()
  const catalog = useRemoteBoards()
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
    </>
  )
}

/** Signed in: who, where, how sync is doing, and the way out. */
function Connected({ pref, name, onChange }: { pref: Preference; name: string; onChange: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function disconnect(): Promise<void> {
    setBusy(true)
    setFailed(false)
    try {
      await boardLibrary.save()
      try {
        // Ends this device's token on the server too, so it no longer shows among the account's devices.
        await clientFor(pref.origin).signOut()
      } catch (reason) {
        if (!(reason instanceof ApiError && reason.status === 401)) throw reason
      }
      rememberAccount(pref.origin, null)
      setStoragePreference('device')
      connectFlow.cancel()
      onChange()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DescriptionList>
        <DescriptionTerm>{t('share.account')}</DescriptionTerm>
        <DescriptionDetails>{name}</DescriptionDetails>
        <DescriptionTerm>{t('sync.server')}</DescriptionTerm>
        <DescriptionDetails className="break-all">{pref.source === 'cloud' ? t(cloudLabel) : pref.origin}</DescriptionDetails>
        <Connection origin={pref.origin} />
      </DescriptionList>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button outline disabled={busy} onClick={() => void disconnect()}>
          {t('sync.disconnect')}
        </Button>
        {(pref.source === 'server' || pref.source === 'cloud') && (
          <Button plain onClick={() => void openPage(pref.source === 'cloud' ? pref.origin : `${pref.origin}/account`)}>
            {t('sync.manage')}
            <ArrowTopRightOnSquareIcon />
          </Button>
        )}
      </div>
      <Text className="mt-4">{t('sync.disconnectHint')}</Text>
      {failed && <Text className="mt-4 text-red-600! dark:text-red-500!">{t('storage.error')}</Text>}
      <SyncedBoards origin={pref.origin} />
      {pref.source === 'server' && <FoldersSection origin={pref.origin} />}
    </>
  )
}

function openPage(url: string): Promise<void> {
  if (platform.connect) return platform.connect.openExternal(url)
  window.open(url, '_blank', 'noopener')
  return Promise.resolve()
}

function Choice({ icon, title, badge, hint, children }: { icon: ReactNode; title: string; badge?: ReactNode; hint: string; children: ReactNode }) {
  return (
    <section className="py-2">
      <Subheading className="m-0 flex flex-wrap items-center gap-2">
        <span className="flex text-zinc-500 *:size-4 dark:text-zinc-400">{icon}</span>
        {title}
        {badge}
      </Subheading>
      <Text className="mt-1">{hint}</Text>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Not connected yet: Penrill Cloud, a server by address or link, or one found nearby. */
function Choices() {
  const t = useT()
  const [address, setAddress] = useState('')
  const [nearby, setNearby] = useState<FoundServer[] | null>(null)

  useEffect(() => {
    let alive = true
    void platform.connect?.discover().then((found) => alive && setNearby(found), () => alive && setNearby([]))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      {cloudOrigin && (
        <>
          <Choice
            icon={<CloudIcon />}
            title={t(cloudLabel)}
            badge={<Badge color="amber">{t('cloud.inDevelopment')}</Badge>}
            hint={t('sync.cloudHint')}
          >
            <Button color="blue" onClick={() => void connectFlow.connect('cloud')}>
              {t('storage.connect')}
            </Button>
          </Choice>
          <Divider className="my-8" soft />
        </>
      )}
      <Choice icon={<ServerStackIcon />} title={t('storage.server')} hint={t('sync.serverHint')}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (address.trim()) void connectFlow.connect(address)
          }}
        >
          <Field>
            <Label>{t('sync.serverField')}</Label>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="min-w-0 flex-1">
                <Input aria-label={t('sync.serverField')} value={address} spellCheck={false} autoCapitalize="none" placeholder="https://" onChange={(e) => setAddress(e.target.value)} />
              </div>
              <Button type="submit" color={cloudOrigin ? 'dark/zinc' : 'blue'} disabled={!address.trim()}>
                {t('storage.connect')}
              </Button>
            </div>
            <Description>{t('sync.serverFieldHint')}</Description>
          </Field>
        </form>
        {platform.connect && (
          <div className="mt-6">
            <Text className="flex items-center gap-2 font-medium text-zinc-950! dark:text-white!">
              <SignalIcon className="size-4 text-zinc-500" />
              {t('sync.nearby')}
            </Text>
            {nearby === null ? (
              <Text className="mt-2">{t('sync.searching')}</Text>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/5">
                {nearby.map((server) => (
                  <li key={server.origin} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm/6 text-zinc-950 dark:text-white">{server.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{server.origin}</span>
                    </span>
                    <Button outline onClick={() => void connectFlow.connect(server.origin)}>
                      {t('storage.connect')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Text className="mt-6">
          <TextLink href={SELF_HOST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
            {t('sync.selfHost')}
            <ArrowTopRightOnSquareIcon className="size-3.5" />
          </TextLink>
        </Text>
      </Choice>
    </>
  )
}

const FAILURES: Record<Extract<ConnectState, { step: 'failed' }>['reason'], MessageKey> = {
  invalid: 'sync.failed.invalid',
  unreachable: 'sync.failed.unreachable',
  outdated: 'sync.failed.outdated',
  denied: 'sync.failed.denied',
  expired: 'sync.failed.expired',
  mismatch: 'sync.failed.mismatch'
}

/** The connect flow while it runs: checking, comparing a fingerprint, waiting for the browser, or what went wrong. */
function Progress({ state }: { state: Exclude<ConnectState, { step: 'idle' } | { step: 'connected' }> }) {
  const t = useT()
  const cancel = (
    <Button plain onClick={() => connectFlow.cancel()}>
      {t('sync.cancel')}
    </Button>
  )
  switch (state.step) {
    case 'checking':
      return (
        <div role="status">
          <Text>{t('sync.checking', { origin: state.origin })}</Text>
          <div className="mt-6">{cancel}</div>
        </div>
      )
    case 'confirm':
      return (
        <div>
          <Subheading className="m-0">{t('sync.confirmTitle')}</Subheading>
          <Text className="mt-2">{t('sync.confirmText')}</Text>
          <p className="mt-4 font-mono text-2xl font-semibold tracking-wider text-zinc-950 dark:text-white">{shortPin(state.pin)}</p>
          <Text className="mt-1 break-all text-xs!">{state.origin}</Text>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button color="blue" onClick={() => connectFlow.confirm(true)}>
              {t('sync.trust')}
            </Button>
            {cancel}
          </div>
        </div>
      )
    case 'waiting':
      return (
        <div>
          <Subheading className="m-0">{t('sync.waitingTitle')}</Subheading>
          <Text className="mt-2">{t(platform.connect ? 'sync.waitingText' : 'sync.waitingTextWeb', { server: state.server })}</Text>
          <p className="mt-4 font-mono text-3xl font-semibold tracking-[0.15em] text-zinc-950 dark:text-white">{state.userCode}</p>
          <Text className="mt-4" role="status">
            {t('sync.waiting')}
          </Text>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button {...(platform.connect ? { outline: true } : { color: 'blue' })} onClick={() => connectFlow.reopen()}>
              {t(platform.connect ? 'sync.reopen' : 'sync.openTab')}
              <ArrowTopRightOnSquareIcon />
            </Button>
            {cancel}
          </div>
        </div>
      )
    case 'failed':
      return (
        <div>
          <Text className="text-red-600! dark:text-red-500!" role="alert">
            {t(FAILURES[state.reason])}
          </Text>
          {state.reason === 'unreachable' && !platform.connect && state.origin?.startsWith('https:') && state.origin !== cloudOrigin && (
            <Text className="mt-2">
              {t('sync.failed.certificate')}{' '}
              <TextLink href={state.origin} target="_blank" rel="noreferrer">
                {state.origin}
              </TextLink>
            </Text>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {state.origin && state.reason !== 'mismatch' && (
              <Button color="blue" onClick={() => void connectFlow.connect(state.origin === cloudOrigin ? 'cloud' : state.origin!)}>
                {t('sync.retry')}
              </Button>
            )}
            {cancel}
          </div>
        </div>
      )
  }
}

/**
 * Where boards are kept besides this device: nowhere, Penrill Cloud or a Penrill Server. Connecting
 * never asks for a password here: the browser does that on the server's own page (see sync/connect.ts).
 */
export function SyncPage({ pref, onChange }: { pref: Preference; onChange: () => void }) {
  const t = useT()
  useAccounts((s) => s.version)
  const state = useConnect()
  const session = pref.source !== 'device' ? account(pref.origin) : null
  const [, chosen] = useState(0)

  // A finished connection changes where boards go: let the home screen pick that up, once per connection.
  const handled = useRef<ConnectState | null>(null)
  useEffect(() => {
    if (state.step !== 'connected' || handled.current === state) return
    handled.current = state
    askWhichBoards(state.origin)
    onChange()
  }, [state, onChange])

  return (
    <>
      <PageHeader title={t('home.sync')} description={t('sync.intro')} />
      <div className="max-w-2xl">
        <Divider className="my-10" soft />
        {state.step !== 'idle' && state.step !== 'connected' ? (
          <Progress state={state} />
        ) : session && isChoosingBoards(pref.origin) ? (
          <ChooseBoards
            origin={pref.origin}
            server={pref.source === 'cloud' ? t(cloudLabel) : pref.origin}
            onDone={() => chosen((n) => n + 1)}
          />
        ) : session ? (
          <Connected pref={pref} name={session.name} onChange={onChange} />
        ) : (
          <Choices />
        )}
      </div>
    </>
  )
}
