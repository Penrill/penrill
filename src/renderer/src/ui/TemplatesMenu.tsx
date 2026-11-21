import { BookmarkIcon } from '@heroicons/react/16/solid'
import { Button } from '@penrill/ui/button'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '@penrill/ui/dialog'
import { Text } from '@penrill/ui/text'
import { useState } from 'react'
import { useSession } from '../../../board/editorContext'
import { useT } from '../../../board/i18n'
import { InsertButton } from '../../../board/ui/chrome'
import { StampIcon } from '../../../board/ui/icons'
import { SaveTemplateDialog, TemplateSections, useInsertAction } from './templates'

/** The board's Templates button: the same cards and menus as the home screen, inserting into this board. */
export function TemplatesMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasSelection = useSession((s) => s.selectedIds.length > 0)
  const main = useInsertAction(() => setOpen(false))
  return (
    <>
      <InsertButton icon={<StampIcon />} label={t('tpl.title')} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} size="4xl">
        <DialogTitle>{t('tpl.title')}</DialogTitle>
        <DialogBody className="-mt-6">
          <TemplateSections main={main} empty={<Text className="m-0">{t('tpl.empty')}</Text>} />
        </DialogBody>
        <DialogActions>
          {hasSelection && (
            <Button outline onClick={() => setSaving(true)}>
              <BookmarkIcon />
              {t('tpl.saveSelection')}
            </Button>
          )}
          <Button plain onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
      {saving && <SaveTemplateDialog onClose={() => setSaving(false)} />}
    </>
  )
}
