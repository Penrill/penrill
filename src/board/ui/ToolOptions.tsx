import * as Headless from '@headlessui/react'
import { Bars2Icon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditor, useSession } from '../editorContext'
import { TEXT_SIZES } from '../engine/text'
import { useT } from '../i18n'
import { shortcutKey } from '../shortcuts'
import { HIGHLIGHTER_COLORS, HIGHLIGHTER_SIZES, PEN_COLORS, PEN_SIZES, type InkSlot, prefsStore, usePrefs } from '../store'
import type { SelectToolId } from '../toolbarLayout'
import { allPlacedTools, flyoutAnchor, type OptionsDock } from '../workspaceLayout'
import { Bar, BarDivider, FlyoutPanel, PanelTitle, Segmented, ToolButton } from './chrome'
import { StyleIcon } from './icons'
import { LineStyleControls, SizeSlider } from './LineStyle'
import { isSelectMode, SELECT_MODES } from './ToolBar'
import { useWorkspaceCustomize } from './WorkspaceCustomizer'

function Swatches({
  colors,
  value,
  onChange,
  grid
}: {
  colors: string[]
  value: string
  onChange: (color: string) => void
  grid?: boolean
}) {
  const t = useT()
  return (
    <div
      role="radiogroup"
      aria-label={t('options.color')}
      className={grid ? 'grid grid-cols-6 gap-1' : 'flex shrink-0 items-center gap-0.5'}
    >
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.toLowerCase()}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className="group flex size-8 items-center justify-center rounded-full"
        >
          <span
            style={{ background: c }}
            className={clsx(
              'size-6 rounded-full ring-1 ring-zinc-950/15 ring-inset transition-transform duration-100 dark:ring-white/20',
              'group-hover:scale-110 group-aria-checked:scale-100 group-aria-checked:outline-2 group-aria-checked:outline-offset-2 group-aria-checked:outline-blue-500'
            )}
          />
        </button>
      ))}
    </div>
  )
}

