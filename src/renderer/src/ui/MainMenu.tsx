import {
  CloudIcon, CloudArrowUpIcon, ComputerDesktopIcon, SignalSlashIcon,
  ExclamationTriangleIcon, ArrowPathIcon
} from '@heroicons/react/24/outline'
import { activeLink, useLinks } from '../sync/links'
import { useSyncStatus } from '../sync/librarySync'
import { useCallback, useEffect, useRef, useState } from 'react'
import { boardLibrary } from '../boardLibrary'
import { useT } from '../../../board/i18n'
import { platform } from '../platform'
import { HomeIcon, MenuIcon } from '../../../board/ui/icons'
import { Popover } from '../../../board/ui/Popover'
import { useSession } from '../../../board/editorContext'
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
      className="board-name-input"
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
      className="board-name"
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
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
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
    <div className="menu-anchor">
      <button
        type="button"
        data-popover-anchor
        className={`icon-btn board-sync-status${warning ? ' warning' : ''}`}
        title={description}
        aria-label={description}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <Icon width={19} height={19} aria-hidden="true" />
      </button>
      {open && (
        <Popover onClose={close} fit="below" className="board-sync-detail">
          <strong>{label}</strong>
          {link && <span>{link.origin}</span>}
          <span>{localText}</span>
          <span>{where}</span>
          {link && state === 'denied' && <span>{t('storage.deniedHelp')}</span>}
        </Popover>
      )}
    </div>
  )
}

/** Top-left: all-boards button, menu, editable board name and save status. */
export function MainMenu() {
  const t = useT()
  const board = useApp((s) => s.board)
  const hasSelection = useSession((s) => s.selectedIds.length > 0)
  const appVersion = useApp((s) => s.appVersion)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const run = (fn: () => unknown) => () => {
    setOpen(false)
    void fn()
  }
  return (
    <div className="main-menu">
      <div className="main-menu-bar">
        <button className="icon-btn" title={`${t('menu.home')} (Ctrl+H)`} onClick={() => void boardLibrary.goHome()}>
          <HomeIcon />
        </button>
        <button data-popover-anchor className="icon-btn" title={t('menu.title')} onClick={() => setOpen((o) => !o)}>
          <MenuIcon />
        </button>
        <BoardTitle />
        <SaveStatus />
      </div>
      {open && (
        <Popover onClose={close} className="menu-popover">
          <button className="menu-item" onClick={run(() => boardLibrary.newBoard())}>
            <span>{t('menu.newBoard')}</span>
            <kbd>Ctrl+N</kbd>
          </button>
          <button className="menu-item" onClick={run(() => boardLibrary.goHome())}>
            <span>{t('menu.home')}</span>
            <kbd>Ctrl+H</kbd>
          </button>
          <button className="menu-item" onClick={run(() => boardLibrary.openFile())}>
            <span>{t('menu.openFile')}</span>
            <kbd>Ctrl+O</kbd>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={run(() => boardLibrary.saveAsFile())}>
            <span>{t('menu.saveAsFile')}</span>
            <kbd>Ctrl+Shift+S</kbd>
          </button>
          {board?.kind === 'file' && platform.capabilities.showInFolder && (
            <button className="menu-item" onClick={run(() => platform.library.showInFolder(board.id))}>
              <span>{t('menu.showInFolder')}</span>
            </button>
          )}
          <div className="menu-sep" />
          <button className="menu-item" onClick={run(() => boardLibrary.exportBoard('png'))}>
            <span>{t(hasSelection ? 'menu.exportSelPng' : 'menu.exportPng')}</span>
          </button>
          <button className="menu-item" onClick={run(() => boardLibrary.exportBoard('pdf'))}>
            <span>{t(hasSelection ? 'menu.exportSelPdf' : 'menu.exportPdf')}</span>
          </button>
          <div className="menu-sep" />
          <div className="menu-version">Penrill {appVersion}</div>
        </Popover>
      )}
    </div>
  )
}
