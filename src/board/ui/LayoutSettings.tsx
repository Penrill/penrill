import * as Headless from '@headlessui/react'
import { ArrowPathIcon, BookmarkIcon, CheckIcon, PencilIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Input } from '@penrill/ui/input'
import { Select } from '@penrill/ui/select'
import { Switch } from '@penrill/ui/switch'
import { Text } from '@penrill/ui/text'
import clsx from 'clsx'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useT, type MessageKey } from '../i18n'
import { prefsStore, usePrefs } from '../store'
import { isInsertOnlyBar, isToolbarDivider } from '../toolbarLayout'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  matchWorkspacePreset,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESETS,
  workspaceLayoutsEqual,
  type CustomWorkspacePreset,
  type OptionsDock,
  type OptionsMode,
  type WorkspaceLayout,
  type WorkspacePresetId,
  type ZoomDock
} from '../workspaceLayout'
import { Segmented } from './chrome'
import { ToolbarSettingsIcon, TrashIcon } from './icons'

function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
      <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">{label}</Headless.Label>
      <div className="col-start-2 row-span-2 row-start-1 flex justify-end">{children}</div>
      {description && <Headless.Description className="text-sm/5 text-zinc-500 dark:text-zinc-400">{description}</Headless.Description>}
    </Headless.Field>
  )
}

