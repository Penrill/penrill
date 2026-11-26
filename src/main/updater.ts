import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { driveOf, folderBytes, freeBytesAt, spaceShortfall, type Shortfall } from './diskSpace'

/** What the renderer shows in the update banner / settings. */
export interface UpdateState {
  /**
   * 'dev' = running from source (npm run dev): updates only work in the installed app.
   * 'store' = installed from the Snap Store: snapd updates the app, so we never check GitHub.
   * 'nospace' = downloaded, but the disk is too full to install it without losing the app.
   */
  status: 'idle' | 'dev' | 'store' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'nospace' | 'error'
  version?: string
  percent?: number
  /** No silent install on this platform (macOS without signing, .deb): offer a download link. */
  manual?: boolean
  url?: string
  /** 'nospace': the drive to free space on (like `C:`) and how many megabytes are missing. */
  drive?: string
  missingMb?: number
}

const REPO = 'Penrill/penrill'
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/** Compare "1.2.3" versions. */
function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/**
 * Whether the Windows installer has room to run. It removes the old version before unpacking the
 * new one, so on a full disk it would leave no app at all. A failed check never blocks the update.
 */
async function noRoomFor(installer: string): Promise<Shortfall | null> {
  if (process.platform !== 'win32') return null
  try {
    const appDir = dirname(app.getPath('exe'))
    const temp = app.getPath('temp')
    const free = new Map<string, number>()
    for (const path of [appDir, temp]) free.set(driveOf(path).toUpperCase(), await freeBytesAt(path))
    const need = {
      installDrive: driveOf(appDir),
      tempDrive: driveOf(temp),
      installedBytes: await folderBytes(appDir),
      installerBytes: (await stat(installer)).size
    }
    return spaceShortfall(need, (drive) => free.get(drive) ?? 0)
  } catch (err) {
    console.error('Free space check failed', err)
    return null
  }
}

/**
 * Auto-update from GitHub Releases.
 * Windows (NSIS) and Linux AppImage download in the background and install on restart / quit.
 * macOS (not code-signed yet) and .deb only get a "new version available → Download" notice.
 * Snap: snapd updates the app in the background, so there is nothing to check.
 */
export function initUpdater(getWindow: () => BrowserWindow | null, beforeInstall: () => void): void {
  const fromStore = process.platform === 'linux' && !!process.env['SNAP']
  let state: UpdateState = { status: !app.isPackaged ? 'dev' : fromStore ? 'store' : 'idle' }
  const canAutoInstall = process.platform === 'win32' || (process.platform === 'linux' && !!process.env['APPIMAGE'])
  const set = (s: UpdateState): void => {
    state = s
    getWindow()?.webContents.send('update:state', s)
  }

  let installer = ''
  /** After a download, and again on every check while the disk is full. */
  const readyOrNoSpace = async (version: string): Promise<boolean> => {
    const short = await noRoomFor(installer)
    // Never let quitting run an installer that would end up removing the app.
    autoUpdater.autoInstallOnAppQuit = !short
    if (!short) {
      set({ status: 'ready', version })
      return true
    }
    set({
      status: 'nospace',
      version,
      drive: short.drive.replace(/\\$/, ''),
      missingMb: Math.ceil(short.missingBytes / (1024 * 1024))
    })
    return false
  }

  if (canAutoInstall) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
    autoUpdater.on('update-available', (i) => set({ status: 'downloading', version: i.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => set({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => {
      installer = i.downloadedFile
      void readyOrNoSpace(i.version)
    })
    autoUpdater.on('update-not-available', () => set({ status: 'none' }))
    autoUpdater.on('error', (err) => {
      console.error('Auto-update error', err)
      set({ status: 'error' })
    })
  }

  /** macOS / .deb: ask GitHub for the latest release and compare versions. */
  const manualCheck = async (): Promise<void> => {
    set({ status: 'checking' })
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rel = (await res.json()) as { tag_name: string; html_url: string }
      if (newer(rel.tag_name, app.getVersion())) {
        set({ status: 'available', version: rel.tag_name.replace(/^v/, ''), manual: true, url: rel.html_url || RELEASES_URL })
      } else {
        set({ status: 'none' })
      }
    } catch (err) {
      console.error('Update check failed', err)
      set({ status: 'error' })
    }
  }

  const check = async (): Promise<void> => {
    // Never interrupt a download / ready-to-install update with a new check.
    if (state.status === 'downloading' || state.status === 'ready') return
    // The update is already downloaded: only see whether space was freed meanwhile.
    if (state.status === 'nospace') return void (await readyOrNoSpace(state.version ?? ''))
    if (!app.isPackaged) return set({ status: 'dev' })
    if (fromStore) return set({ status: 'store' })
    if (canAutoInstall) {
      try {
        await autoUpdater.checkForUpdates()
      } catch {
        set({ status: 'error' })
      }
    } else {
      await manualCheck()
    }
  }

  ipcMain.handle('update:get-state', () => state)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:install', async () => {
    if (state.status !== 'ready') return
    if (!(await readyOrNoSpace(state.version ?? ''))) return
    beforeInstall()
    // Silent install, then start the new version.
    autoUpdater.quitAndInstall(true, true)
  })
  ipcMain.handle('update:open-download', () => shell.openExternal(state.url ?? RELEASES_URL))
  ipcMain.handle('app:version', () => app.getVersion())

  if (app.isPackaged && !fromStore) {
    setTimeout(() => void check(), 5000)
    setInterval(() => void check(), CHECK_EVERY_MS)
  }
}
