import { Avatar } from '@penrill/ui/avatar'
import { Button } from '@penrill/ui/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@penrill/ui/dropdown'
import { LinkNavigation } from '@penrill/ui/link'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@penrill/ui/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer
} from '@penrill/ui/sidebar'
import { SidebarLayout } from '@penrill/ui/sidebar-layout'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
  LanguageIcon
} from '@heroicons/react/16/solid'
import {
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  HomeIcon,
  RectangleStackIcon,
  ServerStackIcon,
  UserCircleIcon,
  UsersIcon
} from '@heroicons/react/20/solid'
import React, { useEffect, type ComponentType, type ReactNode } from 'react'
import { api, type Session } from './api'
import { setLang, useLang, useT } from './i18n'
import { FlashNotice, Loading, Notice } from './parts'
import { match, navigate, useLocation } from './router'
import { loadSession, useSession } from './session'
import { AccountPage } from './pages/Account'
import { BoardsPage } from './pages/admin/Boards'
import { DevicesPage } from './pages/admin/Devices'
import { PeoplePage } from './pages/admin/People'
import { ServerPage } from './pages/admin/Server'
import { TemplatesPage } from './pages/admin/Templates'
import { HomePage } from './pages/Home'
import { InvitePage } from './pages/Invite'
import { LinkPage } from './pages/Link'
import { LoginPage } from './pages/Login'
import { NotFoundPage } from './pages/NotFound'
import { ResetPage } from './pages/Reset'
import { SetupPage } from './pages/Setup'

const navigation = { navigate: (href: string) => navigate(href), newTabs: true }

/** Only paths on this server, so a crafted sign-in link cannot send people to another site. */
export function safeReturn(target: string | null): string {
  return target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : '/'
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to])
  return null
}

function Pattern() {
  return <div aria-hidden="true" className="server-pattern pointer-events-none fixed inset-0 -z-10 max-lg:hidden" />
}

function ServerMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={
        size === 'sm'
          ? 'flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-white/10'
          : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white/10'
      }
    >
      <ServerStackIcon className={size === 'sm' ? 'size-4' : 'size-5'} />
    </span>
  )
}

/** Sign-in, setup, invites and approving a device: one task in the middle of the page. */
function AuthShell({ server, children }: { server: string; children: ReactNode }) {
  const t = useT()
  return (
    <main className="relative isolate flex min-h-dvh flex-col p-2">
      <Pattern />
      <div className="flex grow items-center justify-center p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <ServerMark />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm/5 font-semibold">{server}</span>
              <span className="block text-xs/5 text-zinc-500 dark:text-zinc-400">{t('app.product')}</span>
            </span>
            <LanguageSwitch />
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}

function LanguageSwitch() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  return (
    <Button plain aria-label={t('app.language')} title={t('app.language')} onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}>
      <LanguageIcon />
      {lang === 'uk' ? 'EN' : 'UK'}
    </Button>
  )
}

interface NavEntry {
  href: string
  label: string
  icon: ComponentType<React.SVGProps<SVGSVGElement>>
}

