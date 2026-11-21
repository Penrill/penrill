import { FolderIcon, FolderPlusIcon, ShareIcon, UserPlusIcon } from '@heroicons/react/16/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@penrill/ui/dialog'
import { Field, Label } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Text, TextLink } from '@penrill/ui/text'
import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../../../board/i18n'
import type { BoardEntry } from '../../../../shared/library'
import { homePath } from '../../router'
import { account } from '../../sync/accounts'
import { clientFor } from '../../sync/clients'
import { refreshCommunity, useCommunity } from '../../sync/librarySync'
import type { Link } from '../../sync/links'

type Folders = NonNullable<ReturnType<typeof useCommunity.getState>['catalog']>

function useFolders(origin: string): Folders | null {
  return useCommunity((s) => (s.origin === origin ? s.catalog : null))
}

/** Runs a server change, then reloads the folders; remembers whether it failed. */
function useChange(origin: string) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setFailed(false)
    try {
      await action()
      await refreshCommunity(origin)
      return true
    } catch {
      setFailed(true)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, failed, run }
}

function FolderRow({ origin, folder, members, owned }: { origin: string; folder: Folders['folders'][number]; members: string[]; owned: boolean }) {
  const t = useT()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const { busy, failed, run } = useChange(origin)
  const add = (e: FormEvent): void => {
    e.preventDefault()
    void run(() => clientFor(origin).addMember(folder.id, name.trim())).then((ok) => {
      if (ok) {
        setName('')
        setAdding(false)
      }
    })
  }
  return (
    <li className="py-4">
      <div className="flex items-center gap-3">
        <FolderIcon className="size-4 shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate text-sm/6 font-medium text-zinc-950 dark:text-white">{folder.name}</span>
        {owned && !adding && (
          <Button plain onClick={() => setAdding(true)}>
            <UserPlusIcon />
            {t('folders.addMember')}
          </Button>
        )}
      </div>
      <div className="mt-2 ml-7 flex flex-wrap gap-1.5">
        <Badge color="sky" title={t('folders.ownerHint')}>
          {folder.owner}
        </Badge>
        {members.filter((m) => m !== folder.owner).map((m) => (
          <Badge key={m}>{m}</Badge>
        ))}
      </div>
      {adding && (
        <form className="mt-3 ml-7 flex max-w-md items-center gap-2" onSubmit={add}>
          <div className="flex-1">
            <Input autoFocus required disabled={busy} aria-label={t('share.username')} placeholder={t('share.username')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" outline disabled={busy}>
            {t('folders.add')}
          </Button>
          <Button plain onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </Button>
        </form>
      )}
      {failed && <Text className="mt-2 ml-7 text-red-600! dark:text-red-500!">{t('folders.memberFailed')}</Text>}
    </li>
  )
}

/** Folders on the connected server: groups (a class, a team) that share boards and templates. */
export function FoldersSection({ origin }: { origin: string }) {
  const t = useT()
  const catalog = useFolders(origin)
  const me = account(origin)?.name
  const [name, setName] = useState('')
  const { busy, failed, run } = useChange(origin)
  useEffect(() => {
    void refreshCommunity(origin).catch(() => undefined)
  }, [origin])

  const create = (e: FormEvent): void => {
    e.preventDefault()
    void run(() => clientFor(origin).createFolder(name.trim())).then((ok) => ok && setName(''))
  }

  return (
    <section className="mt-12">
      <Subheading className="m-0">{t('folders.title')}</Subheading>
      <Text className="mt-1">{t('folders.hint')}</Text>
      {catalog && catalog.folders.length > 0 && (
        <ul role="list" className="m-0 mt-3 list-none divide-y divide-zinc-950/5 p-0 dark:divide-white/5">
          {catalog.folders.map((f) => (
            <FolderRow
              key={f.id}
              origin={origin}
              folder={f}
              owned={f.owner === me}
              members={catalog.members.filter((m) => m.folder === f.id).map((m) => m.name)}
            />
          ))}
        </ul>
      )}
      <form className="mt-4 flex max-w-md items-center gap-2" onSubmit={create}>
        <div className="flex-1">
          <Input required maxLength={128} disabled={busy} aria-label={t('folders.name')} placeholder={t('folders.name')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" outline disabled={busy}>
          <FolderPlusIcon />
          {t('folders.create')}
        </Button>
      </form>
      {failed && <Text className="mt-2 text-red-600! dark:text-red-500!">{t('share.failed')}</Text>}
    </section>
  )
}

/** Can this synced board be put into a folder: it is on the server and belongs to this account. */
export function canShareBoard(link: Link | null, owner: string | null): link is Link {
  return !!link && !owner && !!link.published && account(link.origin)?.name === link.user
}

/** Puts one of this person's synced boards into a folder, so its members see it among their boards. */
export function ShareBoardDialog({ entry, link, onClose }: { entry: BoardEntry; link: Link; onClose: () => void }) {
  const t = useT()
  const catalog = useFolders(link.origin)
  const [folder, setFolder] = useState('')
  const { busy, failed, run } = useChange(link.origin)
  useEffect(() => {
    void refreshCommunity(link.origin).catch(() => undefined)
  }, [link.origin])

  const folders = catalog?.folders ?? []
  const sharedIn = folders.filter((f) => catalog?.boards.some((b) => b.folder === f.id && b.id === link.remote))
  const open = folders.filter((f) => !sharedIn.includes(f))
  const chosen = folder || open[0]?.id || ''

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogTitle>{t('folders.shareTitle', { name: entry.title })}</DialogTitle>
      <DialogDescription>{t('folders.shareHint')}</DialogDescription>
      <DialogBody>
        {sharedIn.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <Text className="m-0">{t('folders.sharedIn')}</Text>
            {sharedIn.map((f) => (
              <Badge key={f.id} color="sky">
                <FolderIcon className="size-3" />
                {f.name}
              </Badge>
            ))}
          </div>
        )}
        {open.length > 0 ? (
          <Field disabled={busy}>
            <Label>{t('folders.folder')}</Label>
            <Select value={chosen} onChange={(e) => setFolder(e.target.value)}>
              {open.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          catalog && (
            <Text className="m-0">
              {t(folders.length ? 'folders.allShared' : 'folders.none')}{' '}
              <TextLink href={homePath('sync')} onClick={onClose}>
                {t('folders.manage')}
              </TextLink>
            </Text>
          )
        )}
        {failed && <Text className="mt-4 text-red-600! dark:text-red-500!">{t('share.failed')}</Text>}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t(open.length ? 'common.cancel' : 'common.close')}
        </Button>
        {open.length > 0 && (
          <Button color="blue" disabled={busy || !chosen} onClick={() => void run(() => clientFor(link.origin).shareBoard(chosen, link.remote)).then((ok) => ok && onClose())}>
            <ShareIcon />
            {t('folders.shareButton')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
