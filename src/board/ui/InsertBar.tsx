import type { ReactNode } from 'react'
import { useSession } from '../editorContext'
import { usePrefs } from '../store'
import type { DockEdge } from '../workspaceLayout'
import { ToolBar } from './ToolBar'

/** Thin wrapper over ToolBar for an edge's docked tools; hides on bottom while the math keypad is open. */
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
  const items = usePrefs((s) => s.workspaceLayout.docks[edge])
  if (edge === 'bottom' && formulaEdit) return null
  return (
    <ToolBar
      edge={edge}
      items={items}
      templates={templates}
      insertLabels={insertLabels}
      popoverOptions={popoverOptions}
    />
  )
}
