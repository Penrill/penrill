import { Dialog, DialogTitle } from '@penrill/ui/dialog'
import { FolderOpenIcon, RectangleStackIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { decodeBoard, encodeBoard } from '../../../board/engine/serialize'
import { renderThumbnail } from '../../../board/engine/export'
import { useT, type MessageKey } from '../../../board/i18n'
import { account } from '../sync/accounts'
import type { Community as Catalog } from '../sync/api'
import { clientFor } from '../sync/clients'
import { openRemote } from '../sync/librarySync'
import { activeLink } from '../sync/links'
import { useApp } from '../appState'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'

const empty: Catalog = { folders: [], members: [], boards: [], templates: [] }

export function Community({ origin }: { origin: string }) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [catalog, setCatalog] = useState(empty)
  const [folder, setFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [member, setMember] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<MessageKey | null>(null)
  const [pickedTemplate, setPickedTemplate] = useState('')
  const [pickedBoard, setPickedBoard] = useState('')
  const library = useApp(s => s.library)
  const selected = catalog.folders.find(f => f.id === folder)
  const current = account(origin)?.name
  const client = clientFor(origin)
  const boards = library.boards.flatMap(b => {
    const link = activeLink(b.id)
    return !b.deletedAt && link?.origin === origin && link.user === current && link.published &&
      !catalog.boards.some(row => row.folder === folder && row.id === link.remote) ? [{ entry: b, remote: link.remote }] : []
  })
  async function refresh() {
    setCatalog(await client.community())
  }
  async function run(action?: () => Promise<void>, success?: MessageKey) {
    setBusy(true)
    setMessage(null)
    try { await action?.(); await refresh(); if (success) setMessage(success) }
    catch { setMessage('share.failed') }
    finally { setBusy(false) }
  }

  async function publish() {
    const template = library.templates.find(tp => tp.id === pickedTemplate)
    if (!template) return
    const data = await decodeBoard(await platform.library.loadTemplate(template.id))
    await client.publishTemplate(folder, template.name, await encodeBoard(data))
    setPickedTemplate('')
  }
  async function install(id: string, name: string) {
    const bytes = await client.template(id)
    const data = await decodeBoard(bytes)
    const thumb = await renderThumbnail(data.items,data.background,boardLibrary.editor.features)
    await platform.library.saveTemplate(name,bytes,thumb)
    await boardLibrary.refreshLibrary()
  }
  return <>
    <button className="text-btn outline" onClick={() => { setVisible(true); void run() }}>
      <UserGroupIcon width={18} />{t('share.library')}
    </button>
    <Dialog open={visible} size="xl" onClose={() => { if (!busy) setVisible(false) }} className="storage-settings shared-library">
      <header><DialogTitle>{t('share.library')}</DialogTitle>
        <button className="icon-btn" aria-label={t('storage.close')} onClick={() => setVisible(false)}><XMarkIcon width={18} /></button>
      </header>
      <small>{current} · {origin}</small>
      <fieldset disabled={busy} className="shared-content">
        <nav aria-label={t('share.library')}>
          <button className="chip" aria-pressed={!folder} onClick={() => { setFolder(''); setMessage(null) }}><RectangleStackIcon width={16} />{t('share.market')}</button>
          {catalog.folders.map(f => <button key={f.id} className="chip" aria-pressed={folder === f.id} onClick={() => { setFolder(f.id); setMessage(null); setPickedBoard('') }}><FolderOpenIcon width={16} />{f.name}</button>)}
        </nav>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { await client.createFolder(folderName); setFolderName('') }) }}>
          <label>{t('share.folderName')}<input required maxLength={128} value={folderName} onChange={e => setFolderName(e.target.value)} /></label>
          <button className="text-btn outline">{t('share.newFolder')}</button>
        </form>
        <h3>{selected?.name ?? t('share.market')}</h3>
        {selected && <>
          <div><strong>{t('share.members')}</strong><div>{catalog.members.filter(m => m.folder === folder).map(m => m.name).join(', ')}</div></div>
          {selected.owner === current && <form onSubmit={e => { e.preventDefault(); void run(async () => { await client.addMember(folder, member); setMember('') }) }}>
            <label>{t('share.username')}<input required value={member} onChange={e => setMember(e.target.value)} /></label>
            <button className="text-btn outline">{t('share.addMember')}</button>
          </form>}
          <strong>{t('home.boards')}</strong>
          {catalog.boards.filter(b => b.folder === folder).map(b => <button key={b.id} className="text-btn outline" onClick={() => void run(async () => { await openRemote(origin,b); setVisible(false) })}>{b.title}</button>)}
          {boards.length > 0 && <form onSubmit={e => { e.preventDefault(); void run(async () => { await client.shareBoard(folder, pickedBoard); setPickedBoard('') }) }}>
            <select required aria-label={t('home.boards')} value={pickedBoard} onChange={e => setPickedBoard(e.target.value)}>
              <option value="">{t('share.chooseBoard')}</option>
              {boards.map(({ entry, remote }) => <option key={entry.id} value={remote}>{entry.title}</option>)}
            </select><button className="text-btn outline">{t('share.addBoard')}</button>
          </form>}
        </>}
        {!selected && <small>{t('share.audience')}</small>}
        <strong>{t('tpl.title')}</strong>
        {catalog.templates.filter(tp => tp.folder === folder).map(tp => <div className="shared-template" key={tp.id}>
          <span>{tp.name}<small>{tp.author}</small></span>
          <button className="text-btn outline" onClick={() => void run(() => install(tp.id,tp.name),'share.installed')}>{t('share.install')}</button>
        </div>)}
        {!catalog.templates.some(tp => tp.folder === folder) && <small>{t('share.empty')}</small>}
        {library.templates.length > 0 && <form onSubmit={e => { e.preventDefault(); void run(publish,'share.published') }}>
          <label>{t('share.localTemplate')}<select required value={pickedTemplate} onChange={e => setPickedTemplate(e.target.value)}>
            <option value="">{t('share.chooseTemplate')}</option>
            {library.templates.map(tp => <option value={tp.id} key={tp.id}>{tp.name}</option>)}
          </select></label>
          <button className="text-btn primary">{t(folder ? 'share.toFolder' : 'share.toMarket')}</button>
        </form>}
      </fieldset>
      {message && <div role="status">{t(message)}</div>}
    </Dialog>
  </>
}
