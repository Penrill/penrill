import { Cog8ToothIcon as Cog16 } from '@heroicons/react/16/solid'
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  TrashIcon,
  UserGroupIcon
} from '@heroicons/react/20/solid'
import { LinkNavigation } from '@penrill/ui/link'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@penrill/ui/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer
} from '@penrill/ui/sidebar'
import { SidebarLayout } from '@penrill/ui/sidebar-layout'
import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import appIcon from '../../../../../build/icon.png'
import { useT } from '../../../../board/i18n'
import { SettingsDialog, type SettingsDialogProps } from '../../../../board/ui/SettingsDialog'
import { useApp } from '../../appState'
import { boardLibrary } from '../../boardLibrary'
import { platform } from '../../platform'
import { homePath, routePath } from '../../router'
import { cloudLabel, hostedCloud, storagePreference } from '../../storagePreference'
import { account, useAccounts } from '../../sync/accounts'
import { syncCoordinator } from '../../sync/coordinator'
import { useRemoteBoards } from '../../sync/librarySync'
import { BoardsPage, DeletedPage, placeName, useDeviceBoards } from './BoardsPage'
import { ManageTagsDialog } from './dialogs'
import { TagDot } from './parts'
import { SharedPage } from './SharedPage'
import { SyncPage } from './SyncPage'
import { TemplatesPage } from './TemplatesPage'

const REMOTE_REFRESH_MS = 10_000

const navigation = { navigate: (href: string) => boardLibrary.navigate(href), newTabs: platform.platform === 'web' }

function Count({ n }: { n: number }) {
  return <span className="ml-auto text-xs/5 font-normal text-zinc-500 tabular-nums dark:text-zinc-400">{n}</span>
}

function Brand({ className }: { className?: string }) {
  return (
    <span className={clsx('flex min-w-0 items-center gap-3', className)}>
      <img src={appIcon} alt="" draggable={false} className="size-7 shrink-0 rounded-md" />
      <span className="truncate text-base/6 font-semibold text-zinc-950 sm:text-sm/5 dark:text-white">{hostedCloud ? 'Penrill Cloud' : 'Penrill'}</span>
    </span>
  )
}

/** Where boards sync to, for the sidebar: nothing for this device only, otherwise the place and a dot. */
function SyncState({ origin }: { origin: string }) {
  const t = useT()
  const catalog = useRemoteBoards()
  if (!origin || !account(origin)) return null
  const known = catalog.origin === origin
  return (
    <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
      <span className="truncate">{placeName(origin, t)}</span>
      <span aria-hidden="true" className={clsx('size-1.5 shrink-0 rounded-full', !known ? 'bg-zinc-400' : catalog.error ? 'bg-amber-500' : 'bg-green-500')} />
    </span>
  )
}

/**
 * The home screen: a sidebar with the library's pages (boards, templates, the shared library,
 * recently deleted), tags to filter boards by, and sync and settings at the bottom.
 */
