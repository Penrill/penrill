import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { TrackpadPhase } from '../shared/platform'

import { trackpadPanDirection } from '../board/shortcuts'

type NativeInput = [phase: Exclude<TrackpadPhase, 'pan'>, x: number, y: number, aspect: number] | [phase: 'key', code: string]

interface NativePad {
  start(handle: Buffer, onInput: (...event: NativeInput) => void): void
  stop(): void
}

export function registerTrackpad(): void {
  if (process.platform !== 'darwin') return
  let owner: BrowserWindow | null = null
  let native: NativePad | undefined
  let generation = 0
  function stop(): void {
    if (!owner) return
    generation++
    owner.removeListener('blur', stop)
    owner.removeListener('close', stop)
    if (!owner.webContents.isDestroyed()) {
      owner.webContents.removeListener('render-process-gone', stop)
      owner.webContents.removeListener('did-start-navigation', stop)
      owner.webContents.send('trackpad:touch', 'finish', 0, 0, 1)
    }
    owner = null
    native?.stop()
  }
  app.on('before-quit', stop)
  ipcMain.handle('trackpad:start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win?.isFocused() || event.senderFrame !== event.sender.mainFrame) throw new Error('Inactive board')
    stop()
    const session = ++generation
    native ??= require(join(__dirname, 'trackpad.node')) as NativePad
    native.start(win.getNativeWindowHandle(), (...input) => {
      if (generation !== session || !owner) return
      if (input[0] === 'finish') return stop()
      if (input[0] === 'key') {
        const direction = trackpadPanDirection(input[1])
        if (direction) event.sender.send('trackpad:touch', 'pan', ...direction, 1)
      } else event.sender.send('trackpad:touch', ...input)
    })
    owner = win
    win.once('blur', stop)
    win.once('close', stop)
    event.sender.once('render-process-gone', stop)
    event.sender.once('did-start-navigation', stop)
  })
  ipcMain.on('trackpad:stop', (event) => {
    if (owner?.webContents === event.sender) stop()
  })
}
