import * as Headless from '@headlessui/react'
import { useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditor, useSession } from '../editorContext'
import { useT } from '../i18n'
import { usePrefs } from '../store'
import { isToolShown, type ToolbarToolId } from '../toolbarLayout'
import { Bar, FlyoutPanel, InsertButton } from './chrome'
import { AxesIcon, FormulaIcon, ImageIcon, RulerIcon, ShapesIcon, TextIcon } from './icons'
import { GraphPanel, InstrumentsPanel, ShapesPanel, useInstrumentRows } from './InsertMenus'

/** An insert bar button that opens a flyout above the bar. */
function InsertFlyout({
  icon,
  label,
  active,
  className,
  children
}: {
  icon: ReactNode
  label: string
  active?: boolean
  className?: string
  children: (close: () => void) => ReactNode
}) {
  return (
    <Headless.Popover className="flex">
      <Headless.PopoverButton as={InsertButton} icon={icon} label={label} active={active} />
      <FlyoutPanel anchor="top" className={className}>
        {({ close }) => <>{children(close)}</>}
      </FlyoutPanel>
    </Headless.Popover>
  )
}

/**
 * Bottom centre: things you put on the board (text, formulas, shapes, graphs, the drawing
 * instruments, images and templates), each with its name. Steps aside while the math keypad,
 * which sits in the same place, is open.
 */
export function InsertBar({ templates }: { templates?: ReactNode }) {
  const editor = useEditor()
  const t = useT()
  const { tool, formulaEdit } = useSession(useShallow((s) => ({ tool: s.tool, formulaEdit: s.formulaEdit })))
  const layout = usePrefs((s) => s.toolbarLayout)
  const instrumentsOn = useInstrumentRows().some((r) => r.on)
  const fileRef = useRef<HTMLInputElement>(null)
  const show = (id: ToolbarToolId): boolean => isToolShown(layout, id)
  if (formulaEdit) return null

  const buttons = [
    show('text') && (
      <InsertButton key="text" icon={<TextIcon />} label={t('insert.text')} active={tool === 'text'} onClick={() => editor.session.getState().setTool('text')} />
    ),
    show('formula') && <InsertButton key="formula" icon={<FormulaIcon />} label={t('insert.formula')} onClick={() => editor.startFormula()} />,
    show('shapes') && (
      <InsertFlyout key="shapes" icon={<ShapesIcon />} label={t('insert.shapes')} active={tool === 'shape'} className="insert-flyout">
        {(close) => <ShapesPanel close={close} />}
      </InsertFlyout>
    ),
    show('graph') && (
      <InsertFlyout key="graph" icon={<AxesIcon />} label={t('insert.graph')} className="insert-flyout">
        {(close) => <GraphPanel close={close} />}
      </InsertFlyout>
    ),
    show('instruments') && (
      <InsertFlyout key="instruments" icon={<RulerIcon />} label={t('insert.instruments')} active={instrumentsOn} className="insert-flyout w-72">
        {(close) => <InstrumentsPanel close={close} />}
      </InsertFlyout>
    ),
    show('image') && <InsertButton key="image" icon={<ImageIcon />} label={t('insert.image')} title={t('tool.image')} onClick={() => fileRef.current?.click()} />,
    templates && show('templates') && <div key="templates" className="contents">{templates}</div>
  ].filter(Boolean)

  return (
    <>
      {buttons.length > 0 && (
        <Bar role="toolbar" aria-label={t('insert.label')} className="flex max-w-full min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {buttons}
        </Bar>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          void editor.insertImages(files)
        }}
      />
    </>
  )
}
