import { useState } from 'react'
import { useT } from '../../../board/i18n'
import { BookmarkIcon } from '../../../board/ui/icons'
import { SaveTemplateDialog } from './templates'

/** The selection toolbar's "Save as template" button. */
export function SaveSelectionTemplate() {
  const t = useT()
  const [saving, setSaving] = useState(false)
  return (
    <div className="menu-anchor">
      <button data-popover-anchor className="icon-btn" title={t('tpl.saveSelection')} onClick={() => setSaving(true)}>
        <BookmarkIcon />
      </button>
      {saving && <SaveTemplateDialog onClose={() => setSaving(false)} />}
    </div>
  )
}