function Sizes({
  sizes,
  value,
  onChange,
  spread
}: {
  sizes: number[]
  value: number
  onChange: (size: number) => void
  spread?: boolean
}) {
  const t = useT()
  const max = Math.max(...sizes)
  return (
    <div
      role="radiogroup"
      aria-label={t('line.width')}
      className={clsx('flex shrink-0 items-center', spread ? 'justify-between' : 'gap-0.5')}
    >
      {sizes.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s}`}
          title={`${s}`}
          onClick={() => onChange(s)}
          className={clsx(
            'flex size-8 items-center justify-center rounded-lg',
            value === s ? 'bg-blue-500/12 ring-1 ring-blue-500/40 ring-inset dark:bg-blue-500/25' : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
          )}
        >
          {/* In the text colour, not the ink's: a black pen on a dark bar or yellow on white would vanish. */}
          <span className="rounded-full bg-zinc-700 dark:bg-zinc-200" style={{ width: 4 + (s / max) * 16, height: 4 + (s / max) * 16 }} />
        </button>
      ))}
    </div>
  )
}

/** Less frequent settings of the current tool, behind one button at the end of the strip. */
function More({ label, edge, children }: { label: string; edge: OptionsDock; children: ReactNode }) {
  return (
    <Headless.Popover className="flex">
      <Headless.PopoverButton as={ToolButton} label={label}>
        <StyleIcon />
      </Headless.PopoverButton>
      <FlyoutPanel anchor={flyoutAnchor(edge)} className="line-style-flyout w-72">
        <PanelTitle>{label}</PanelTitle>
        {children}
      </FlyoutPanel>
    </Headless.Popover>
  )
}

function InkOptions({
  slot,
  colors,
  sizes,
  edge,
  onChange
}: {
  slot: InkSlot
  colors: string[]
  sizes: number[]
  edge: OptionsDock
  onChange: (patch: Partial<InkSlot>) => void
}) {
  const t = useT()
  return (
    <>
      <Swatches colors={colors} value={slot.color} onChange={(color) => onChange({ color })} />
      <BarDivider vertical />
      <Sizes sizes={sizes} value={slot.size} onChange={(size) => onChange({ size })} />
      <BarDivider vertical />
      <More label={t('options.style')} edge={edge}>
        <SizeSlider value={slot.size} max={Math.max(...sizes) * 3} onChange={(size) => onChange({ size })} live />
        <LineStyleControls value={slot} onChange={onChange} showCaps />
      </More>
    </>
  )
}

/** Popover card version of ink options (used when optionsMode === 'popover'). */
export function InkOptionsCard({
  title,
  slot,
  colors,
  sizes,
  onChange
}: {
  title: string
  slot: InkSlot
  colors: string[]
  sizes: number[]
  onChange: (patch: Partial<InkSlot>) => void
}) {
  return (
    <div className="w-64">
      <PanelTitle>{title}</PanelTitle>
      <Swatches colors={colors} value={slot.color} onChange={(color) => onChange({ color })} grid />
      <div className="mt-2.5 border-t border-zinc-950/10 pt-2.5 dark:border-white/10">
        <Sizes sizes={sizes} value={slot.size} onChange={(size) => onChange({ size })} spread />
      </div>
      <div className="mt-2">
        <SizeSlider value={slot.size} max={Math.max(...sizes) * 3} onChange={(size) => onChange({ size })} live />
      </div>
      <LineStyleControls value={slot} onChange={onChange} showCaps />
    </div>
  )
}

function TextOptions({ edge }: { edge: OptionsDock }) {
  const editor = useEditor()
  const t = useT()
  const style = usePrefs((s) => s.textStyle)
  const set = (patch: Partial<typeof style>): void => {
    prefsStore.setState((s) => ({ textStyle: { ...s.textStyle, ...patch } }))
    // Also restyle the text being typed right now.
    editor.formatEditingText(patch)
  }
  return (
    <>
      <Swatches colors={PEN_COLORS} value={style.color} onChange={(color) => set({ color })} />
      <BarDivider vertical />
      <div role="radiogroup" aria-label={t('line.width')} className="flex shrink-0 items-center gap-0.5">
        {TEXT_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={style.size === s}
            title={`${s}`}
            onClick={() => set({ size: s })}
            className={clsx(
              'flex size-8 items-center justify-center rounded-lg font-semibold text-zinc-700 dark:text-zinc-200',
              style.size === s ? 'bg-blue-500/12 ring-1 ring-blue-500/40 ring-inset dark:bg-blue-500/25' : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
            )}
          >
            <span style={{ fontSize: 9 + s / 4 }}>A</span>
          </button>
        ))}
      </div>
      <BarDivider vertical />
      <More label={t('options.textSize')} edge={edge}>
        <SizeSlider value={style.size} max={160} onChange={(size) => set({ size })} live />
      </More>
    </>
  )
}

/** Popover card version of text options (used when optionsMode === 'popover'). */
export function TextOptionsCard() {
  const editor = useEditor()
  const t = useT()
  const style = usePrefs((s) => s.textStyle)
  const set = (patch: Partial<typeof style>): void => {
    prefsStore.setState((s) => ({ textStyle: { ...s.textStyle, ...patch } }))
    editor.formatEditingText(patch)
  }
  return (
    <div className="w-64">
      <PanelTitle>{t('insert.text')}</PanelTitle>
      <Swatches colors={PEN_COLORS} value={style.color} onChange={(color) => set({ color })} grid />
      <div
        role="radiogroup"
        aria-label={t('options.textSize')}
        className="mt-2.5 flex items-center justify-between border-t border-zinc-950/10 pt-2.5 dark:border-white/10"
      >
        {TEXT_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={style.size === s}
            title={`${s}`}
            onClick={() => set({ size: s })}
            className={clsx(
              'flex size-8 items-center justify-center rounded-lg font-semibold text-zinc-700 dark:text-zinc-200',
              style.size === s ? 'bg-blue-500/12 ring-1 ring-blue-500/40 ring-inset dark:bg-blue-500/25' : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
            )}
          >
            <span style={{ fontSize: 9 + s / 4 }}>A</span>
          </button>
        ))}
      </div>
      <div className="mt-2">
        <SizeSlider value={style.size} max={160} onChange={(size) => set({ size })} live />
      </div>
    </div>
  )
}

function EraserOptions() {
  const t = useT()
  const mode = usePrefs((s) => s.eraserMode)
  const radius = usePrefs((s) => s.eraserRadius)
  return (
    <>
      <Segmented
        label={t('eraser.mode')}
        value={mode}
        onChange={(eraserMode) => prefsStore.setState({ eraserMode })}
        options={[
          { value: 'stroke', label: t('eraser.stroke') },
          { value: 'point', label: t('eraser.point') }
        ]}
      />
      <BarDivider vertical />
      <label className="flex shrink-0 items-center gap-2 px-2 text-sm/5 text-zinc-600 dark:text-zinc-300">
        <span>{t('eraser.size')}</span>
        <input
          type="range"
          min={4}
          max={80}
          value={radius}
          className="w-28 accent-blue-600"
          onChange={(e) => prefsStore.setState({ eraserRadius: Number(e.target.value) })}
        />
        <span className="w-6 text-right tabular-nums">{radius}</span>
      </label>
    </>
  )
}

/** Popover card version of eraser options (used when optionsMode === 'popover'). */
export function EraserOptionsCard() {
  const t = useT()
  const mode = usePrefs((s) => s.eraserMode)
  const radius = usePrefs((s) => s.eraserRadius)
  return (
    <div className="w-64">
      <PanelTitle>{t('eraser.mode')}</PanelTitle>
      <Segmented
        label={t('eraser.mode')}
        value={mode}
        onChange={(eraserMode) => prefsStore.setState({ eraserMode })}
        className="w-full *:flex-1 *:justify-center"
        options={[
          { value: 'stroke', label: t('eraser.stroke') },
          { value: 'point', label: t('eraser.point') }
        ]}
      />
      <label className="mt-3 flex items-center gap-2 text-sm/5 text-zinc-600 dark:text-zinc-300">
        <span>{t('eraser.size')}</span>
        <input
          type="range"
          min={4}
          max={80}
          value={radius}
          className="min-w-0 flex-1 accent-blue-600"
          onChange={(e) => prefsStore.setState({ eraserRadius: Number(e.target.value) })}
        />
        <span className="w-6 text-right tabular-nums">{radius}</span>
      </label>
    </div>
  )
}

function SelectOptions({ modes }: { modes: typeof SELECT_MODES }) {
  const editor = useEditor()
  const t = useT()
  const tool = useSession((s) => s.tool)
  return (
    <Segmented
      label={t('select.label')}
      value={tool}
      onChange={(next) => editor.session.getState().setTool(next)}
      options={modes.map((m) => ({ value: m.tool, label: t(m.label), icon: m.icon, title: `${t(m.label)} (${shortcutKey(m.shortcut)})` }))}
    />
  )
}

/** Popover card for choosing selection mode when selection tools are collapsed and options are in popover mode. */
export function SelectOptionsCard({ modes, onSelect }: { modes: SelectToolId[]; onSelect: () => void }) {
  const editor = useEditor()
  const t = useT()
  const tool = useSession((s) => s.tool)
  const items = modes
    .map((id) => SELECT_MODES.find((m) => m.tool === id))
    .filter((m): m is (typeof SELECT_MODES)[number] => !!m)
  return (
    <div className="w-56">
      <PanelTitle>{t('select.label')}</PanelTitle>
      <div className="instrument-list !min-w-0">
        {items.map((m) => (
          <button
            key={m.tool}
            type="button"
            className={`instrument-row ${tool === m.tool ? 'active' : ''}`}
            aria-pressed={tool === m.tool}
            aria-keyshortcuts={shortcutKey(m.shortcut)}
            onClick={() => {
              editor.session.getState().setTool(m.tool)
              onSelect()
            }}
          >
            {m.icon}
            <span>{t(m.label)}</span>
            <kbd>{shortcutKey(m.shortcut)}</kbd>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Always-visible strip: how the current tool draws. Only that tool's settings, one tap away:
 * colours and widths for the pens, highlighter, shapes and text, the mode for the eraser and for
 * selecting (when selection tools are collapsed into one button). Nothing for tools with no settings.
 */
export function ToolOptions({
  edge = 'top',
  collapseSelectTools = true
}: {
  edge?: OptionsDock
  collapseSelectTools?: boolean
}) {
  const t = useT()
  const customize = useWorkspaceCustomize()
  const { tool, activePen, formulaEdit } = useSession(useShallow((s) => ({ tool: s.tool, activePen: s.activePen, formulaEdit: s.formulaEdit })))
  const { pens, highlighter } = usePrefs(useShallow((s) => ({ pens: s.pens, highlighter: s.highlighter })))
  const placed = allPlacedTools(customize.layout.docks)
  // Ways of selecting the user shows, plus the one in use (its key works even when hidden).
  const selectModes = SELECT_MODES.filter((m) => placed.has(m.tool) || m.tool === tool)
  const { updatePen, updateHighlighter } = prefsStore.getState()

  if (customize.active) {
    const isDragged = customize.dragging?.kind === 'options'
    return (
      <div
        ref={(el) => customize.registerOptionsZone(edge, el)}
        role="toolbar"
        aria-label={t('options.label')}
        className="flex max-w-full min-w-0 justify-center"
      >
        <Bar
          onPointerDown={(e) => customize.startDrag(e, { kind: 'options' })}
          title={t('customize.dragOptions')}
          className={clsx(
            'flex cursor-grab touch-none items-center gap-2 px-2.5 py-1.5 transition-opacity active:cursor-grabbing',
            isDragged && 'opacity-40'
          )}
        >
          <Bars2Icon className="size-4 rotate-90 text-zinc-400 dark:text-zinc-500" />
          <span className="text-xs/5 font-semibold text-zinc-700 dark:text-zinc-200">{t('options.label')}</span>
          <span className="flex items-center gap-1" aria-hidden>
            {PEN_COLORS.slice(0, 5).map((c) => (
              <span key={c} style={{ background: c }} className="size-3.5 rounded-full ring-1 ring-zinc-950/15 dark:ring-white/20" />
            ))}
          </span>
        </Bar>
      </div>
    )
  }

  let content: ReactNode = null
  if (formulaEdit) content = null
  else if (tool === 'pen' || tool === 'shape')
    content = <InkOptions slot={pens[activePen]} colors={PEN_COLORS} sizes={PEN_SIZES} edge={edge} onChange={(patch) => updatePen(activePen, patch)} />
  else if (tool === 'highlighter')
    content = <InkOptions slot={highlighter} colors={HIGHLIGHTER_COLORS} sizes={HIGHLIGHTER_SIZES} edge={edge} onChange={updateHighlighter} />
  else if (tool === 'eraser') content = <EraserOptions />
  else if (tool === 'text') content = <TextOptions edge={edge} />
  else if (collapseSelectTools && isSelectMode(tool) && selectModes.length > 1) content = <SelectOptions modes={selectModes} />

  if (!content) return null

  return (
    <div role="toolbar" aria-label={t('options.label')} className="flex max-w-full min-w-0 justify-center">
      <Bar className="flex max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">{content}</Bar>
    </div>
  )
}