export function HomeScreen({ settings }: { settings: Omit<SettingsDialogProps, 'open' | 'onClose'> }) {
  const t = useT()
  const tab = useApp((s) => s.homeTab)
  const current = useApp((s) => s.board)
  const tags = useApp((s) => s.library.tags)
  const templates = useApp((s) => s.library.templates)
  const boards = useDeviceBoards()
  useAccounts((s) => s.version)
  const [pref, setPref] = useState(storagePreference)
  const [tagId, setTagId] = useState<string | null>(null)
  const [manageTags, setManageTags] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const changed = (event: StorageEvent): void => {
      if (!event.key || event.key === 'penrill-library-source' || event.key === 'penrill-server-origin') setPref(storagePreference())
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  useEffect(() => {
    void syncCoordinator.refresh()
    const timer = setInterval(() => void syncCoordinator.refresh(), REMOTE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [pref])
  useEffect(() => {
    void boardLibrary.refreshLibrary()
  }, [])
  // Keep "Edited 5 min ago" fresh.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const signedIn = !!account(pref.origin)
  const page = tab === 'shared' && !signedIn ? 'boards' : tab
  const live = boards.filter((b) => !b.deletedAt)
  const deletedCount = boards.length - live.length
  const back = current && live.some((b) => b.id === current.id) ? current : null
  const tag = page === 'boards' ? (tags.find((x) => x.id === tagId) ?? null) : null

  let content: ReactNode
  if (page === 'templates') content = <TemplatesPage shared={signedIn} />
  else if (page === 'shared') content = <SharedPage key={pref.origin} origin={pref.origin} />
  else if (page === 'deleted') content = <DeletedPage />
  else if (page === 'sync') content = <SyncPage key={pref.origin + pref.source} pref={pref} onChange={() => setPref(storagePreference())} />
  else content = <BoardsPage tag={tag} onClearTag={() => setTagId(null)} origin={pref.origin} />

  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1">
          <Brand />
        </div>
        {back && (
          <SidebarSection className="mt-3">
            <SidebarItem href={routePath({ view: 'board', id: back.id })} title={back.title}>
              <ArrowUturnLeftIcon />
              <SidebarLabel>{t('home.back')}</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        )}
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          <SidebarItem href={homePath('boards')} current={page === 'boards' && !tag} onClick={() => setTagId(null)}>
            <Squares2X2Icon />
            <SidebarLabel>{t('home.title')}</SidebarLabel>
            <Count n={live.length} />
          </SidebarItem>
          <SidebarItem href={homePath('templates')} current={page === 'templates'}>
            <RectangleStackIcon />
            <SidebarLabel>{t('tpl.title')}</SidebarLabel>
            <Count n={templates.length} />
          </SidebarItem>
          {signedIn && (
            <SidebarItem href={homePath('shared')} current={page === 'shared'}>
              <UserGroupIcon />
              <SidebarLabel>{t('share.library')}</SidebarLabel>
            </SidebarItem>
          )}
          <SidebarItem href={homePath('deleted')} current={page === 'deleted'}>
            <TrashIcon />
            <SidebarLabel>{t('home.recentlyDeleted')}</SidebarLabel>
            {deletedCount > 0 && <Count n={deletedCount} />}
          </SidebarItem>
        </SidebarSection>

        <SidebarSection>
          <div className="flex items-center justify-between">
            <SidebarHeading className="m-0">{t('card.tags')}</SidebarHeading>
            <button
              type="button"
              aria-label={t('tags.manage')}
              title={t('tags.manage')}
              aria-haspopup="dialog"
              onClick={() => setManageTags(true)}
              className="mb-1 flex size-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200"
            >
              <Cog16 className="size-4" />
            </button>
          </div>
          {tags.length === 0 && <p className="m-0 px-2 text-xs/5 text-zinc-500 dark:text-zinc-400">{t('tags.none')}</p>}
          {tags.map((x) => (
            <SidebarItem key={x.id} href={homePath('boards')} current={tag?.id === x.id} onClick={() => setTagId(x.id)}>
              <span data-slot="icon" className="flex size-5 items-center justify-center sm:size-4">
                <TagDot color={x.color} className="size-2.5" />
              </span>
              <SidebarLabel>{x.name}</SidebarLabel>
              <Count n={live.filter((b) => b.tagIds.includes(x.id)).length} />
            </SidebarItem>
          ))}
        </SidebarSection>

        <SidebarSpacer />

        <SidebarSection>
          <SidebarItem href={homePath('sync')} current={page === 'sync'}>
            <ArrowPathIcon />
            <SidebarLabel>{t('home.sync')}</SidebarLabel>
            <SyncState origin={pref.origin} />
          </SidebarItem>
          <SidebarItem aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
            <Cog6ToothIcon />
            <SidebarLabel>{t('settings.title')}</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>
      {hostedCloud && signedIn && (
        <SidebarFooter>
          <p className="m-0 truncate px-2 text-xs/5 text-zinc-500 dark:text-zinc-400">
            {account(pref.origin)?.name} · {t(cloudLabel)}
          </p>
        </SidebarFooter>
      )}
    </Sidebar>
  )

  const navbar = (
    <Navbar>
      <NavbarSection className="min-w-0">
        <Brand />
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <NavbarItem aria-label={t('home.newBoard')} title={t('home.newBoard')} onClick={() => void boardLibrary.newBoard()}>
          <PlusIcon />
        </NavbarItem>
      </NavbarSection>
    </Navbar>
  )

  return (
    <LinkNavigation value={navigation}>
      <div data-catalyst className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
        <SidebarLayout navbar={navbar} sidebar={sidebar} openLabel={t('home.openMenu')} closeLabel={t('home.closeMenu')}>
          {content}
        </SidebarLayout>
      </div>
      <ManageTagsDialog open={manageTags} tags={tags} onClose={() => setManageTags(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} {...settings} />
    </LinkNavigation>
  )
}
