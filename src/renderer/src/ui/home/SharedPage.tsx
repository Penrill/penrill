import { FolderIcon, FolderPlusIcon, RectangleStackIcon } from '@heroicons/react/16/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Divider } from '@penrill/ui/divider'
import { Field, Label } from '@penrill/ui/fieldset'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { renderThumbnail } from '../../../../board/engine/export'
import { decodeBoard, encodeBoard } from '../../../../board/engine/serialize'
import { useT, type MessageKey } from '../../../../board/i18n'
import { useApp } from '../../appState'
import { boardLibrary } from '../../boardLibrary'
import { platform } from '../../platform'
import { account } from '../../sync/accounts'
import type { Community } from '../../sync/api'
import { clientFor } from '../../sync/clients'
import { openRemote } from '../../sync/librarySync'
import { activeLink } from '../../sync/links'
import { PageHeader } from './parts'

const empty: Community = { folders: [], members: [], boards: [], templates: [] }

function Rows({ children }: { children: ReactNode }) {
  return <ul role="list" className="m-0 mt-3 list-none divide-y divide-zinc-950/5 p-0 dark:divide-white/5">{children}</ul>
}

function Row({ title, detail, action }: { title: string; detail?: string; action: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="m-0 truncate text-sm/6 font-medium text-zinc-950 dark:text-white">{title}</p>
        {detail && <p className="m-0 truncate text-xs/5 text-zinc-500 dark:text-zinc-400">{detail}</p>}
      </div>
      {action}
    </li>
  )
}

/** A picker and a button on one line (share a board, publish a template, add a member). */
function InlineForm({ label, button, onSubmit, children }: { label: string; button: string; onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <Field className="min-w-56 flex-1">
        <Label>{label}</Label>
        {children}
      </Field>
      <Button type="submit" outline>
        {button}
      </Button>
    </form>
  )
}

/**
 * The server's shared library: the template marketplace for everyone on the server, and folders
 * where a group (a class, a team) shares boards and templates.
 */
