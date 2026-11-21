import { syncCoordinator } from './sync/coordinator'
import { useEffect } from 'react'
import { BoardWorkspace } from '../../board/BoardWorkspace'
import type { BoardFileActions } from '../../board/ui/Board'
import { boardLibrary } from './boardLibrary'
import { BoardCursors } from './ui/BoardCursors'
import { BackupSettings } from './ui/BackupSettings'
import { JoinDialog } from './ui/JoinDialog'
import { HomeScreen } from './ui/home/HomeScreen'
import { MainMenu } from './ui/MainMenu'
import { SaveSelectionTemplate } from './ui/SaveSelectionTemplate'
import { TemplatesMenu } from './ui/TemplatesMenu'
import { AboutSection, UpdateBanner } from './ui/UpdateBanner'
import { useApp } from './appState'
import { platform } from './platform'

const fileActions: BoardFileActions = {
  newBoard: () => boardLibrary.newBoard(),
  openFile: () => boardLibrary.openFile(),
  home: () => boardLibrary.goHome(),
  save: () => boardLibrary.save(),
  saveAs: () => boardLibrary.saveAsFile()
}

// The settings window opens from the board and from the home screen.
const settings = {
  hideExperimental: true,
  templates: true,
  storageSettings: platform.capabilities.backup ? <BackupSettings /> : undefined,
  about: <AboutSection />
}

export function App() {
  const view = useApp((s) => s.view)
  useEffect(() => {
    const stop = syncCoordinator.start()
    void boardLibrary.start()
    return stop
  }, [])
  return (
    <BoardWorkspace
      editor={boardLibrary.editor}
      hideExperimental={settings.hideExperimental}
      fileActions={fileActions}
      menu={<MainMenu />}
      extraTools={<TemplatesMenu />}
      selectionActions={() => <SaveSelectionTemplate />}
      storageSettings={settings.storageSettings}
      about={settings.about}
      covered={view === 'home'}
    >
      {view === 'board' && <BoardCursors />}
      <UpdateBanner />
      <JoinDialog />
      {view === 'home' && <HomeScreen settings={settings} />}
    </BoardWorkspace>
  )
}
