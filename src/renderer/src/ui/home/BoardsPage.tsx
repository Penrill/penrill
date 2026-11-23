import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  EyeSlashIcon,
  FolderIcon,
  FolderOpenIcon,
  MapPinIcon,
  PencilIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/16/solid'
import { CloudIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, PlusIcon, Squares2X2Icon, TrashIcon as TrashOutline, UserIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@penrill/ui/dropdown'
import { Input, InputGroup } from '@penrill/ui/input'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { renderThumbnail } from '../../../../board/engine/export'
import { relativeTime, useT } from '../../../../board/i18n'
import { usePrefs } from '../../../../board/store'
import { PinIcon } from '../../../../board/ui/icons'
import type { BoardEntry, Tag } from '../../../../shared/library'
import { useApp } from '../../appState'
import { boardLibrary } from '../../boardLibrary'
import { platform } from '../../platform'
import { cloudLabel, cloudOrigin, storagePreference } from '../../storagePreference'
import { account } from '../../sync/accounts'
import type { RemoteBoard } from '../../sync/api'
import { syncCoordinator } from '../../sync/coordinator'
import { openRemote, remoteBoard, useRemoteBoards, useSyncStatus } from '../../sync/librarySync'
import { activeLink, allLinks, canCopy, forgetServerCopy, hiddenRemotes, hideRemote, linkBoard, linkFor, removeFromServer, saveLink, stopSyncing, useLinks } from '../../sync/links'
import { BoardTagsDialog, ConfirmAlert, RenameDialog } from './dialogs'
import { canShareBoard, ShareBoardDialog, SharedDeleteAlert, useOwner } from '../share/ShareBoard'
import { Card, CardBadges, CardGrid, CardMeta, CardTitle, EmptyState, PageHeader, Picture, Section, TagDot, tagBadgeColor, useImageUrl } from './parts'

const lib = platform.library
const refresh = (): Promise<void> => boardLibrary.refreshLibrary()

/** Where a synced board lives, in a word: the cloud, or the server's host name. */
export function placeName(origin: string, t: ReturnType<typeof useT>): string {
  if (origin === cloudOrigin) return t(cloudLabel)
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** Boards of this device, without those linked to an account that is signed out. */
export function useDeviceBoards(): BoardEntry[] {
  const boards = useApp((s) => s.library.boards)
  useLinks((s) => s.version)
  return boards.filter((b) => {
    const link = linkFor(b.id)
    return !link || account(link.origin)?.name === link.user
  })
}

function CardMenu({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <Dropdown>
      <DropdownButton plain aria-label={t('card.more')} title={t('card.more')}>
        <EllipsisHorizontalIcon />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="min-w-48">
        {children}
      </DropdownMenu>
    </Dropdown>
  )
}

function BoardCard({ entry, tags }: { entry: BoardEntry; tags: Tag[] }) {
  const t = useT()
  const lang = usePrefs((s) => s.lang)
  const [dialog, setDialog] = useState<'rename' | 'tags' | 'purge' | 'share' | 'deleteShared' | 'stopShared' | null>(null)
  const status = useSyncStatus((s) => s.states[entry.id])
  useLinks((s) => s.version)
  const link = activeLink(entry.id)
  const destination = storagePreference()
  const owner = useOwner(link)
  const deleted = !!entry.deletedAt
  const thumb = useImageUrl(() => boardLibrary.thumbUrl(entry), [entry])
  const run = (fn: () => Promise<unknown>) => () => void fn().then(refresh)
  const open = (): void => void boardLibrary.openBoard(entry.id)
  const folder = entry.filePath?.split(/[\\/]/).slice(-2, -1)[0]
  const close = (): void => setDialog(null)
  const copyable = canCopy(entry.id)
  // A board of this account that others can open: deleting it or taking it off the server first asks about their copies.
  const sharedByMe = !!link && !owner && !!link.shared
  const remove = (): void => void boardLibrary.deleteBoard(entry.id).then(refresh)
  const stop = (): void => {
    stopSyncing(entry.id)
    void syncCoordinator.refresh().then(refresh)
  }
  const choose = (then: () => void) => (copies: 'keep' | 'remove'): void => {
    const current = linkFor(entry.id)
    if (current) saveLink(entry.id, { ...current, copies }, true)
    then()
  }

  const menu = deleted ? (
    <CardMenu>
      <DropdownItem onClick={run(() => lib.restore(entry.id))}>
        <ArrowPathIcon />
        <DropdownLabel>{t('card.restore')}</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={() => setDialog('purge')}>
        <TrashIcon />
        <DropdownLabel>{t('card.deleteForever')}</DropdownLabel>
      </DropdownItem>
    </CardMenu>
  ) : (
    <CardMenu>
      {entry.missing && (
        <DropdownItem onClick={run(() => lib.locate(entry.id))}>
          <MapPinIcon />
          <DropdownLabel>{t('card.locate')}</DropdownLabel>
        </DropdownItem>
      )}
      <DropdownItem onClick={() => setDialog('rename')}>
        <PencilIcon />
        <DropdownLabel>{t('card.rename')}</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={run(() => lib.pin(entry.id, !entry.pinned))}>
        <PinIcon data-slot="icon" />
        <DropdownLabel>{t(entry.pinned ? 'card.unpin' : 'card.pin')}</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={() => setDialog('tags')}>
        <TagIcon />
        <DropdownLabel>{t('card.tags')}…</DropdownLabel>
      </DropdownItem>
      {!entry.missing && (
        <>
          {copyable && (
            <DropdownItem onClick={run(() => lib.duplicate(entry.id))}>
              <DocumentDuplicateIcon />
              <DropdownLabel>{t('card.duplicate')}</DropdownLabel>
            </DropdownItem>
          )}
          {!link && account(destination.origin) && (
            <DropdownItem
              onClick={run(async () => {
                linkBoard(entry.id, destination.origin)
                await syncCoordinator.refresh()
              })}
            >
              <CloudArrowUpIcon />
              <DropdownLabel>{t('sync.startBoard')}</DropdownLabel>
            </DropdownItem>
          )}
          {canShareBoard(link, owner) && (
            <DropdownItem onClick={() => setDialog('share')}>
              <ShareIcon />
              <DropdownLabel>{t('folders.shareMenu')}</DropdownLabel>
            </DropdownItem>
          )}
          {link && copyable && (
            <DropdownItem title={t('sync.stopBoardHint')} onClick={() => (sharedByMe ? setDialog('stopShared') : stop())}>
              <CloudIcon />
              <DropdownLabel>{t('sync.stopBoard')}</DropdownLabel>
            </DropdownItem>
          )}
          {copyable && (
            <DropdownItem onClick={run(() => boardLibrary.saveAsFile(entry.id))}>
              <ArrowUpTrayIcon />
              <DropdownLabel>{t('card.saveAsFile')}</DropdownLabel>
            </DropdownItem>
          )}
          {copyable && entry.kind === 'file' && platform.capabilities.showInFolder && (
            <DropdownItem onClick={run(() => lib.showInFolder(entry.id))}>
              <FolderOpenIcon />
              <DropdownLabel>{t('card.showInFolder')}</DropdownLabel>
            </DropdownItem>
          )}
        </>
      )}
      <DropdownDivider />
      <DropdownItem title={entry.kind === 'file' ? t('card.removeFromListHint') : undefined} onClick={() => (sharedByMe ? setDialog('deleteShared') : remove())}>
        <TrashIcon />
        <DropdownLabel>{t(entry.kind === 'file' ? 'card.removeFromList' : 'card.delete')}</DropdownLabel>
      </DropdownItem>
    </CardMenu>
  )

  return (
    <>
      <Card label={entry.title} picture={<Picture url={thumb} />} onOpen={open} disabled={deleted || entry.missing} menu={menu}>
        <CardTitle icon={entry.pinned ? <PinIcon /> : undefined}>{entry.title}</CardTitle>
        <CardMeta>
          {deleted ? t('home.deletedWhen', { when: relativeTime(lang, entry.deletedAt!) }) : t('home.edited', { when: relativeTime(lang, entry.updatedAt) })}
        </CardMeta>
        <CardBadges>
          {entry.missing && <Badge color="red">{t('home.missing')}</Badge>}
          {!entry.missing && entry.kind === 'file' && (
            <Badge title={entry.filePath}>
              <FolderIcon className="size-3" />
              {folder}
            </Badge>
          )}
          {owner && (
            <Badge title={t('home.ownerHint', { owner })}>
              <UserIcon className="size-3" />
              {owner}
            </Badge>
          )}
          {link && (
            <Badge color={status === 'denied' ? 'red' : status === 'offline' ? 'amber' : 'zinc'} title={t(`storage.${status ?? 'pending'}`)}>
              {status === 'denied' ? <ExclamationTriangleIcon className="size-3" /> : <CloudIcon className="size-3" />}
              {status === 'denied' || status === 'offline' ? t(`storage.${status}`) : t('sync.badge')}
            </Badge>
          )}
          {link && status === 'denied' && copyable && (
            <Button plain className="-my-1 text-xs!" title={t('storage.deniedHelp')} onClick={run(async () => {
              forgetServerCopy(entry.id)
              await syncCoordinator.refresh()
            })}>
              {t('storage.keepLocal')}
            </Button>
          )}
          {entry.tagIds.map((id) => {
            const tag = tags.find((x) => x.id === id)
            return tag ? (
              <Badge key={id} color={tagBadgeColor(tag.color)}>
                {tag.name}
              </Badge>
            ) : null
          })}
        </CardBadges>
      </Card>
      <RenameDialog
        open={dialog === 'rename'}
        title={t('card.rename')}
        label={t('home.boardName')}
        value={entry.title}
        onClose={close}
        onSave={(name) => void boardLibrary.renameBoard(entry.id, name)}
      />
      {dialog === 'tags' && <BoardTagsDialog open entry={entry} tags={tags} onClose={close} />}
      {dialog === 'share' && <ShareBoardDialog boardId={entry.id} title={entry.title} onClose={close} />}
      {dialog === 'deleteShared' && <SharedDeleteAlert title={entry.title} onClose={close} onChoose={choose(remove)} />}
      {dialog === 'stopShared' && <SharedDeleteAlert title={entry.title} onClose={close} onChoose={choose(stop)} />}
      <ConfirmAlert
        open={dialog === 'purge'}
        message={t('card.confirmDeleteForever', { title: entry.title })}
        confirm={t('card.deleteForever')}
        onClose={close}
        onConfirm={() => {
          // Deleting for good also takes the board off the server.
          if (linkFor(entry.id)) removeFromServer(entry.id)
          void lib.purge(entry.id).then(refresh).then(() => syncCoordinator.refresh())
        }}
      />
    </>
  )
}

/** The preview of a board on the server, drawn here once the card scrolls into view. */
function RemotePicture({ origin, row }: { origin: string; row: RemoteBoard }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let preview = ''
    const load = async (): Promise<void> => {
      const data = await remoteBoard(origin, row.id)
      if (!active) return
      const image = await renderThumbnail(data.items, data.background, boardLibrary.editor.features)
      if (active && image) {
        preview = URL.createObjectURL(new Blob([image as BlobPart], { type: 'image/webp' }))
        setUrl(preview)
      }
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void load().catch(() => {
        // The board can still be opened without a preview.
      })
    })
    if (ref.current) observer.observe(ref.current)
    return () => {
      active = false
      observer.disconnect()
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [origin, row.id, row.seq])
  return (
    <div ref={ref} className="size-full">
      <Picture url={url} />
    </div>
  )
}

/** A board on the server that this device has no copy of yet: opening it downloads it. */
function RemoteCard({ origin, row }: { origin: string; row: RemoteBoard }) {
  const t = useT()
  const lang = usePrefs((s) => s.lang)
  const open = (): void => void openRemote(origin, row).catch(() => window.alert(t('storage.error')))
  const user = account(origin)?.name
  const menu = (
    <CardMenu>
      <DropdownItem onClick={open}>
        <ArrowDownTrayIcon />
        <DropdownLabel>{t('home.download')}</DropdownLabel>
      </DropdownItem>
      {user && (
        <DropdownItem title={t('home.hideRemoteHint')} onClick={() => hideRemote(origin, user, row.id)}>
          <EyeSlashIcon />
          <DropdownLabel>{t('home.hideRemote')}</DropdownLabel>
        </DropdownItem>
      )}
    </CardMenu>
  )
  return (
    <Card label={row.title} picture={<RemotePicture origin={origin} row={row} />} onOpen={open} menu={menu}>
      <CardTitle>{row.title}</CardTitle>
      <CardMeta>{t('home.edited', { when: relativeTime(lang, Date.parse(row.updated)) })}</CardMeta>
      <CardBadges>
        <Badge title={t('home.onServerHint')}>
          <CloudIcon className="size-3" />
          {t('home.onServer')}
        </Badge>
        {row.owner && row.owner !== user && (
          <Badge title={t('home.ownerHint', { owner: row.owner })}>
            <UserIcon className="size-3" />
            {row.owner}
          </Badge>
        )}
      </CardBadges>
    </Card>
  )
}

/** All boards: search, the tag picked in the sidebar, pinned first, then the rest by last edit. */
export function BoardsPage({ tag, onClearTag, origin }: { tag: Tag | null; onClearTag: () => void; origin: string }) {
  const t = useT()
  const tags = useApp((s) => s.library.tags)
  const boards = useDeviceBoards()
  const catalog = useRemoteBoards()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const { pinned, rest } = useMemo(() => {
    const live = boards
      .filter((b) => !b.deletedAt && (!q || b.title.toLowerCase().includes(q)) && (!tag || b.tagIds.includes(tag.id)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return { pinned: live.filter((b) => b.pinned), rest: live.filter((b) => !b.pinned) }
  }, [boards, q, tag])

  // Boards on the server this device never had, among the others by date. A board in the trash,
  // deleted from it or no longer synced here is not offered again.
  useLinks((s) => s.version)
  const user = account(origin)?.name
  const known = user ? new Set([...allLinks().filter(([, l]) => l.origin === origin && l.user === user).map(([, l]) => l.remote), ...hiddenRemotes(origin, user)]) : new Set<string>()
  const remote = user && catalog.origin === origin && !tag ? catalog.rows.filter((r) => !known.has(r.id) && r.title.toLowerCase().includes(q)) : []
  const cards = [
    ...rest.map((entry) => ({ key: entry.id, updated: entry.updatedAt, card: <BoardCard key={entry.id} entry={entry} tags={tags} /> })),
    ...remote.map((row) => ({ key: 'remote-' + row.id, updated: Date.parse(row.updated), card: <RemoteCard key={'remote-' + row.id} origin={origin} row={row} /> }))
  ].sort((a, b) => b.updated - a.updated)
  const nothing = pinned.length + cards.length === 0
  const offline = catalog.error && catalog.origin === origin && !!account(origin)

  return (
    <>
      <PageHeader
        title={
          tag ? (
            <span className="flex items-center gap-3">
              <TagDot color={tag.color} className="size-3" />
              {tag.name}
            </span>
          ) : (
            t('home.title')
          )
        }
        actions={
          <>
            <Button outline onClick={() => void boardLibrary.openFile()}>
              <FolderOpenIcon />
              {t('home.openFile')}
            </Button>
            <Button color="blue" onClick={() => void boardLibrary.newBoard()}>
              <PlusIcon />
              {t('home.newBoard')}
            </Button>
          </>
        }
      />
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="w-full sm:max-w-xs">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input type="search" value={query} aria-label={t('home.search')} placeholder={t('home.search')} onChange={(e) => setQuery(e.target.value)} />
          </InputGroup>
        </div>
        {tag && (
          <Button plain onClick={onClearTag}>
            <XMarkIcon />
            {t('home.clearFilter')}
          </Button>
        )}
      </div>
      {offline && (
        <p role="status" className="mt-6 mb-0 flex items-center gap-2 rounded-lg bg-amber-400/15 px-3 py-2 text-sm/6 text-amber-800 dark:text-amber-300">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          {t('storage.libraryOffline')}
        </p>
      )}
      {pinned.length > 0 && (
        <Section title={t('home.pinned')}>
          <CardGrid>
            {pinned.map((b) => (
              <BoardCard key={b.id} entry={b} tags={tags} />
            ))}
          </CardGrid>
        </Section>
      )}
      {cards.length > 0 && (
        <Section title={pinned.length > 0 ? t('home.boards') : undefined}>
          <CardGrid>{cards.map((c) => c.card)}</CardGrid>
        </Section>
      )}
      {nothing &&
        (q || tag ? (
          <EmptyState icon={<MagnifyingGlassIcon />} title={t('home.noResults')} />
        ) : (
          <EmptyState
            icon={<Squares2X2Icon />}
            title={t('home.empty')}
            hint={t('home.emptyHint')}
            action={
              <Button color="blue" onClick={() => void boardLibrary.newBoard()}>
                <PlusIcon />
                {t('home.newBoard')}
              </Button>
            }
          />
        ))}
    </>
  )
}

/** Recently deleted boards, kept for 30 days. */
export function DeletedPage() {
  const t = useT()
  const tags = useApp((s) => s.library.tags)
  const boards = useDeviceBoards()
  const deleted = boards.filter((b) => b.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!)
  return (
    <>
      <PageHeader title={t('home.recentlyDeleted')} description={t('home.deletedHint')} />
      {deleted.length > 0 ? (
        <Section>
          <CardGrid>
            {deleted.map((b) => (
              <BoardCard key={b.id} entry={b} tags={tags} />
            ))}
          </CardGrid>
        </Section>
      ) : (
        <EmptyState icon={<TrashOutline />} title={t('home.deletedNone')} />
      )}
    </>
  )
}
