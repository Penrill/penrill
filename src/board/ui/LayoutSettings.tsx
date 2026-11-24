import * as Headless from '@headlessui/react'
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Subheading } from '@penrill/ui/heading'
import { Select } from '@penrill/ui/select'
import { Switch } from '@penrill/ui/switch'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useT, type MessageKey } from '../i18n'
import { prefsStore, usePrefs } from '../store'
import {
  DEFAULT_WORKSPACE_LAYOUT,
  detectWorkspacePreset,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESETS,
  workspaceLayoutsEqual,
  type DockEdge,
  type InsertDock,
  type OptionsDock,
  type OptionsMode,
  type WorkspaceLayout,
  type WorkspacePresetId,
  type ZoomDock
} from '../workspaceLayout'
import { Segmented } from './chrome'

function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
      <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">{label}</Headless.Label>
      <div className="col-start-2 row-span-2 row-start-1 flex justify-end">{children}</div>
      {description && <Headless.Description className="text-sm/5 text-zinc-500 dark:text-zinc-400">{description}</Headless.Description>}
    </Headless.Field>
  )
}

/** Schematic miniature preview of a WorkspaceLayout so presets are understood at a glance. */
function PresetPreview({ layout, active }: { layout: WorkspaceLayout; active: boolean }) {
  const merged = layout.insertDock === 'merged'
  const barBg = active ? 'bg-blue-600 dark:bg-blue-400' : 'bg-zinc-600 dark:bg-zinc-300'
  const insertBg = active ? 'bg-blue-400/75 dark:bg-blue-300/65' : 'bg-zinc-400 dark:bg-zinc-500'
  const optBg = active ? 'bg-blue-500/40 dark:bg-blue-400/40' : 'bg-zinc-300 dark:bg-zinc-600'
  const cornerBg = 'bg-zinc-300/90 dark:bg-zinc-600/90'

  const topTools = layout.toolsDock === 'top'
  const bottomTools = layout.toolsDock === 'bottom'
  const leftTools = layout.toolsDock === 'left'
  const rightTools = layout.toolsDock === 'right'
  const showStrip = layout.optionsMode === 'strip'

  return (
    <div
      aria-hidden
      className="relative h-20 w-full overflow-hidden rounded-lg bg-zinc-100/90 ring-1 ring-zinc-950/8 dark:bg-zinc-900/90 dark:ring-white/10"
    >
      {/* Top left menu & top right actions */}
      <span className={clsx('absolute top-1.5 left-1.5 h-2 w-6 rounded-xs', cornerBg)} />
      <span className={clsx('absolute top-1.5 right-1.5 h-2 w-5 rounded-xs', cornerBg)} />

      {/* Top centre: tools / insert / options */}
      {topTools && (
        <span
          className={clsx(
            'absolute top-1.5 left-1/2 h-2 -translate-x-1/2 rounded-xs',
            merged ? 'w-20' : 'w-14',
            barBg
          )}
        />
      )}
      {!merged && layout.insertDock === 'top' && (
        <span
          className={clsx(
            'absolute left-1/2 h-2 w-12 -translate-x-1/2 rounded-xs',
            topTools ? 'top-4.5' : 'top-1.5',
            insertBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'top' && (
        <span
          className={clsx(
            'absolute left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-xs',
            topTools ? 'top-4.5' : 'top-1.5',
            optBg
          )}
        />
      )}

      {/* Left edge */}
      {leftTools && (
        <span
          className={clsx(
            'absolute top-1/2 left-1.5 w-2 -translate-y-1/2 rounded-xs',
            merged ? 'h-12' : 'h-10',
            barBg
          )}
        />
      )}
      {!merged && layout.insertDock === 'left' && (
        <span
          className={clsx(
            'absolute top-1/2 h-8 w-2 -translate-y-1/2 rounded-xs',
            leftTools ? 'left-4.5' : 'left-1.5',
            insertBg
          )}
        />
      )}

      {/* Right edge */}
      {rightTools && (
        <span
          className={clsx(
            'absolute top-1/2 right-1.5 w-2 -translate-y-1/2 rounded-xs',
            merged ? 'h-12' : 'h-10',
            barBg
          )}
        />
      )}
      {!merged && layout.insertDock === 'right' && (
        <span
          className={clsx(
            'absolute top-1/2 h-8 w-2 -translate-y-1/2 rounded-xs',
            rightTools ? 'right-4.5' : 'right-1.5',
            insertBg
          )}
        />
      )}

      {/* Bottom centre: options / tools / insert */}
      {bottomTools && (
        <span
          className={clsx(
            'absolute bottom-1.5 left-1/2 h-2 -translate-x-1/2 rounded-xs',
            merged ? 'w-20' : 'w-14',
            barBg
          )}
        />
      )}
      {!merged && layout.insertDock === 'bottom' && (
        <span
          className={clsx(
            'absolute left-1/2 h-2.5 w-14 -translate-x-1/2 rounded-xs',
            bottomTools ? 'bottom-4.5' : 'bottom-1.5',
            insertBg
          )}
        />
      )}
      {showStrip && layout.optionsDock === 'bottom' && (
        <span
          className={clsx(
            'absolute left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-xs',
            bottomTools || (!merged && layout.insertDock === 'bottom') ? 'bottom-5' : 'bottom-1.5',
            optBg
          )}
        />
      )}

      {/* Zoom controls */}
      {layout.zoomDock === 'bottom-right' && <span className={clsx('absolute right-1.5 bottom-1.5 h-2 w-5 rounded-xs', cornerBg)} />}
      {layout.zoomDock === 'bottom-left' && <span className={clsx('absolute bottom-1.5 left-1.5 h-2 w-5 rounded-xs', cornerBg)} />}
      {layout.zoomDock === 'top-right' && <span className={clsx('absolute top-1.5 right-7.5 h-2 w-4 rounded-xs', cornerBg)} />}
    </div>
  )
}

const PRESET_LABELS: Record<WorkspacePresetId, { title: MessageKey; hint: MessageKey }> = {
  default: { title: 'layout.preset.default', hint: 'layout.preset.defaultHint' },
  top: { title: 'layout.preset.top', hint: 'layout.preset.topHint' },
  right: { title: 'layout.preset.right', hint: 'layout.preset.rightHint' },
  bottom: { title: 'layout.preset.bottom', hint: 'layout.preset.bottomHint' }
}

/** Settings -> Layout: visual preset switcher plus granular panel placement and options mode controls. */
export function LayoutSettings() {
  const t = useT()
  const layout = usePrefs((s) => s.workspaceLayout)
  const activePreset = detectWorkspacePreset(layout)
  const isDefault = workspaceLayoutsEqual(layout, DEFAULT_WORKSPACE_LAYOUT)
  const setLayout = (patch: Partial<WorkspaceLayout>): void => prefsStore.getState().setWorkspaceLayout(patch)
  const applyPreset = (preset: WorkspacePresetId): void => prefsStore.getState().applyWorkspacePreset(preset)
  const reset = (): void => prefsStore.getState().resetWorkspaceLayout()

  const standaloneHorizontalInsert = layout.insertDock === 'top' || layout.insertDock === 'bottom'

  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Subheading level={3}>{t('layout.presets')}</Subheading>
            {activePreset === 'custom' && <Badge color="blue">{t('layout.custom')}</Badge>}
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
            const selected = activePreset === id
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
        <Subheading level={3}>{t('layout.panels')}</Subheading>
        <div className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/5">
          <Row label={t('layout.drawingTools')}>
            <Segmented<DockEdge>
              label={t('layout.drawingTools')}
              value={layout.toolsDock}
              onChange={(toolsDock) => setLayout({ toolsDock })}
              options={[
                { value: 'left', label: t('layout.edge.left') },
                { value: 'right', label: t('layout.edge.right') },
                { value: 'top', label: t('layout.edge.top') },
                { value: 'bottom', label: t('layout.edge.bottom') }
              ]}
            />
          </Row>

          <Row label={t('layout.insertTools')}>
            <Select
              aria-label={t('layout.insertTools')}
              value={layout.insertDock}
              onChange={(e) => setLayout({ insertDock: e.target.value as InsertDock })}
            >
              <option value="bottom">{t('layout.edge.bottom')}</option>
              <option value="top">{t('layout.edge.top')}</option>
              <option value="left">{t('layout.edge.left')}</option>
              <option value="right">{t('layout.edge.right')}</option>
              <option value="merged">{t('layout.edge.merged')}</option>
            </Select>
          </Row>

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
                  { value: 'bottom', label: t('layout.edge.bottom') }
                ]}
              />
            </Row>
          )}

          {standaloneHorizontalInsert && (
            <Row label={t('layout.insertLabels')}>
              <Switch
                aria-label={t('layout.insertLabels')}
                color="blue"
                checked={layout.insertLabels}
                onChange={(insertLabels) => setLayout({ insertLabels })}
              />
            </Row>
          )}

          <Row label={t('layout.groupSelect')} description={t('layout.groupSelectHint')}>
            <Switch
              aria-label={t('layout.groupSelect')}
              color="blue"
              checked={layout.collapseSelectTools}
              onChange={(collapseSelectTools) => setLayout({ collapseSelectTools })}
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
            </Select>
          </Row>
        </div>
      </section>
    </>
  )
}
