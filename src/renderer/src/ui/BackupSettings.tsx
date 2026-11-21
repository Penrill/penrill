import { Button } from '@penrill/ui/button'
import { useT } from '../../../board/i18n'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { useApp } from '../appState'

export function BackupSettings() {
  const t = useT()
  const backupDir = useApp((s) => s.library.backupDir)
  if (!platform.capabilities.backup) return null
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm/6 font-medium text-zinc-950 dark:text-white">{t('settings.backup')}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm/6 text-zinc-500 dark:text-zinc-400" title={backupDir ?? undefined}>
          {backupDir ?? t('settings.backupOff')}
        </span>
        <Button outline onClick={() => void boardLibrary.chooseBackupDir()}>
          {t(backupDir ? 'settings.backupChange' : 'settings.backupChoose')}
        </Button>
        {backupDir && (
          <Button plain onClick={() => void boardLibrary.disableBackup()}>
            {t('settings.backupDisable')}
          </Button>
        )}
      </div>
    </div>
  )
}
