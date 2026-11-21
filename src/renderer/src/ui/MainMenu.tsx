import {
  CloudIcon, CloudArrowUpIcon, ComputerDesktopIcon, SignalSlashIcon,
  ExclamationTriangleIcon, ArrowPathIcon
} from '@heroicons/react/24/outline'
import { activeLink, useLinks } from '../sync/links'
import { useSyncStatus } from '../sync/librarySync'
import * as Headless from '@headlessui/react'
import { Dropdown, DropdownDivider, DropdownHeader, DropdownItem, DropdownLabel, DropdownMenu, DropdownShortcut } from '@penrill/ui/dropdown'
import { useEffect, useRef, useState } from 'react'
import { boardLibrary } from '../boardLibrary'
import { useT } from '../../../board/i18n'
import { platform } from '../platform'
import { HomeIcon, MenuIcon } from '../../../board/ui/icons'
import { Bar, FlyoutPanel, ToolButton } from '../../../board/ui/chrome'
import { useEditor, useSession } from '../../../board/editorContext'
import { useApp } from '../appState'

/** Inline-editable board title. */
function BoardTitle() {
  const t = useT()
  const board = useApp((s) => s.board)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])
  if (!board) return null
  const commit = (): void => {
    setEditing(false)
    if (value.trim() && value.trim() !== board.title) void boardLibrary.renameBoard(board.id, value.trim())
  }
  return editing ? (
    <input
      ref={input}
      aria-label={t('menu.rename')}
      className="h-9 w-56 min-w-0 rounded-lg border border-zinc-950/10 bg-white px-2.5 text-sm/6 font-semibold text-zinc-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if ((e.code === 'Enter' || e.code === 'NumpadEnter')) commit()
        if (e.code === 'Escape') setEditing(false)
      }}
    />
  ) : (
    <button
      type="button"
      className="h-9 max-w-64 min-w-0 truncate rounded-lg px-2 text-sm/6 font-semibold text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/10"
      title={t('menu.rename')}
      onClick={() => {
        setValue(board.title)
        setEditing(true)
      }}
    >
      {board.title}
    </button>
  )
}

function SaveStatus() {
  const t = useT()
  const status = useApp((s) => s.saveStatus)
  const board = useApp((s) => s.board)
  const remote = useSyncStatus(s => board ? s.states[board.id] : undefined)
  useLinks(s => s.version)
  if (!board) return null

  const link = activeLink(board.id)
  const where = board.kind === 'file' && board.filePath
    ? t('save.inFile', { path: board.filePath })
    : t('save.inApp')
  const busy = status === 'saving' || status === 'pending'
  const localText = t(status === 'error' ? 'save.error' : busy ? 'save.saving' : 'save.saved')
  const state = remote ?? 'pending'
  const label = link ? t(`storage.${state}`) : t('storage.device')
  const warning = status === 'error' || (link && (state === 'offline' || state === 'denied'))
  const Icon = status === 'error' || (link && state === 'denied') ? ExclamationTriangleIcon
    : link ? state === 'offline' ? SignalSlashIcon : state === 'pending' ? CloudArrowUpIcon : CloudIcon
    : busy ? ArrowPathIcon : ComputerDesktopIcon
  const description = [label, link?.origin, localText, where].filter(Boolean).join('\n')

  return (
    <Headless.Popover className="flex">
      <Headless.PopoverButton
        as={ToolButton}
        label={description}
        className={warning ? 'text-amber-600! dark:text-amber-400!' : undefined}
      >
        <Icon width={20} height={20} aria-hidden="true" />
      </Headless.PopoverButton>
      <FlyoutPanel anchor="bottom start" className="flex max-w-80 flex-col gap-1 text-sm/5 text-zinc-600 dark:text-zinc-300">
        <strong className="font-semibold text-zinc-950 dark:text-white">{label}</strong>
        {link && <span>{link.origin}</span>}
        <span>{localText}</span>
        <span className="break-all">{where}</span>
        {link && state === 'denied' && <span>{t('storage.deniedHelp')}</span>}
      </FlyoutPanel>
    </Headless.Popover>
  )
}

/** Top left: all boards, the board menu, the board's name (click to rename) and where it is saved. */
export function MainMenu() {
  const t = useT()
  const editor = useEditor()
  const board = useApp((s) => s.board)
  const hasSelection = useSession((s) => s.selectedIds.length > 0)
  const appVersion = useApp((s) => s.appVersion)
  const keys = (display: string): string[] => display.split('+')
  return (
    <Bar className="flex min-w-0 items-center gap-0.5">
      <ToolButton label={t('menu.home')} shortcut="Ctrl+H" onClick={() => void boardLibrary.goHome()}>
        <HomeIcon />
      </ToolButton>
      <Dropdown>
        <Headless.MenuButton as={ToolButton} label={t('menu.title')}>
          <MenuIcon />
        </Headless.MenuButton>
        <DropdownMenu anchor="bottom start" className="z-[80] min-w-64 bg-white! backdrop-blur-none! dark:bg-zinc-800!">
          <DropdownItem onClick={() => void boardLibrary.newBoard()}>
            <DropdownLabel>{t('menu.newBoard')}</DropdownLabel>
            <DropdownShortcut keys={keys('Ctrl+N')} />
          </DropdownItem>
          <DropdownItem onClick={() => void boardLibrary.goHome()}>
            <DropdownLabel>{t('menu.home')}</DropdownLabel>
            <DropdownShortcut keys={keys('Ctrl+H')} />
          </DropdownItem>
          <DropdownItem onClick={() => void boardLibrary.openFile()}>
            <DropdownLabel>{t('menu.openFile')}</DropdownLabel>
            <DropdownShortcut keys={keys('Ctrl+O')} />
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem onClick={() => void boardLibrary.saveAsFile()}>
            <DropdownLabel>{t('menu.saveAsFile')}</DropdownLabel>
            <DropdownShortcut keys={keys('Ctrl+Shift+S')} />
          </DropdownItem>
          {board?.kind === 'file' && platform.capabilities.showInFolder && (
            <DropdownItem onClick={() => void platform.library.showInFolder(board.id)}>
              <DropdownLabel>{t('menu.showInFolder')}</DropdownLabel>
            </DropdownItem>
          )}
          <DropdownItem onClick={() => void boardLibrary.exportBoard('png')}>
            <DropdownLabel>{t(hasSelection ? 'menu.exportSelPng' : 'menu.exportPng')}</DropdownLabel>
          </DropdownItem>
          <DropdownItem onClick={() => void boardLibrary.exportBoard('pdf')}>
            <DropdownLabel>{t(hasSelection ? 'menu.exportSelPdf' : 'menu.exportPdf')}</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem onClick={() => editor.session.setState({ shortcutsOpen: true })}>
            <DropdownLabel>{t('shortcuts.title')}</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownHeader className="text-xs/5 text-zinc-500 dark:text-zinc-400">Penrill {appVersion}</DropdownHeader>
        </DropdownMenu>
      </Dropdown>
      <BoardTitle />
      <SaveStatus />
    </Bar>
  )
}
