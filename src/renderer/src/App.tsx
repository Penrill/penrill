import { syncCoordinator } from './sync/coordinator'
import { useEffect } from 'react'
import { BoardWorkspace } from '../../board/BoardWorkspace'
import type { BoardFileActions } from '../../board/ui/Board'
import { boardLibrary } from './boardLibrary'
import { BoardCursors } from './ui/BoardCursors'
import { BackupSettings } from './ui/BackupSettings'
import { HomeScreen } from './ui/HomeScreen'
import { MainMenu } from './ui/MainMenu'
import { SaveSelectionTemplate } from './ui/SaveSelectionTemplate'
import { TemplatesMenu } from './ui/TemplatesMenu'
import { AboutSection, UpdateBanner } from './ui/UpdateBanner'
import { useApp } from './appState'

const fileActions: BoardFileActions = {
  newBoard: () => boardLibrary.newBoard(),
  openFile: () => boardLibrary.openFile(),
  home: () => boardLibrary.goHome(),
  save: () => boardLibrary.save(),
  saveAs: () => boardLibrary.saveAsFile()
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
      hideExperimental
      fileActions={fileActions}
      menu={<MainMenu />}
      extraTools={<TemplatesMenu />}
      selectionActions={() => <SaveSelectionTemplate />}
      storageSettings={<BackupSettings />}
      about={<AboutSection />}
    >
      {view === 'board' && <BoardCursors />}
      <UpdateBanner />
      {view === 'home' && <HomeScreen />}
    </BoardWorkspace>
  )
}
