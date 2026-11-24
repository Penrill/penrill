import * as Headless from '@headlessui/react'
import { useEditor, useSession } from '../editorContext'
import { useT } from '../i18n'
import { PaperPanel } from './BackgroundPicker'
import { Bar, FlyoutPanel, ToolButton } from './chrome'
import { GearIcon, PaperIcon } from './icons'
import { SettingsDialog, type SettingsDialogProps } from './SettingsDialog'

/** Top right: the board's background (often changed per lesson) and the app's settings. */
export function BoardActions(props: Omit<SettingsDialogProps, 'open' | 'onClose' | 'focusSection'>) {
  const editor = useEditor()
  const t = useT()
  const section = useSession((s) => s.settingsSection)
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
        <ToolButton label={t('settings.title')} aria-haspopup="dialog" onClick={() => editor.session.setState({ settingsSection: 'general' })}>
          <GearIcon />
        </ToolButton>
      </Bar>
      <SettingsDialog
        open={section !== null}
        focusSection={section}
        onClose={() => editor.session.setState({ settingsSection: null })}
        {...props}
      />
    </>
  )
}
