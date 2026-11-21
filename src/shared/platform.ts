import type { FeatureFlags, FeatureId } from './features'
import type { BoardEntry, ExportKind, LibraryState, Tag, TemplateEntry } from './library'

/**
 * The board library's storage: boards, thumbnails, tags and templates. Each platform has its own
 * (SQLite in the Electron main process, IndexedDB in the browser) behind this same interface.
 */
export interface BoardStoreApi {
  list(): Promise<LibraryState>
  thumb(id: string): Promise<Uint8Array | null>
  create(title: string, bytes: Uint8Array): Promise<BoardEntry>
  load(id: string): Promise<Uint8Array>
  save(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<{ ok: boolean; updatedAt: number }>
  setLastOpened(id: string): Promise<void>
  rename(id: string, title: string): Promise<BoardEntry>
  duplicate(id: string): Promise<BoardEntry>
  pin(id: string, on: boolean): Promise<void>
  setTags(id: string, tagIds: string[]): Promise<void>
  createTag(name: string, color: string): Promise<Tag>
  updateTag(id: string, patch: { name?: string; color?: string }): Promise<void>
  deleteTag(id: string): Promise<void>
  remove(id: string): Promise<void>
  restore(id: string): Promise<void>
  purge(id: string): Promise<void>
  saveTemplate(name: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry>
  replaceTemplate(id: string, bytes: Uint8Array, thumb: Uint8Array | null): Promise<TemplateEntry | null>
  loadTemplate(id: string): Promise<Uint8Array>
  templateThumb(id: string): Promise<Uint8Array | null>
  renameTemplate(id: string, name: string): Promise<void>
  deleteTemplate(id: string): Promise<void>
}

/** Board files outside the library: native dialogs on the desktop, file pickers or downloads in the browser. */
export interface BoardFilesApi {
  /** Ask for a path and turn the board into a .penrill file there. null = cancelled. */
  saveAsFile(id: string, bytes: Uint8Array, suggestedName: string): Promise<BoardEntry | null>
  /** Pick an existing board file and add it to the library. null = cancelled. */
  importFile(): Promise<BoardEntry | null>
  locate(id: string): Promise<BoardEntry | null>
  showInFolder(id: string): Promise<void>
  /** A board file the app was launched with ("Open with Penrill"), already imported. */
  takePendingOpen(): Promise<string | null>
}

/** What the app shell sees: the library and the files together (the Electron preload exposes both as one). */
export type LibraryApi = BoardStoreApi & BoardFilesApi

export interface UpdateState {
  /** 'web': the browser version, which updates itself when the page is reloaded. */
  status: 'idle' | 'dev' | 'store' | 'web' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  manual?: boolean
  url?: string
}

export interface UpdateApi {
  getState(): Promise<UpdateState>
  check(): Promise<void>
  /** Restart into the downloaded update (the board must be saved first). */
  install(): Promise<void>
  openDownload(): Promise<void>
  version(): Promise<string>
  onState(handler: (s: UpdateState) => void): void
}

/** A server's certificate as presented, before anyone trusts it. */
export interface ServerProbe {
  /** `sha256/<base64>` of its public key. */
  pin: string
  /** Whether a public certificate authority vouches for it, so no pin is needed. */
  trusted: boolean
}

/** A Penrill Server announcing itself on the local network. */
export interface FoundServer {
  name: string
  origin: string
}

/** A signed-in account on one server, as the editor keeps it. */
export interface StoredAccount {
  name: string
  token: string
  /** Made by opening a board's draw link, not by signing up. */
  guest?: boolean
}

/**
 * What connecting to a server needs beyond HTTP (desktop only): the device name, trusting a
 * server's own certificate by its pin, opening the browser, finding servers nearby, connect
 * links the app is opened with, and keeping tokens in the system keychain.
 */
export interface ConnectApi {
  deviceName: string
  probe(origin: string): Promise<ServerProbe>
  trust(origin: string, pin: string): Promise<void>
  openExternal(url: string): Promise<void>
  discover(): Promise<FoundServer[]>
  onLink(handler: (link: string) => void): void
  /** Accounts by origin, decrypted at startup. */
  accounts: Record<string, StoredAccount>
  saveAccount(origin: string, value: StoredAccount | null): Promise<void>
}

export interface PlatformApi {
  /** Desktop only; the browser connects to publicly trusted servers and keeps accounts in local storage. */
  connect?: ConnectApi
  http(origin: string, request: import('./http').HttpRequest): Promise<import('./http').HttpResponse>
  platform: string
  update: UpdateApi
  capabilities: { backup: boolean; showInFolder: boolean }
  library: LibraryApi
  /** Feature flags as read at startup (defaults + features.json overrides). */
  features: FeatureFlags
  /** Turn a feature on or off and save the choice; resolves to the new flags. */
  setFeature(id: FeatureId, on: boolean): Promise<FeatureFlags>
  /** Returns the chosen backup folder (or the current one if cancelled). */
  chooseBackupDir(): Promise<string | null>
  disableBackup(): Promise<void>
  /** PNG: `data` is the image bytes. PDF: `data` is an SVG document of size width×height px. */
  exportFile(kind: ExportKind, data: Uint8Array | string, suggestedName: string, width: number, height: number): Promise<string | null>
  setTitle(title: string): void
  onOpenBoard(handler: (id: string) => void): void
  onFlushRequest(handler: () => Promise<void>): void
  onBeforeClose(handler: () => Promise<void>): void
}
