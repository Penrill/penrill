import { CheckIcon, ClipboardIcon, CloudArrowUpIcon, FolderIcon, ShareIcon, UserPlusIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@penrill/ui/alert'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@penrill/ui/dialog'
import { Description, Label } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Switch, SwitchField } from '@penrill/ui/switch'
import { Text } from '@penrill/ui/text'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useT } from '../../../../board/i18n'
import { useApp } from '../../appState'
import { boardLibrary } from '../../boardLibrary'
import { storagePreference } from '../../storagePreference'
import { account } from '../../sync/accounts'
import { clientFor } from '../../sync/clients'
import { syncCoordinator } from '../../sync/coordinator'
import { drawLink } from '../../sync/join'
import { refreshCommunity, useCommunity, useRemoteBoards } from '../../sync/librarySync'
import type { Copies } from '../../sync/api'
import { activeLink, linkBoard, markShared, saveLink, useLinks, type Link } from '../../sync/links'
import { Bar } from '../../../../board/ui/chrome'

/** Whose a synced board is, when it is someone else's (shared with this account). */
export function useOwner(link: Link | null): string | null {
  const rows = useRemoteBoards((s) => s.rows)
  if (!link) return null
  const owner = link.owner ?? rows.find((r) => r.id === link.remote)?.owner
  return owner && owner !== link.user ? owner : null
}

/** Can this board be shared from here: it is on the server and belongs to this account. */
export function canShareBoard(link: Link | null, owner: string | null): link is Link {
  return !!link && !owner && !!link.published && account(link.origin)?.name === link.user
}

