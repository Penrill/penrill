import * as Headless from '@headlessui/react'
import { useState } from 'react'
import { useT } from '../i18n'
import { PaperPanel } from './BackgroundPicker'
import { Bar, FlyoutPanel, ToolButton } from './chrome'
import { GearIcon, PaperIcon } from './icons'
import { SettingsDialog, type SettingsDialogProps } from './SettingsDialog'

/** Top right: the board's background (often changed per lesson) and the app's settings. */
export function BoardActions(props: Omit<SettingsDialogProps, 'open' | 'onClose'>) {
  const t = useT()
  const [settings, setSettings] = useState(false)
  return (
    <>
      <Bar className="flex items-center gap-0.5">
        <Headless.Popover className="flex">
          <Headless.PopoverButton as={ToolButton} label={t('settings.background')}>
            <PaperIcon />
          </Headless.PopoverButton>
          <FlyoutPanel anchor="bottom end" className="w-80">
            <PaperPanel />
          </FlyoutPanel>
        </Headless.Popover>
        <ToolButton label={t('settings.title')} aria-haspopup="dialog" onClick={() => setSettings(true)}>
          <GearIcon />
        </ToolButton>
      </Bar>
      <SettingsDialog open={settings} onClose={() => setSettings(false)} {...props} />
    </>
  )
}