export function SharedPage({ origin }: { origin: string }) {
  const t = useT()
  const [catalog, setCatalog] = useState(empty)
  const [folder, setFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [member, setMember] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ key: MessageKey; error: boolean } | null>(null)
  const [pickedTemplate, setPickedTemplate] = useState('')
  const [pickedBoard, setPickedBoard] = useState('')
  const library = useApp((s) => s.library)
  const selected = catalog.folders.find((f) => f.id === folder)
  const current = account(origin)?.name
  const client = clientFor(origin)
  const shareable = library.boards.flatMap((b) => {
    const link = activeLink(b.id)
    return !b.deletedAt && link?.origin === origin && link.user === current && link.published && !catalog.boards.some((row) => row.folder === folder && row.id === link.remote)
      ? [{ entry: b, remote: link.remote }]
      : []
  })

  async function run(action?: () => Promise<void>, success?: MessageKey): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      await action?.()
      setCatalog(await client.community())
      if (success) setMessage({ key: success, error: false })
    } catch {
      setMessage({ key: 'share.failed', error: true })
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void run()
  }, [origin])

  async function publish(): Promise<void> {
    const template = library.templates.find((tp) => tp.id === pickedTemplate)
    if (!template) return
    const data = await decodeBoard(await platform.library.loadTemplate(template.id))
    await client.publishTemplate(folder, template.name, await encodeBoard(data))
    setPickedTemplate('')
  }
  async function install(id: string, name: string): Promise<void> {
    const bytes = await client.template(id)
    const data = await decodeBoard(bytes)
    const thumb = await renderThumbnail(data.items, data.background, boardLibrary.editor.features)
    await platform.library.saveTemplate(name, bytes, thumb)
    await boardLibrary.refreshLibrary()
  }
  const pick = (id: string): void => {
    setFolder(id)
    setMessage(null)
    setPickedBoard('')
  }
  const templates = catalog.templates.filter((tp) => tp.folder === folder)
  const boards = catalog.boards.filter((b) => b.folder === folder)

  return (
    <>
      <PageHeader title={t('share.library')} description={`${current ?? ''} · ${origin}`} />
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <nav aria-label={t('share.library')} className="mt-8 flex flex-wrap items-center gap-2">
          {[{ id: '', name: t('share.market') }, ...catalog.folders].map((f) => (
            <button
              key={f.id || 'market'}
              type="button"
              aria-pressed={folder === f.id}
              onClick={() => pick(f.id)}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm/6 font-medium ring-1 ring-inset',
                folder === f.id
                  ? 'bg-blue-500/10 text-blue-700 ring-blue-500/40 dark:text-blue-300'
                  : 'text-zinc-700 ring-zinc-950/10 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5'
              )}
            >
              {f.id ? <FolderIcon className="size-4 opacity-60" /> : <RectangleStackIcon className="size-4 opacity-60" />}
              {f.name}
            </button>
          ))}
        </nav>
        <form
          className="mt-4 flex max-w-md items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await client.createFolder(folderName)
              setFolderName('')
            })
          }}
        >
          <div className="flex-1">
            <Input aria-label={t('share.folderName')} placeholder={t('share.folderName')} required maxLength={128} value={folderName} onChange={(e) => setFolderName(e.target.value)} />
          </div>
          <Button type="submit" plain>
            <FolderPlusIcon />
            {t('share.newFolder')}
          </Button>
        </form>

        <Divider className="my-10" soft />

        {selected ? (
          <>
            <Subheading className="m-0">{t('share.members')}</Subheading>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {catalog.members
                .filter((m) => m.folder === folder)
                .map((m) => (
                  <Badge key={m.name}>{m.name}</Badge>
                ))}
            </div>
            {selected.owner === current && (
              <InlineForm label={t('share.username')} button={t('share.addMember')} onSubmit={() => void run(async () => {
                await client.addMember(folder, member)
                setMember('')
              })}>
                <Input required value={member} onChange={(e) => setMember(e.target.value)} />
              </InlineForm>
            )}

            <Subheading className="m-0 mt-10">{t('home.boards')}</Subheading>
            {boards.length > 0 && (
              <Rows>
                {boards.map((b) => (
                  <Row
                    key={b.id}
                    title={b.title}
                    action={
                      <Button outline onClick={() => void run(() => openRemote(origin, b))}>
                        {t('card.open')}
                      </Button>
                    }
                  />
                ))}
              </Rows>
            )}
            {shareable.length > 0 && (
              <InlineForm label={t('share.chooseBoard')} button={t('share.addBoard')} onSubmit={() => void run(async () => {
                await client.shareBoard(folder, pickedBoard)
                setPickedBoard('')
              })}>
                <Select required value={pickedBoard} onChange={(e) => setPickedBoard(e.target.value)}>
                  <option value="">{t('share.chooseBoard')}</option>
                  {shareable.map(({ entry, remote }) => (
                    <option key={entry.id} value={remote}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </InlineForm>
            )}
          </>
        ) : (
          <Text className="m-0">{t('share.audience')}</Text>
        )}

        <Subheading className="m-0 mt-10">{t('tpl.title')}</Subheading>
        {templates.length > 0 ? (
          <Rows>
            {templates.map((tp) => (
              <Row
                key={tp.id}
                title={tp.name}
                detail={tp.author}
                action={
                  <Button outline onClick={() => void run(() => install(tp.id, tp.name), 'share.installed')}>
                    {t('share.install')}
                  </Button>
                }
              />
            ))}
          </Rows>
        ) : (
          <Text className="mt-2 mb-0">{t('share.empty')}</Text>
        )}
        {library.templates.length > 0 && (
          <InlineForm label={t('share.localTemplate')} button={t(folder ? 'share.toFolder' : 'share.toMarket')} onSubmit={() => void run(publish, 'share.published')}>
            <Select required value={pickedTemplate} onChange={(e) => setPickedTemplate(e.target.value)}>
              <option value="">{t('share.chooseTemplate')}</option>
              {library.templates.map((tp) => (
                <option value={tp.id} key={tp.id}>
                  {tp.name}
                </option>
              ))}
            </Select>
          </InlineForm>
        )}
      </fieldset>
      {message && (
        <p role="status" className={clsx('mt-6 mb-0 text-sm/6', message.error ? 'text-red-600 dark:text-red-500' : 'text-green-700 dark:text-green-400')}>
          {t(message.key)}
        </p>
      )}
    </>
  )
}