/** Runs one server change at a time and remembers whether the last one failed. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setFailed(false)
    try {
      await action()
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

function Failed({ children }: { children: string }) {
  return <Text className="mt-2 text-red-600! dark:text-red-500!">{children}</Text>
}

/** The draw link: one switch, and while it is on, the link to copy. For a class: no accounts needed. */
function LinkSection({ link, onTurnedOff }: { link: Link; onTurnedOff: () => void }) {
  const t = useT()
  // undefined while loading, null while the link is off.
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const { busy, failed, run } = useAction()
  const client = clientFor(link.origin)
  useEffect(() => {
    void run(async () => setToken(await client.boardLink(link.remote)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.origin, link.remote])

  const url = token ? drawLink(link.origin, token) : null
  const toggle = (on: boolean): void => {
    void run(async () => {
      if (on) {
        setToken(await client.turnOnBoardLink(link.remote))
        markShared(link)
      }
      else {
        await client.turnOffBoardLink(link.remote)
        setToken(null)
        onTurnedOff()
      }
    })
  }
  const copy = (): void => {
    if (!url) return
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      // No clipboard (an insecure page, a denied permission): select it for copying by hand.
      () => field.current?.select()
    )
  }

  return (
    <section>
      <SwitchField disabled={busy || token === undefined}>
        <Label>{t('join.linkTitle')}</Label>
        <Description>{t('join.linkHint')}</Description>
        <Switch color="blue" checked={!!token} onChange={toggle} />
      </SwitchField>
      {url && (
        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input ref={field} readOnly aria-label={t('join.linkTitle')} value={url} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <Button color="blue" onClick={copy}>
            {copied ? <CheckIcon /> : <ClipboardIcon />}
            {t(copied ? 'join.copied' : 'join.copy')}
          </Button>
        </div>
      )}
      {failed && <Failed>{t('people.failed')}</Failed>}
    </section>
  )
}

/** Whether the people the board is shared with may duplicate, export and copy it out. Off until the owner allows it. */
function CopyingSection({ boardId, link }: { boardId: string; link: Link }) {
  const t = useT()
  const { busy, failed, run } = useAction()
  const toggle = (on: boolean): void => {
    void run(async () => {
      await clientFor(link.origin).setBoardCopying(link.remote, on)
      saveLink(boardId, { ...(activeLink(boardId) ?? link), copying: on })
    })
  }
  return (
    <section>
      <SwitchField disabled={busy}>
        <Label>{t('share.copyTitle')}</Label>
        <Description>{t('share.copyHint')}</Description>
        <Switch color="blue" checked={link.copying === true} onChange={toggle} />
      </SwitchField>
      {failed && <Failed>{t('people.failed')}</Failed>}
    </section>
  )
}

/**
 * Asked before a shared board of this account is deleted or taken off the server: whether the people it
 * is shared with lose their copies or keep them.
 */
export function SharedDeleteAlert({ title, onClose, onChoose }: { title: string; onClose: () => void; onChoose: (copies: Copies) => void }) {
  const t = useT()
  const choose = (copies: Copies) => () => {
    onClose()
    onChoose(copies)
  }
  return (
    <Alert open onClose={onClose}>
      <AlertTitle>{t('share.deleteTitle', { title })}</AlertTitle>
      <AlertDescription>{t('share.deleteHint')}</AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button outline onClick={choose('keep')}>
          {t('share.deleteKeep')}
        </Button>
        <Button color="red" onClick={choose('remove')}>
          {t('share.deleteRemove')}
        </Button>
      </AlertActions>
    </Alert>
  )
}

/** People let in by username, and guests who came by the link: they see the board and draw on it. */
function PeopleSection({ link, version }: { link: Link; version: number }) {
  const t = useT()
  const [people, setPeople] = useState<string[] | null>(null)
  const [name, setName] = useState('')
  const { busy, failed, run } = useAction()
  const client = clientFor(link.origin)
  const load = async (): Promise<void> => setPeople(await client.boardPeople(link.remote))
  useEffect(() => {
    void run(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.origin, link.remote, version])

  const change = (action: () => Promise<void>): Promise<boolean> =>
    run(async () => {
      await action()
      await load()
    })
  const add = (e: FormEvent): void => {
    e.preventDefault()
    void change(async () => {
      await client.addBoardPerson(link.remote, name.trim())
      markShared(link)
    }).then((ok) => ok && setName(''))
  }

  return (
    <section>
      <Subheading className="m-0">{t('people.title')}</Subheading>
      <Text className="mt-1">{t('people.hint')}</Text>
      {people && people.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {people.map((p) => (
            <Badge key={p}>
              {p}
              <button
                type="button"
                disabled={busy}
                aria-label={t('people.remove', { name: p })}
                title={t('people.remove', { name: p })}
                className="-mr-1 rounded-sm opacity-60 hover:opacity-100"
                onClick={() => void change(() => client.removeBoardPerson(link.remote, p))}
              >
                <XMarkIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <form className="mt-3 flex items-center gap-2" onSubmit={add}>
        <div className="min-w-0 flex-1">
          <Input required disabled={busy} aria-label={t('share.username')} placeholder={t('share.username')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" outline disabled={busy || !name.trim()}>
          <UserPlusIcon />
          {t('folders.add')}
        </Button>
      </form>
      {failed && <Failed>{t('people.failed')}</Failed>}
    </section>
  )
}

/** Folders on the server (a class, a team): shown only when there are some to put the board into. */
function FolderSection({ link }: { link: Link }) {
  const t = useT()
  const catalog = useCommunity((s) => (s.origin === link.origin ? s.catalog : null))
  const [folder, setFolder] = useState('')
  const { busy, failed, run } = useAction()
  useEffect(() => {
    void refreshCommunity(link.origin).catch(() => undefined)
  }, [link.origin])

  const folders = catalog?.folders ?? []
  if (!folders.length) return null
  const sharedIn = folders.filter((f) => catalog?.boards.some((b) => b.folder === f.id && b.id === link.remote))
  const open = folders.filter((f) => !sharedIn.includes(f))
  const chosen = folder && open.some((f) => f.id === folder) ? folder : open[0]?.id ?? ''
  const add = (e: FormEvent): void => {
    e.preventDefault()
    void run(async () => {
      await clientFor(link.origin).shareBoard(chosen, link.remote)
      markShared(link)
      await refreshCommunity(link.origin)
    })
  }

  return (
    <section>
      <Subheading className="m-0">{t('folders.title')}</Subheading>
      <Text className="mt-1">{t('folders.shareHint')}</Text>
      {sharedIn.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sharedIn.map((f) => (
            <Badge key={f.id} color="sky">
              <FolderIcon className="size-3" />
              {f.name}
            </Badge>
          ))}
        </div>
      )}
      {open.length > 0 && (
        <form className="mt-3 flex items-center gap-2" onSubmit={add}>
          <div className="min-w-0 flex-1">
            <Select aria-label={t('folders.folder')} disabled={busy} value={chosen} onChange={(e) => setFolder(e.target.value)}>
              {open.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" outline disabled={busy || !chosen}>
            <FolderIcon />
            {t('folders.add')}
          </Button>
        </form>
      )}
      {failed && <Failed>{t('share.failed')}</Failed>}
    </section>
  )
}

/** A board that is not on a server yet: put it there first, or connect one in Sync. */
function NotOnServer({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const t = useT()
  const { origin } = storagePreference()
  const { busy, failed, run } = useAction()
  const link = activeLink(boardId)
  if (link) return <Text>{t('share.uploading')}</Text>
  if (!origin || !account(origin)) {
    return (
      <>
        <Text>{t('share.noServer')}</Text>
        <Button
          className="mt-4"
          outline
          onClick={() => {
            onClose()
            void boardLibrary.goHome('sync')
          }}
        >
          {t('share.openSync')}
        </Button>
      </>
    )
  }
  return (
    <>
      <Text>{t('share.localOnly', { server: new URL(origin).host })}</Text>
      <Button
        className="mt-4"
        color="blue"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            linkBoard(boardId, origin)
            await syncCoordinator.refresh()
          })
        }
      >
        <CloudArrowUpIcon />
        {t('sync.startBoard')}
      </Button>
      {failed && <Failed>{t('share.failed')}</Failed>}
    </>
  )
}

/** Everything about who can draw on a board: the link, people by name, folders. */
export function ShareBoardDialog({ boardId, title, onClose }: { boardId: string; title: string; onClose: () => void }) {
  const t = useT()
  useLinks((s) => s.version)
  const link = activeLink(boardId)
  const owner = useOwner(link)
  // Turning the link off takes its guests out of the people list too.
  const [version, setVersion] = useState(0)
  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>{t('folders.shareTitle', { name: title })}</DialogTitle>
      <DialogBody className="space-y-8">
        {canShareBoard(link, owner) ? (
          <>
            <LinkSection link={link} onTurnedOff={() => setVersion((v) => v + 1)} />
            <PeopleSection link={link} version={version} />
            <FolderSection link={link} />
            <CopyingSection boardId={boardId} link={link} />
          </>
        ) : (
          <NotOnServer boardId={boardId} onClose={onClose} />
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Top right of the board. Hidden on boards someone else shared, and for guests who came by a link. */
export function ShareButton() {
  const t = useT()
  const board = useApp((s) => s.board)
  const [open, setOpen] = useState(false)
  useLinks((s) => s.version)
  const link = board ? activeLink(board.id) : null
  const owner = useOwner(link)
  if (!board || owner || (link && account(link.origin)?.guest)) return null
  return (
    <>
      <Bar>
        <button
          type="button"
          aria-haspopup="dialog"
          title={t('folders.shareButton')}
          className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-sm/6 font-semibold text-white hover:bg-blue-500 max-sm:px-3"
          onClick={() => setOpen(true)}
        >
          <ShareIcon className="size-4" />
          <span className="max-sm:sr-only">{t('folders.shareButton')}</span>
        </button>
      </Bar>
      {open && <ShareBoardDialog boardId={board.id} title={board.title} onClose={() => setOpen(false)} />}
    </>
  )
}
