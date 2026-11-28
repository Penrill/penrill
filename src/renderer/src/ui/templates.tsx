import {
  ArrowDownTrayIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
  UserIcon,
  UsersIcon
} from '@heroicons/react/16/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@penrill/ui/dialog'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@penrill/ui/dropdown'
import { Field, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Text } from '@penrill/ui/text'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { renderThumbnail } from '../../../board/engine/export'
import { decodeBoard } from '../../../board/engine/serialize'
import { relativeTime, useT } from '../../../board/i18n'
import { usePrefs } from '../../../board/store'
import type { TemplateEntry } from '../../../shared/library'
import { useApp } from '../appState'
import { boardLibrary } from '../boardLibrary'
import { homePath } from '../router'
import { account } from '../sync/accounts'
import type { SharedTemplate } from '../sync/api'
import { clientFor } from '../sync/clients'
import { useCommunity } from '../sync/librarySync'
import {
  addTemplate,
  deleteTemplate,
  duplicateTemplate,
  isMine,
  localFor,
  pushTemplate,
  shareTemplate,
  stopSharing,
  templateLink,
  templateServer,
  useTemplateLinks,
  type TemplateLink
} from '../sync/templates'
import { ConfirmAlert, RenameDialog } from './home/dialogs'
import { Card, CardBadges, CardGrid, CardMeta, CardTitle, EmptyState, Picture, Section, useImageUrl } from './home/parts'

// Templates look and act the same wherever they are listed (the home screen, the board's Templates
// dialog). Two kinds, kept apart everywhere: this person's own, which they can change and share, and
// ones added from others, which follow their author's edits and can only be used or duplicated.

export interface TemplateAction {
  label: string
  icon: ReactNode
  run: (template: TemplateEntry) => void
}

/** The main action on the home screen: a new board with the template on it. */
export function useNewBoardAction(): TemplateAction {
  const t = useT()
  return { label: t('tpl.newBoard'), icon: <PlusIcon />, run: (tp) => void boardLibrary.newBoardFromTemplate(tp.id) }
}

/** The main action inside a board: the template goes onto it. */
export function useInsertAction(after?: () => void): TemplateAction {
  const t = useT()
  return {
    label: t('tpl.insert'),
    icon: <ArrowDownTrayIcon />,
    run: (tp) => {
      after?.()
      void boardLibrary.insertTemplate(tp.id)
    }
  }
}

/** Folder names by id, for "Shared in 7-B". */
function useFolderName(): (id: string) => string | undefined {
  const catalog = useCommunity((s) => s.catalog)
  return (id) => catalog?.folders.find((f) => f.id === id)?.name
}

function SharedBadge({ link }: { link: TemplateLink }) {
  const t = useT()
  const folderName = useFolderName()
  const folder = link.folder ? folderName(link.folder) : undefined
  return (
    <Badge color="sky">
      <UsersIcon className="size-3" />
      {link.folder ? t('tpl.sharedIn', { folder: folder ?? '…' }) : t('tpl.sharedEveryone')}
    </Badge>
  )
}

function TemplateCard({ template, main }: { template: TemplateEntry; main: TemplateAction }) {
  const t = useT()
  const lang = usePrefs((s) => s.lang)
  useTemplateLinks((s) => s.version)
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'share' | null>(null)
  const thumb = useImageUrl(() => boardLibrary.templateThumbUrl(template.id), [template.id, template.updatedAt])
  const link = templateLink(template.id)
  const mine = isMine(template.id)
  const close = (): void => setDialog(null)
  const duplicate = (): void => void duplicateTemplate(template.id, t('tpl.copyName', { name: template.name }))
  return (
    <>
      <Card
        label={main.label}
        picture={<Picture url={thumb} />}
        onOpen={() => main.run(template)}
        menu={
          <Dropdown>
            <DropdownButton plain aria-label={t('card.more')} title={t('card.more')}>
              <EllipsisHorizontalIcon />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="min-w-56">
              <DropdownItem onClick={() => main.run(template)}>
                {main.icon}
                <DropdownLabel>{main.label}</DropdownLabel>
              </DropdownItem>
              {mine && (
                <>
                  <DropdownItem onClick={() => setDialog('rename')}>
                    <PencilIcon />
                    <DropdownLabel>{t('card.rename')}</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem onClick={() => setDialog('share')}>
                    <ShareIcon />
                    <DropdownLabel>{t('tpl.share')}</DropdownLabel>
                  </DropdownItem>
                </>
              )}
              <DropdownItem onClick={duplicate}>
                <DocumentDuplicateIcon />
                <DropdownLabel>{t(mine ? 'card.duplicate' : 'tpl.duplicate')}</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => setDialog('delete')}>
                <TrashIcon />
                <DropdownLabel>{t(mine ? 'tpl.delete' : 'tpl.remove')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        }
      >
        <CardTitle>{template.name}</CardTitle>
        <CardMeta>
          {mine ? t('tpl.added', { when: relativeTime(lang, template.updatedAt ?? template.createdAt) }) : t('tpl.by', { author: link?.author ?? '' })}
        </CardMeta>
        <CardBadges>
          {link?.kind === 'mine' && <SharedBadge link={link} />}
          {link?.kind === 'theirs' && link.gone && <Badge color="amber">{t('tpl.gone')}</Badge>}
        </CardBadges>
      </Card>
      <RenameDialog
        open={dialog === 'rename'}
        title={t('card.rename')}
        label={t('tpl.namePlaceholder')}
        value={template.name}
        onClose={close}
        onSave={(name) => void boardLibrary.renameTemplate(template.id, name).then(() => pushTemplate(template.id))}
      />
      <ConfirmAlert
        open={dialog === 'delete'}
        message={t(!mine ? 'tpl.confirmRemove' : link ? 'tpl.confirmDeleteShared' : 'tpl.confirmDelete', { name: template.name })}
        confirm={t(mine ? 'tpl.delete' : 'tpl.remove')}
        onClose={close}
        onConfirm={() => void deleteTemplate(template.id)}
      />
      {dialog === 'share' && <ShareTemplateDialog template={template} onClose={close} />}
    </>
  )
}

