import { TrashIcon } from '@heroicons/react/16/solid'
import { Alert, AlertActions, AlertTitle } from '@penrill/ui/alert'
import { Button } from '@penrill/ui/button'
import { Checkbox, CheckboxField, CheckboxGroup } from '@penrill/ui/checkbox'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@penrill/ui/dialog'
import { Field, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useT } from '../../../../board/i18n'
import { TAG_COLORS, type BoardEntry, type Tag } from '../../../../shared/library'
import { boardLibrary } from '../../boardLibrary'
import { platform } from '../../platform'
import { TagDot } from './parts'

const lib = platform.library
const refresh = (): Promise<void> => boardLibrary.refreshLibrary()

/** Ask for a new name (boards, templates). */
export function RenameDialog({
  open,
  title,
  label,
  value,
  onClose,
  onSave
}: {
  open: boolean
  title: string
  label: string
  value: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const t = useT()
  const [name, setName] = useState(value)
  useEffect(() => {
    if (open) setName(value)
  }, [open, value])
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && name.trim() !== value) onSave(name.trim())
          onClose()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogBody>
          <Field>
            <Label>{label}</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="blue" disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/** "Are you sure?" for what can't be undone. */
export function ConfirmAlert({
  open,
  message,
  confirm,
  onClose,
  onConfirm
}: {
  open: boolean
  message: string
  confirm: string
  onClose: () => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Alert open={open} onClose={onClose}>
      <AlertTitle>{message}</AlertTitle>
      <AlertActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          color="red"
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {confirm}
        </Button>
      </AlertActions>
    </Alert>
  )
}

/** The tags of one board: tick the ones it has, or make a new one. */
export function BoardTagsDialog({ open, entry, tags, onClose }: { open: boolean; entry: BoardEntry; tags: Tag[]; onClose: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const toggle = async (id: string): Promise<void> => {
    const next = entry.tagIds.includes(id) ? entry.tagIds.filter((x) => x !== id) : [...entry.tagIds, id]
    await lib.setTags(entry.id, next)
    await refresh()
  }
  const add = async (): Promise<void> => {
    if (!name.trim()) return
    const tag = await lib.createTag(name.trim(), TAG_COLORS[tags.length % TAG_COLORS.length])
    await lib.setTags(entry.id, [...entry.tagIds, tag.id])
    setName('')
    await refresh()
  }
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>{t('card.tags')}</DialogTitle>
      <DialogDescription className="truncate">{entry.title}</DialogDescription>
      <DialogBody>
        {tags.length === 0 ? (
          <Text className="m-0">{t('tags.none')}</Text>
        ) : (
          <CheckboxGroup>
            {tags.map((tag) => (
              <CheckboxField key={tag.id}>
                <Checkbox color="blue" checked={entry.tagIds.includes(tag.id)} onChange={() => void toggle(tag.id)} />
                <Label className="flex items-center gap-2">
                  <TagDot color={tag.color} />
                  {tag.name}
                </Label>
              </CheckboxField>
            ))}
          </CheckboxGroup>
        )}
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <div className="flex-1">
            <Input aria-label={t('tags.new')} value={name} placeholder={t('tags.placeholder')} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" outline disabled={!name.trim()}>
            {t('tags.add')}
          </Button>
        </form>
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** All tags: rename, recolour, delete. */
export function ManageTagsDialog({ open, tags, onClose }: { open: boolean; tags: Tag[]; onClose: () => void }) {
  const t = useT()
  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t('tags.manage')}</DialogTitle>
      <DialogBody>
        {tags.length === 0 && <Text className="m-0">{t('tags.none')}</Text>}
        <ul role="list" className="m-0 flex list-none flex-col gap-4 p-0">
          {tags.map((tag) => (
            <li key={tag.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-40 flex-1">
                <Input
                  aria-label={t('tags.placeholder')}
                  defaultValue={tag.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim()
                    if (value && value !== tag.name) void lib.updateTag(tag.id, { name: value }).then(refresh)
                  }}
                />
              </div>
              <div role="radiogroup" aria-label={t('tags.color')} className="flex gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={tag.color === c}
                    aria-label={c}
                    onClick={() => void lib.updateTag(tag.id, { color: c }).then(refresh)}
                    className={clsx(
                      'size-6 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-zinc-900',
                      tag.color === c ? 'ring-2 ring-zinc-950 dark:ring-white' : 'hover:scale-110'
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <Button plain aria-label={t('tags.delete')} title={t('tags.delete')} onClick={() => void lib.deleteTag(tag.id).then(refresh)}>
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
