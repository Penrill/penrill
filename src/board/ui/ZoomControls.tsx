import { Bars2Icon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { useEditor, useSession } from '../editorContext'
import { useT } from '../i18n'
import { Bar, ToolButton } from './chrome'
import { FitIcon, MinusIcon, PlusIcon } from './icons'
import { useWorkspaceCustomize } from './WorkspaceCustomizer'

/** Show everything, zoom out, the zoom level (back to 100%), zoom in. Draggable between corners in Customize Mode. */
export function ZoomControls() {
  const editor = useEditor()
  const zoom = useSession((s) => s.zoom)
  const t = useT()
  const customize = useWorkspaceCustomize()

  if (customize.active) {
    const isDragged = customize.dragging?.kind === 'zoom'
    return (
      <div ref={(el) => customize.registerZoomZone(customize.layout.zoomDock, el)}>
        <Bar
          onPointerDown={(e) => customize.startDrag(e, { kind: 'zoom' })}
          title={t('customize.dragZoom')}
          className={clsx(
            'flex cursor-grab touch-none items-center gap-1.5 px-2.5 py-2 transition-opacity active:cursor-grabbing',
            isDragged && 'opacity-40'
          )}
        >
          <Bars2Icon className="size-4 rotate-90 text-zinc-400 dark:text-zinc-500" />
          <span className="text-sm/5 font-medium text-zinc-700 tabular-nums dark:text-zinc-200">
            {Math.round(zoom * 100)}%
          </span>
        </Bar>
      </div>
    )
  }

  return (
    <Bar className="flex items-center gap-0.5">
      <ToolButton className="max-sm:hidden" label={t('zoom.fit')} onClick={() => editor.fitToContent()}>
        <FitIcon />
      </ToolButton>
      <ToolButton className="max-sm:hidden" label={t('zoom.out')} onClick={() => editor.zoomStep(-1)}>
        <MinusIcon />
      </ToolButton>
      <button
        type="button"
        title={t('zoom.reset')}
        onClick={() => editor.resetZoom()}
        className="h-10 min-w-14 rounded-xl px-1 text-sm/5 font-medium text-zinc-700 tabular-nums hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolButton className="max-sm:hidden" label={t('zoom.in')} onClick={() => editor.zoomStep(1)}>
        <PlusIcon />
      </ToolButton>
    </Bar>
  )
}
