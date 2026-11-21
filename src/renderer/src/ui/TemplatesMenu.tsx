import { useEffect, useState } from 'react'
import { useT } from '../../../board/i18n'
import { StampIcon } from '../../../board/ui/icons'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@penrill/ui/dialog'
import { Button } from '@penrill/ui/button'
import { Input } from '@penrill/ui/input'
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from '@penrill/ui/dropdown'
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { boardLibrary } from '../boardLibrary'
import { useSession } from '../../../board/editorContext'
import { useApp } from '../appState'

export function TemplateThumb({ id, v }: { id: string; v?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void boardLibrary.templateThumbUrl(id).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id, v])
  return <div className="card-thumb">{url ? <img src={url} alt="" draggable={false} /> : <div className="card-thumb-empty" />}</div>
}

export function TemplatesMenu() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const templates = useApp((s) => s.library.templates)
  const hasSelection = useSession((s) => s.selectedIds.length > 0)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <button className="icon-btn" title={t('tpl.title')} aria-haspopup="dialog" onClick={() => setOpen(true)}><StampIcon /></button>
      <Dialog open={open} onClose={() => { setOpen(false); setEditing(null) }} size="2xl">
      <DialogTitle>{t('tpl.title')}</DialogTitle>
      <DialogBody>
      {hasSelection && (
        <form
          className="tag-new"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void boardLibrary.saveSelectionAsTemplate(name).then(() => setName(''))
          }}
        >
          <Input aria-label={t('tpl.namePlaceholder')} value={name} placeholder={t('tpl.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" outline disabled={!name.trim()}>
            {t('tpl.saveSelection')}
          </Button>
        </form>
      )}
      {templates.length === 0 ? (
        <p className="settings-hint">{t('tpl.empty')}</p>
      ) : (
        <div className="template-grid">
          {templates.map((tp) => (
            <div key={tp.id} className="template-card">
              <button
                className="template-open"
                title={t('tpl.insert')}
                onClick={() => {
                  setOpen(false)
                  void boardLibrary.insertTemplate(tp.id)
                }}
              >
                <TemplateThumb id={tp.id} v={tp.updatedAt} />
              </button>
              {editing === tp.id ? (
                <input
                  className="card-title-input"
                  autoFocus
                  defaultValue={tp.name}
                  onBlur={(e) => {
                    setEditing(null)
                    void boardLibrary.renameTemplate(tp.id, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if ((e.code === 'Enter' || e.code === 'NumpadEnter')) (e.target as HTMLInputElement).blur()
                    if (e.code === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <div className="template-name">
                  <span title={tp.name} onDoubleClick={() => setEditing(tp.id)}>
                    {tp.name}
                  </span>
                  <Dropdown>
                    <DropdownButton as="button" className="icon-btn" aria-label={t('card.more')}><EllipsisHorizontalIcon width={18} /></DropdownButton>
                    <DropdownMenu anchor="bottom end">
                      <DropdownItem onClick={() => setEditing(tp.id)}>{t('card.rename')}</DropdownItem>
                      <DropdownItem onClick={() => void boardLibrary.deleteTemplate(tp.id)}>{t('tpl.delete')}</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DialogBody>
      <DialogActions><Button outline onClick={() => setOpen(false)}>{t('common.close')}</Button></DialogActions>
      </Dialog>
    </>
  )
}