/** This device's templates in two groups: this person's own, then those added from others. */
export function TemplateSections({ main, empty }: { main: TemplateAction; empty: ReactNode }) {
  const t = useT()
  const templates = useApp((s) => s.library.templates)
  useTemplateLinks((s) => s.version)
  const sorted = [...templates].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  const mine = sorted.filter((tp) => isMine(tp.id))
  const theirs = sorted.filter((tp) => !isMine(tp.id))
  return (
    <>
      <Section title={t('tpl.mine')}>
        {mine.length > 0 ? (
          <CardGrid>
            {mine.map((tp) => (
              <TemplateCard key={tp.id} template={tp} main={main} />
            ))}
          </CardGrid>
        ) : (
          empty
        )}
      </Section>
      {theirs.length > 0 && (
        <Section title={t('tpl.theirs')}>
          <Text className="-mt-2 mb-4">{t('tpl.theirsHint')}</Text>
          <CardGrid>
            {theirs.map((tp) => (
              <TemplateCard key={tp.id} template={tp} main={main} />
            ))}
          </CardGrid>
        </Section>
      )}
    </>
  )
}

/** The preview of a template on the server, drawn once its card scrolls into view. */
function SharedPicture({ origin, template }: { origin: string; template: SharedTemplate }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let preview = ''
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void (async () => {
        const data = await decodeBoard(await clientFor(origin).template(template.id))
        const image = await renderThumbnail(data.items, data.background, boardLibrary.editor.features)
        if (active && image) {
          preview = URL.createObjectURL(new Blob([image as BlobPart], { type: 'image/webp' }))
          setUrl(preview)
        }
      })().catch(() => {
        // Still addable without a preview.
      })
    })
    if (ref.current) observer.observe(ref.current)
    return () => {
      active = false
      observer.disconnect()
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [origin, template.id, template.updated])
  return (
    <div ref={ref} className="size-full">
      <Picture url={url} />
    </div>
  )
}

/** Templates others shared on the server that this device hasn't added yet. */
export function ServerTemplates() {
  const t = useT()
  const origin = templateServer()
  const { origin: listed, catalog } = useCommunity()
  useTemplateLinks((s) => s.version)
  useApp((s) => s.library.templates)
  const folderName = useFolderName()
  const [busy, setBusy] = useState<string | null>(null)
  if (!origin || listed !== origin || !catalog) return null
  const me = account(origin)?.name
  const available = catalog.templates.filter((tp) => tp.author !== me && !localFor(origin, tp.id))
  const add = (tp: SharedTemplate): void => {
    setBusy(tp.id)
    void addTemplate(origin, tp)
      .catch(() => window.alert(t('share.failed')))
      .finally(() => setBusy(null))
  }
  return (
    <Section title={t('tpl.onServer')}>
      {available.length > 0 ? (
        <CardGrid>
          {available.map((tp) => (
            <Card
              key={tp.id}
              label={t('share.install')}
              picture={<SharedPicture origin={origin} template={tp} />}
              onOpen={() => add(tp)}
              disabled={busy === tp.id}
              menu={
                <Button plain aria-label={t('share.install')} title={t('share.install')} onClick={() => add(tp)} disabled={busy === tp.id}>
                  <PlusIcon />
                </Button>
              }
            >
              <CardTitle>{tp.name}</CardTitle>
              <CardMeta>{t('tpl.by', { author: tp.author })}</CardMeta>
              <CardBadges>
                {tp.folder && (
                  <Badge>
                    <UsersIcon className="size-3" />
                    {folderName(tp.folder)}
                  </Badge>
                )}
              </CardBadges>
            </Card>
          ))}
        </CardGrid>
      ) : (
        <EmptyState icon={<UserIcon />} title={t('tpl.serverEmpty')} />
      )}
    </Section>
  )
}

