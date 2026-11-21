import { useT } from '../i18n'
import { Bar, ToolButton } from './chrome'
import { FitIcon, MinusIcon, PlusIcon } from './icons'
import { useEditor, useSession } from '../editorContext'

/** Bottom right: show everything, zoom out, the zoom level (back to 100%), zoom in. Phones zoom with two fingers, so they only get the level. */
export function ZoomControls() {
  const editor = useEditor()
  const zoom = useSession((s) => s.zoom)
  const t = useT()
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
