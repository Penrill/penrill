import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Link } from '@penrill/ui/link'
import { Code, Strong, Text, TextLink } from '@penrill/ui/text'
import { RectangleStackIcon, UsersIcon } from '@heroicons/react/16/solid'
import type { ReactNode } from 'react'
import { api, type Session } from '../api'
import { useT } from '../i18n'
import { CopyField, LoadFailed, Loading, PageTitle, Qr, Step, useLoad } from '../parts'

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="block border-t border-zinc-950/10 pt-4 hover:border-zinc-950/30 dark:border-white/10 dark:hover:border-white/30">
      <span className="block text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">{label}</span>
      <span className="mt-3 block text-3xl/8 font-semibold text-zinc-950 sm:text-2xl/8 dark:text-white">{value}</span>
    </Link>
  )
}

function StepItem({ number, done, title, children }: { number: number; done: boolean; title: string; children: ReactNode }) {
  const t = useT()
  return (
    <li className="py-6">
      <div className="flex items-start gap-4">
        <Step number={number} done={done} label={t('home.done')} />
        <div className="min-w-0 flex-1">
          <Subheading level={3}>{title}</Subheading>
          {children}
        </div>
      </div>
    </li>
  )
}

/** "Sync › Your server" in bold inside a sentence, whatever the language puts around it. */
function withStrong(text: string, strong: RegExp): ReactNode[] {
  return text.split(strong).map((part, i) => (i % 2 ? <Strong key={i}>{part}</Strong> : part))
}

/** Home: what to do on this server, in order, each step showing whether it is done. */
export function HomePage({ user }: { user: NonNullable<Session['user']> }) {
  const t = useT()
  const { data: home, failed, reload } = useLoad(api.home)
  if (failed && !home) return <LoadFailed retry={reload} />
  if (!home) return <Loading />
  const admin = home.counts
  let step = 0

  return (
    <>
      <PageTitle title={t('home.welcome', { name: user.name })} />

      {admin && (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t('home.people')} value={admin.users} href="/admin" />
          <Stat label={t('home.devices')} value={admin.devices} href="/admin/devices" />
          <Stat label={t('home.boards')} value={admin.boards} href="/admin/server" />
          <Stat label={t('home.templates')} value={admin.templates} href="/admin/templates" />
        </div>
      )}

      <Subheading className="mt-12">{t('home.start')}</Subheading>
      <ol className="mt-4 divide-y divide-zinc-950/5 border-y border-zinc-950/5 dark:divide-white/5 dark:border-white/5">
        <StepItem number={++step} done={home.devices > 0} title={t('home.connectTitle')}>
          <Text className="mt-1">{withStrong(t('home.connectText'), /((?:Sync|Синхронізація) › (?:Your server|Ваш сервер))/)}</Text>
          <div className="mt-4 flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1 basis-64">
              <CopyField value={home.origin} label={t('home.address')} />
              {home.shortPin && (
                <Text className="mt-3">
                  {t('home.pin', { pin: '\u0000' })
                    .split('\u0000')
                    .flatMap((part, i) => (i ? [<Code key={i}>{home.shortPin}</Code>, part] : [part]))}
                </Text>
              )}
              <Text className="mt-3">{t('home.scan')}</Text>
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <Button outline href={home.link} rel="noreferrer">
                  {t('home.connectLink')}
                </Button>
                {home.devices > 0 && (
                  <Text>
                    <TextLink href="/account">{t('home.connected', { n: home.devices === 1 ? t('devices.countOne') : t('devices.count', { n: home.devices }) })}</TextLink>
                  </Text>
                )}
              </div>
            </div>
            <Qr svg={home.qr} label={t('home.connectLink')} />
          </div>
        </StepItem>
        {admin && (
          <StepItem number={++step} done={admin.users > 1} title={t('home.inviteTitle')}>
            <Text className="mt-1">{t('home.inviteText')}</Text>
            <Button outline href="/admin" className="mt-4">
              <UsersIcon />
              {t('home.inviteTitle')}
            </Button>
          </StepItem>
        )}
        <StepItem number={++step} done={!!admin && admin.templates > 0} title={t('home.shareTitle')}>
          <Text className="mt-1">{withStrong(t('home.shareText'), /((?:Share|Поділитися)…)/)}</Text>
          {admin && (
            <Button outline href="/admin/templates" className="mt-4">
              <RectangleStackIcon />
              {t('home.templates')}
            </Button>
          )}
        </StepItem>
      </ol>
    </>
  )
}