function AppShell({ session, path, children }: { session: Session & { user: NonNullable<Session['user']> }; path: string; children: ReactNode }) {
  const t = useT()
  const { user } = session
  const admin = user.role !== 'member'
  const mine: NavEntry[] = [
    { href: '/', label: t('nav.home'), icon: HomeIcon },
    { href: '/account', label: t('nav.devices'), icon: UserCircleIcon }
  ]
  const manage: NavEntry[] = [
    { href: '/admin', label: t('nav.people'), icon: UsersIcon },
    { href: '/admin/templates', label: t('nav.templates'), icon: RectangleStackIcon },
    { href: '/admin/devices', label: t('nav.allDevices'), icon: DevicePhoneMobileIcon },
    { href: '/admin/server', label: t('nav.server'), icon: Cog6ToothIcon }
  ]
  // Boards without an owner belong to the Server page.
  const current = (href: string): boolean => path === href || (href === '/admin/server' && path === '/admin/boards')
  const item = ({ href, label, icon: Icon }: NavEntry) => (
    <SidebarItem key={href} href={href} current={current(href)}>
      <Icon data-slot="icon" />
      <SidebarLabel>{label}</SidebarLabel>
    </SidebarItem>
  )
  const signOut = async (): Promise<void> => {
    await api.logout().catch(() => undefined)
    await loadSession()
    navigate('/login', true)
  }
  const lang = useLang((s) => s.lang)
  const userMenu = (anchor: 'top start' | 'bottom end') => (
    <DropdownMenu className="min-w-56" anchor={anchor}>
      <DropdownItem onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}>
        <LanguageIcon />
        <DropdownLabel>{t('app.language')}</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={() => void signOut()}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>{t('nav.signOut')}</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )

  return (
    <SidebarLayout
      openLabel={t('app.menu')}
      closeLabel={t('app.menu')}
      backdrop={<Pattern />}
      navbar={
        <Navbar>
          <NavbarSection className="min-w-0">
            <span className="truncate text-sm/5 font-semibold">{session.server}</span>
          </NavbarSection>
          <NavbarSpacer />
          <NavbarSection>
            <Dropdown>
              <DropdownButton as={NavbarItem} aria-label={user.name}>
                <Avatar square initials={user.name.slice(0, 1)} className="size-7 bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white" />
              </DropdownButton>
              {userMenu('bottom end')}
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <SidebarItem href="/">
              <ServerMark size="sm" />
              <span className="min-w-0">
                <span className="block truncate">{session.server}</span>
                <span className="block text-xs/4 font-normal text-zinc-500 dark:text-zinc-400">{t('app.product')}</span>
              </span>
            </SidebarItem>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>{mine.map(item)}</SidebarSection>
            {admin && (
              <SidebarSection className="mt-8">
                {manage.map(item)}
              </SidebarSection>
            )}
            <SidebarSpacer />
          </SidebarBody>
          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar square initials={user.name.slice(0, 1)} className="size-10 bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-white" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">{user.name}</span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">{t(`role.${user.role}`)}</span>
                  </span>
                </span>
                <ChevronUpIcon />
              </DropdownButton>
              {userMenu('top start')}
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      <div className="mx-auto max-w-4xl">
        <FlashNotice className="mb-8" />
        {children}
      </div>
    </SidebarLayout>
  )
}

function Offline() {
  const t = useT()
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <Notice tone="bad">{t('app.offline')}</Notice>
        <Button outline onClick={() => void loadSession()}>
          {t('app.retry')}
        </Button>
      </div>
    </main>
  )
}

const ANONYMOUS = ['/login', '/setup', '/invite/:token', '/reset/:token']

export function App() {
  const { status, session } = useSession()
  const { path, query } = useLocation()

  let page: ReactNode
  if (status === 'loading' || !session) page = status === 'offline' ? <Offline /> : null
  else if (session.unclaimed) page = path === '/setup' ? <AuthShell server={session.server}><SetupPage /></AuthShell> : <Redirect to="/setup" />
  else if (path === '/setup') page = <Redirect to="/" />
  else if (match('/invite/:token', path)) page = <AuthShell server={session.server}><InvitePage token={match('/invite/:token', path)!.token} /></AuthShell>
  else if (match('/reset/:token', path)) page = <AuthShell server={session.server}><ResetPage token={match('/reset/:token', path)!.token} /></AuthShell>
  else if (!session.user) {
    if (path === '/login') page = <AuthShell server={session.server}><LoginPage returnTo={safeReturn(query.get('return'))} /></AuthShell>
    else page = <Redirect to={'/login?return=' + encodeURIComponent(path + (query.size ? '?' + query.toString() : ''))} />
  } else if (path === '/login') page = <Redirect to={safeReturn(query.get('return'))} />
  else if (ANONYMOUS.some((pattern) => match(pattern, path))) page = <Redirect to="/" />
  else if (path === '/link') page = <AuthShell server={session.server}><LinkPage code={query.get('code')} user={session.user.name} /></AuthShell>
  else {
    const user = session.user
    const admin = user.role !== 'member'
    const routes: Record<string, () => ReactNode> = {
      '/': () => <HomePage user={user} />,
      '/account': () => <AccountPage user={user.name} />,
      ...(admin
        ? {
            '/admin': () => <PeoplePage />,
            '/admin/templates': () => <TemplatesPage />,
            '/admin/devices': () => <DevicesPage />,
            '/admin/server': () => <ServerPage />,
            '/admin/boards': () => <BoardsPage />
          }
        : {})
    }
    const content = routes[path]?.() ?? (path.startsWith('/admin') && !admin ? <Redirect to="/" /> : <NotFoundPage />)
    page = (
      <AppShell session={{ ...session, user }} path={path}>
        {content}
      </AppShell>
    )
  }

  return (
    <LinkNavigation value={navigation}>
      {page ?? (
        <main className="flex min-h-dvh items-center justify-center">
          <Loading />
        </main>
      )}
    </LinkNavigation>
  )
}
