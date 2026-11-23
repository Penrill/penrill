import { useState } from 'react'
import { useT } from '../../../board/i18n'
import { BookmarkIcon } from '../../../board/ui/icons'
import { useApp } from '../appState'
import { canCopy, useLinks } from '../sync/links'
import { SaveTemplateDialog } from './templates'

/** The selection toolbar's "Save as template" button. */
export function SaveSelectionTemplate() {
  const t = useT()
  const [saving, setSaving] = useState(false)
  const board = useApp((s) => s.board)
  useLinks((s) => s.version)
  // A template is a copy that outlives the board: not from boards their owner keeps from being copied.
  if (!canCopy(board?.id)) return null
  return (
    <div className="menu-anchor">
      <button data-popover-anchor className="icon-btn" title={t('tpl.saveSelection')} onClick={() => setSaving(true)}>
        <BookmarkIcon />
      </button>
      {saving && <SaveTemplateDialog onClose={() => setSaving(false)} />}
    </div>
  )
}
