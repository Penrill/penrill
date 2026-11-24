import * as Headless from '@headlessui/react'
import { useEditor, useSession } from '../editorContext'
import { useT } from '../i18n'
import { PaperPanel } from './BackgroundPicker'
import { Bar, FlyoutPanel, ToolButton } from './chrome'
import { GearIcon, PaperIcon, ToolbarSettingsIcon } from './icons'
import { SettingsDialog, type SettingsDialogProps } from './SettingsDialog'

/** Top right: the board's background, quick on-board workspace customizer, and app settings. */
export function BoardActions(props: Omit<SettingsDialogProps, 'open' | 'onClose' | 'focusSection' | 'onCustomizeBoard'>) {
  const editor = useEditor()
  const t = useT()
  const section = useSession((s) => s.settingsSection)
  const customizing = useSession((s) => s.customizingWorkspace)
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
        <ToolButton
          label={t('toolbar.customize')}
          active={customizing}
          onClick={() => editor.session.setState((s) => ({ customizingWorkspace: !s.customizingWorkspace }))}
        >
          <ToolbarSettingsIcon />
        </ToolButton>
        <ToolButton label={t('settings.title')} aria-haspopup="dialog" onClick={() => editor.session.setState({ settingsSection: 'general' })}>
          <GearIcon />
        </ToolButton>
      </Bar>
      <SettingsDialog
        open={section !== null}
        focusSection={section}
        onClose={() => editor.session.setState({ settingsSection: null })}
        onCustomizeBoard={() => editor.session.setState({ settingsSection: null, customizingWorkspace: true })}
        {...props}
      />
    </>
  )
}
