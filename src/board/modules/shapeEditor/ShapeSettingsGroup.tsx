import * as Headless from '@headlessui/react'
import { Switch } from '@penrill/ui/switch'
import { Text } from '@penrill/ui/text'
import { useEditor } from '../../editorContext'
import { useT } from '../../i18n'
import { prefsStore, usePrefs, type ShapeLengthUnit } from '../../store'
import { Segmented } from '../../ui/chrome'

/** Dedicated Shapes tab content in Settings when the `shape-editor` module is enabled. */
export function ShapeSettingsGroup() {
  const editor = useEditor()
  const t = useT()
  const defaults = usePrefs((s) => s.shapeDefaults)
  if (!editor.features.shapeEditor) return null
  const patch = (p: Partial<typeof defaults>): void => {
    prefsStore.setState((s) => ({ shapeDefaults: { ...s.shapeDefaults, ...p } }))
  }

  return (
    <section id="settings-shapes">
      <Text>{t('shapes.settingsHint')}</Text>
      <div className="mt-4 divide-y divide-zinc-950/5 dark:divide-white/5">
        <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
          <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">
            {t('shapes.defaultLabels')}
          </Headless.Label>
          <div className="col-start-2 row-span-2 row-start-1 flex justify-end">
            <Switch color="blue" checked={defaults.showLabels} onChange={(showLabels) => patch({ showLabels })} />
          </div>
        </Headless.Field>
        <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
          <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">
            {t('shapes.defaultAngles')}
          </Headless.Label>
          <div className="col-start-2 row-span-2 row-start-1 flex justify-end">
            <Switch color="blue" checked={defaults.showAngles} onChange={(showAngles) => patch({ showAngles })} />
          </div>
        </Headless.Field>
        <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
          <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">
            {t('shapes.defaultLengths')}
          </Headless.Label>
          <div className="col-start-2 row-span-2 row-start-1 flex justify-end">
            <Switch color="blue" checked={defaults.showLengths} onChange={(showLengths) => patch({ showLengths })} />
          </div>
        </Headless.Field>
        <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
          <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">
            {t('shapes.defaultGizmo3d')}
          </Headless.Label>
          <div className="col-start-2 row-span-2 row-start-1 flex justify-end">
            <Switch color="blue" checked={defaults.gizmo3d} onChange={(gizmo3d) => patch({ gizmo3d })} />
          </div>
        </Headless.Field>
        <Headless.Field className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3">
          <Headless.Label className="text-sm/6 font-medium text-zinc-950 select-none dark:text-white">
            {t('shapes.unit')}
          </Headless.Label>
          <div className="col-start-2 row-span-2 row-start-1 flex justify-end">
            <Segmented
              label={t('shapes.unit')}
              value={defaults.unit}
              onChange={(unit: ShapeLengthUnit) => patch({ unit })}
              options={[
                { value: 'cm', label: t('shapes.unitCm') },
                { value: 'cells', label: t('shapes.unitCells') }
              ]}
            />
          </div>
        </Headless.Field>
      </div>
    </section>
  )
}
