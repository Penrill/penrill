import { FolderIcon, FolderPlusIcon, UserPlusIcon } from '@heroicons/react/16/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../../../board/i18n'
import { account } from '../../sync/accounts'
import { clientFor } from '../../sync/clients'
import { refreshCommunity, useCommunity } from '../../sync/librarySync'

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
