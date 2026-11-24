import type { ReactNode } from 'react'
import { useSession } from '../editorContext'
import type { DockEdge } from '../workspaceLayout'
import { ToolBar } from './ToolBar'

/** Thin wrapper over ToolBar for standalone insert bars; hides on the bottom edge while the math keypad is open. */
export function InsertBar({
  templates,
  edge = 'bottom',
  insertLabels = true,
  popoverOptions = false
}: {
  templates?: ReactNode
  edge?: DockEdge
  insertLabels?: boolean
  popoverOptions?: boolean
}) {
  const formulaEdit = useSession((s) => s.formulaEdit)
  if (edge === 'bottom' && formulaEdit) return null
  return (
    <ToolBar
      scope="insert"
      edge={edge}
      templates={templates}
      insertLabels={insertLabels}
      popoverOptions={popoverOptions}
    />
  )
}