/**
 * Shares one of this person's templates on the connected server, with everyone or one folder; or,
 * once shared, says where and offers to stop. Without a server it says where to connect one.
 */
export function ShareTemplateDialog({ template, onClose }: { template: TemplateEntry; onClose: () => void }) {
  const t = useT()
  const origin = templateServer()
  const link = templateLink(template.id)
  const folders = useCommunity((s) => (s.origin === origin ? s.catalog?.folders : undefined)) ?? []
  const [folder, setFolder] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function run(action: () => Promise<void>): Promise<void> {
    setState('busy')
    try {
      await action()
      onClose()
    } catch {
      setState('failed')
    }
  }

  const failed = state === 'failed' && <Text className="mt-4 text-red-600! dark:text-red-500!">{t('share.failed')}</Text>

  if (!origin)
    return (
      <Dialog open onClose={onClose} size="md">
        <DialogTitle>{t('tpl.shareTitle', { name: template.name })}</DialogTitle>
        <DialogDescription>{t('tpl.shareNoServer')}</DialogDescription>
        <DialogActions>
          <Button plain onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button color="blue" href={homePath('sync')} onClick={onClose}>
            {t('tpl.shareConnect')}
          </Button>
        </DialogActions>
      </Dialog>
    )

  if (link?.kind === 'mine')
    return (
      <Dialog open onClose={onClose} size="md">
        <DialogTitle>{t('tpl.shareTitle', { name: template.name })}</DialogTitle>
        <DialogDescription>{t('tpl.shareHint')}</DialogDescription>
        <DialogBody>
          <SharedBadge link={link} />
          <Text className="mt-4">{t('tpl.stopHint')}</Text>
          {failed}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button outline disabled={state === 'busy'} onClick={() => void run(() => stopSharing(template.id))}>
            {t('tpl.stopSharing')}
          </Button>
        </DialogActions>
      </Dialog>
    )

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogTitle>{t('tpl.shareTitle', { name: template.name })}</DialogTitle>
      <DialogDescription>{t('tpl.shareHint')}</DialogDescription>
      <DialogBody>
        <Field disabled={state === 'busy'}>
          <Label>{t('tpl.shareWith')}</Label>
          <Select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">{t('tpl.shareEveryone')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {t('tpl.shareFolder', { name: f.name })}
              </option>
            ))}
          </Select>
        </Field>
        {failed}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button color="blue" disabled={state === 'busy'} onClick={() => void run(() => shareTemplate(origin, template.id, folder))}>
          <ShareIcon />
          {t('tpl.shareButton')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Saves the selection as a new template, or puts it in place of one of this person's (after asking). */
export function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [replacing, setReplacing] = useState<TemplateEntry | null>(null)
  useTemplateLinks((s) => s.version)
  const templates = useApp((s) => s.library.templates).filter((tp) => isMine(tp.id))

  if (replacing)
    return (
      <Dialog open onClose={onClose} size="md">
        <DialogTitle>{t('tpl.saveSelection')}</DialogTitle>
        <DialogDescription>
          {t('tpl.replaceConfirm', { name: replacing.name })}
          {templateLink(replacing.id) && ` ${t('tpl.replaceShared')}`}
        </DialogDescription>
        <DialogActions>
          <Button plain onClick={() => setReplacing(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            onClick={() =>
              void boardLibrary
                .replaceTemplateWithSelection(replacing.id)
                .then(() => pushTemplate(replacing.id))
                .then(onClose)
            }
          >
            {t('tpl.replaceYes')}
          </Button>
        </DialogActions>
      </Dialog>
    )

  return (
    <Dialog open onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void boardLibrary.saveSelectionAsTemplate(name).then(onClose)
        }}
      >
        <DialogTitle>{t('tpl.saveSelection')}</DialogTitle>
        <DialogBody>
          <Field>
            <Label>{t('tpl.namePlaceholder')}</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {templates.length > 0 && (
            <div className="mt-6">
              <Text className="m-0">{t('tpl.replaceTitle')}</Text>
              <ul role="list" className="m-0 mt-2 grid list-none grid-cols-3 gap-2 p-0">
                {templates.map((tp) => (
                  <ReplaceChoice key={tp.id} template={tp} onPick={() => setReplacing(tp)} />
                ))}
              </ul>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="blue" disabled={!name.trim()}>
            {t('tpl.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function ReplaceChoice({ template, onPick }: { template: TemplateEntry; onPick: () => void }) {
  const thumb = useImageUrl(() => boardLibrary.templateThumbUrl(template.id), [template.id, template.updatedAt])
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full flex-col overflow-hidden rounded-lg text-left ring-1 ring-zinc-950/10 hover:ring-zinc-950/25 dark:ring-white/10 dark:hover:ring-white/25"
      >
        <span className="block aspect-[16/10] w-full bg-zinc-50 dark:bg-zinc-900">
          <Picture url={thumb} />
        </span>
        <span className="truncate px-2 py-1 text-xs/5 text-zinc-700 dark:text-zinc-300">{template.name}</span>
      </button>
    </li>
  )
}