/** Schematic miniature preview derived directly from any 4-edge WorkspaceLayout. */
export function PresetPreview({ layout, active }: { layout: WorkspaceLayout; active: boolean }) {
  const barBg = active ? 'bg-blue-600 dark:bg-blue-400' : 'bg-zinc-600 dark:bg-zinc-300'
  const insertBg = active ? 'bg-blue-400/80 dark:bg-blue-300/70' : 'bg-zinc-400 dark:bg-zinc-500'
  const optBg = active ? 'bg-blue-500/40 dark:bg-blue-400/40' : 'bg-zinc-300 dark:bg-zinc-600'
  const cornerBg = 'bg-zinc-300/90 dark:bg-zinc-600/90'

  const countTools = (edge: 'top' | 'bottom' | 'left' | 'right') =>
    layout.docks[edge].filter((id) => !isToolbarDivider(id)).length

  const topN = countTools('top')
  const bottomN = countTools('bottom')
  const leftN = countTools('left')
  const rightN = countTools('right')
  const showStrip = layout.optionsMode === 'strip'

  const hWidth = (n: number) => (n >= 12 ? 'w-24' : n >= 6 ? 'w-16' : 'w-10')
  const vHeight = (n: number) => (n >= 12 ? 'h-13' : n >= 6 ? 'h-10' : 'h-6')

  return (
    <div
      aria-hidden
      className="relative h-20 w-full overflow-hidden rounded-lg bg-zinc-100/90 ring-1 ring-zinc-950/8 dark:bg-zinc-900/90 dark:ring-white/10"
    >
      {/* Top left menu & top right actions */}
      <span className={clsx('absolute top-1.5 left-1.5 h-2 w-6 rounded-xs', cornerBg)} />
      <span className={clsx('absolute top-1.5 right-1.5 h-2 w-5 rounded-xs', cornerBg)} />

      {/* Top edge bar */}
      {topN > 0 && (
        <span
          className={clsx(
            'absolute top-1.5 left-1/2 h-2 -translate-x-1/2 rounded-xs',
            hWidth(topN),
            isInsertOnlyBar(layout.docks.top) ? insertBg : barBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'top' && (
        <span
          className={clsx(
            'absolute left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-xs',
            topN > 0 ? 'top-4.5' : 'top-1.5',
            optBg
          )}
        />
      )}

      {/* Left edge bar */}
      {leftN > 0 && (
        <span
          className={clsx(
            'absolute top-1/2 left-1.5 w-2 -translate-y-1/2 rounded-xs',
            vHeight(leftN),
            isInsertOnlyBar(layout.docks.left) ? insertBg : barBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'left' && (
        <span
          className={clsx(
            'absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-xs',
            leftN > 0 ? 'left-4.5' : 'left-1.5',
            optBg
          )}
        />
      )}

      {/* Right edge bar */}
      {rightN > 0 && (
        <span
          className={clsx(
            'absolute top-1/2 right-1.5 w-2 -translate-y-1/2 rounded-xs',
            vHeight(rightN),
            isInsertOnlyBar(layout.docks.right) ? insertBg : barBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'right' && (
        <span
          className={clsx(
            'absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-xs',
            rightN > 0 ? 'right-4.5' : 'right-1.5',
            optBg
          )}
        />
      )}

      {/* Bottom edge bar */}
      {bottomN > 0 && (
        <span
          className={clsx(
            'absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-xs',
            layout.insertLabels && isInsertOnlyBar(layout.docks.bottom) ? 'h-2.5' : 'h-2',
            hWidth(bottomN),
            isInsertOnlyBar(layout.docks.bottom) ? insertBg : barBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'bottom' && (
        <span
          className={clsx(
            'absolute left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-xs',
            bottomN > 0 ? 'bottom-5' : 'bottom-1.5',
            optBg
          )}
        />
      )}

      {/* Zoom controls in any of the 4 corners */}
      {layout.zoomDock === 'bottom-right' && <span className={clsx('absolute right-1.5 bottom-1.5 h-2 w-5 rounded-xs', cornerBg)} />}
      {layout.zoomDock === 'bottom-left' && <span className={clsx('absolute bottom-1.5 left-1.5 h-2 w-5 rounded-xs', cornerBg)} />}
      {layout.zoomDock === 'top-right' && <span className={clsx('absolute top-1.5 right-7.5 h-2 w-4 rounded-xs', cornerBg)} />}
      {layout.zoomDock === 'top-left' && <span className={clsx('absolute top-1.5 left-8.5 h-2 w-4 rounded-xs', cornerBg)} />}
    </div>
  )
}

const PRESET_LABELS: Record<WorkspacePresetId, { title: MessageKey; hint: MessageKey }> = {
  default: { title: 'layout.preset.default', hint: 'layout.preset.defaultHint' },
  split: { title: 'layout.preset.split', hint: 'layout.preset.splitHint' },
  left: { title: 'layout.preset.left', hint: 'layout.preset.leftHint' },
  right: { title: 'layout.preset.right', hint: 'layout.preset.rightHint' },
  bottom: { title: 'layout.preset.bottom', hint: 'layout.preset.bottomHint' }
}

function CustomPresetCard({
  preset,
  active,
  currentLayout
}: {
  preset: CustomWorkspacePreset
  active: boolean
  currentLayout: WorkspaceLayout
}) {
  const t = useT()
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(preset.name)
  const differs = !workspaceLayoutsEqual(currentLayout, preset.layout)

  const commitRename = (): void => {
    setRenaming(false)
    if (draftName.trim() && draftName.trim() !== preset.name) {
      prefsStore.getState().renameCustomPreset(preset.id, draftName.trim())
    }
  }

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-xl p-2.5 transition-colors',
        active
          ? 'bg-blue-500/8 ring-2 ring-blue-500 dark:bg-blue-500/15 dark:ring-blue-400'
          : 'bg-zinc-950/2.5 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:bg-white/2.5 dark:ring-white/10 dark:hover:bg-white/5'
      )}
    >
      <button
        type="button"
        onClick={() => prefsStore.getState().replaceWorkspaceLayout(preset.layout)}
        className="w-full text-left"
      >
        <PresetPreview layout={preset.layout} active={active} />
      </button>

      <div className="flex items-center justify-between gap-1 px-0.5">
        {renaming ? (
          <input
            autoFocus
            value={draftName}
            aria-label={t('layout.renamePreset')}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.code === 'Enter' || e.code === 'NumpadEnter') commitRename()
              if (e.code === 'Escape') {
                setDraftName(preset.name)
                setRenaming(false)
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-blue-500 bg-white px-2 text-xs/5 font-semibold text-zinc-950 outline-none dark:bg-zinc-900 dark:text-white"
          />
        ) : (
          <button
            type="button"
            onClick={() => prefsStore.getState().replaceWorkspaceLayout(preset.layout)}
            className="min-w-0 flex-1 truncate text-left text-sm/5 font-semibold text-zinc-950 dark:text-white"
          >
            {preset.name}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {differs && (
            <button
              type="button"
              title={t('layout.updatePreset', { name: preset.name })}
              aria-label={t('layout.updatePreset', { name: preset.name })}
              onClick={() => prefsStore.getState().updateCustomPreset(preset.id)}
              className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-blue-600 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-blue-400"
            >
              <CheckIcon className="size-4" />
            </button>
          )}
          <button
            type="button"
            title={t('layout.renamePreset')}
            aria-label={t('layout.renamePreset')}
            onClick={() => {
              setDraftName(preset.name)
              setRenaming(true)
            }}
            className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            title={t('layout.deletePreset')}
            aria-label={t('layout.deletePreset')}
            onClick={() => prefsStore.getState().deleteCustomPreset(preset.id)}
            className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
          >
            <TrashIcon width={15} height={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Settings -> Layout: visual built-in + custom presets, live on-board customizer trigger, and panel behavior options. */
export function LayoutSettings({ onCustomizeBoard }: { onCustomizeBoard?: () => void }) {
  const t = useT()
  const layout = usePrefs((s) => s.workspaceLayout)
  const customPresets = usePrefs((s) => s.customPresets)
  const matched = matchWorkspacePreset(layout, customPresets)
  const isDefault = workspaceLayoutsEqual(layout, DEFAULT_WORKSPACE_LAYOUT)

  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const setLayout = (patch: Partial<WorkspaceLayout>): void => prefsStore.getState().setWorkspaceLayout(patch)
  const applyPreset = (preset: WorkspacePresetId): void => prefsStore.getState().applyWorkspacePreset(preset)
  const reset = (): void => prefsStore.getState().resetWorkspaceLayout()

  const handleSave = (e: FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) return
    prefsStore.getState().saveCustomPreset(name.trim(), layout)
    setName('')
    setSaving(false)
  }

  return (
    <>
      {onCustomizeBoard && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-500/8 p-3.5 ring-1 ring-blue-500/20 dark:bg-blue-500/12 dark:ring-blue-400/25">
          <div className="min-w-0 flex-1">
            <div className="text-sm/5 font-semibold text-zinc-950 dark:text-white">{t('customize.title')}</div>
            <div className="mt-0.5 text-xs/4 text-zinc-600 dark:text-zinc-300">{t('customize.hint')}</div>
          </div>
          <Button color="blue" onClick={onCustomizeBoard}>
            <ToolbarSettingsIcon width={16} height={16} />
            {t('customize.openOnBoard')}
          </Button>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Subheading level={3}>{t('layout.presets')}</Subheading>
            {matched.kind === 'unsaved' && <Badge color="blue">{t('layout.custom')}</Badge>}
          </div>
          {!isDefault && (
            <Button plain onClick={reset}>
              <ArrowPathIcon data-slot="icon" />
              {t('layout.reset')}
            </Button>
          )}
        </div>
        <div role="radiogroup" aria-label={t('layout.presets')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WORKSPACE_PRESET_IDS.map((id) => {
            const selected = matched.kind === 'builtin' && matched.id === id
            const preset = WORKSPACE_PRESETS[id]
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => applyPreset(id)}
                className={clsx(
                  'flex flex-col gap-2 rounded-xl p-2.5 text-left transition-colors',
                  selected
                    ? 'bg-blue-500/8 ring-2 ring-blue-500 dark:bg-blue-500/15 dark:ring-blue-400'
                    : 'bg-zinc-950/2.5 ring-1 ring-zinc-950/10 hover:bg-zinc-950/5 dark:bg-white/2.5 dark:ring-white/10 dark:hover:bg-white/5'
                )}
              >
                <PresetPreview layout={preset} active={selected} />
                <div className="px-0.5">
                  <div className="text-sm/5 font-semibold text-zinc-950 dark:text-white">{t(PRESET_LABELS[id].title)}</div>
                  <div className="mt-0.5 text-xs/4 text-zinc-500 dark:text-zinc-400">{t(PRESET_LABELS[id].hint)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Subheading level={3}>{t('layout.myPresets')}</Subheading>
          {!saving && (
            <Button outline onClick={() => setSaving(true)}>
              <BookmarkIcon data-slot="icon" />
              {t('layout.savePreset')}
            </Button>
          )}
        </div>

        {saving && (
          <form onSubmit={handleSave} className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                autoFocus
                value={name}
                placeholder={t('layout.savePresetPlaceholder')}
                aria-label={t('layout.savePreset')}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.code === 'Escape') setSaving(false)
                }}
              />
            </div>
            <Button type="submit" color="blue" disabled={!name.trim()}>
              {t('common.save')}
            </Button>
            <Button type="button" plain onClick={() => setSaving(false)}>
              {t('common.cancel')}
            </Button>
          </form>
        )}

        {customPresets.length === 0 ? (
          <Text>{t('layout.noCustomPresets')}</Text>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customPresets.map((preset) => (
              <CustomPresetCard
                key={preset.id}
                preset={preset}
                active={matched.kind === 'custom' && matched.preset.id === preset.id}
                currentLayout={layout}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <Subheading level={3}>{t('layout.panels')}</Subheading>
        <div className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/5">
          <Row label={t('layout.toolOptions')} description={t('layout.toolOptionsHint')}>
            <Segmented<OptionsMode>
              label={t('layout.toolOptions')}
              value={layout.optionsMode}
              onChange={(optionsMode) => setLayout({ optionsMode })}
              options={[
                { value: 'strip', label: t('layout.options.strip') },
                { value: 'popover', label: t('layout.options.popover') }
              ]}
            />
          </Row>

          {layout.optionsMode === 'strip' && (
            <Row label={t('layout.optionsPosition')}>
              <Segmented<OptionsDock>
                label={t('layout.optionsPosition')}
                value={layout.optionsDock}
                onChange={(optionsDock) => setLayout({ optionsDock })}
                options={[
                  { value: 'top', label: t('layout.edge.top') },
                  { value: 'bottom', label: t('layout.edge.bottom') },
                  { value: 'left', label: t('layout.edge.left') },
                  { value: 'right', label: t('layout.edge.right') }
                ]}
              />
            </Row>
          )}

          <Row label={t('layout.insertLabels')}>
            <Switch
              aria-label={t('layout.insertLabels')}
              color="blue"
              checked={layout.insertLabels}
              onChange={(insertLabels) => setLayout({ insertLabels })}
            />
          </Row>

          <Row label={t('layout.groupSelect')} description={t('layout.groupSelectHint')}>
            <Switch
              aria-label={t('layout.groupSelect')}
              color="blue"
              checked={layout.collapseSelectTools}
              onChange={(collapseSelectTools) => setLayout({ collapseSelectTools })}
            />
          </Row>

          <Row label={t('layout.shortcutBadges')} description={t('layout.shortcutBadgesHint')}>
            <Switch
              aria-label={t('layout.shortcutBadges')}
              color="blue"
              checked={layout.showShortcutBadges}
              onChange={(showShortcutBadges) => setLayout({ showShortcutBadges })}
            />
          </Row>

          <Row label={t('layout.zoomPosition')}>
            <Select
              aria-label={t('layout.zoomPosition')}
              value={layout.zoomDock}
              onChange={(e) => setLayout({ zoomDock: e.target.value as ZoomDock })}
            >
              <option value="bottom-right">{t('layout.zoom.bottomRight')}</option>
              <option value="bottom-left">{t('layout.zoom.bottomLeft')}</option>
              <option value="top-right">{t('layout.zoom.topRight')}</option>
              <option value="top-left">{t('layout.zoom.topLeft')}</option>
            </Select>
          </Row>
        </div>
      </section>
    </>
  )
}
