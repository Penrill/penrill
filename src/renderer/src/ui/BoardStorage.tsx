import { Dialog, DialogTitle } from '@penrill/ui/dialog'
import { ArrowPathIcon, CloudIcon, Cog6ToothIcon, ComputerDesktopIcon, ServerStackIcon, UserCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useT, type MessageKey } from '../../../board/i18n'
import { serverOrigin } from '../../../shared/http'
import { cloudLabel, cloudOrigin, storagePreference, type StorageSource } from '../storagePreference'
import { account, rememberAccount } from '../sync/accounts'
import { ApiError } from '../sync/api'
import { clientFor } from '../sync/clients'
import './boardStorage.css'

export function StorageSettings({ onSave }: { onSave: () => void }) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [source, setSource] = useState<StorageSource>('device')
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  let origin = ''
  try { origin = source === 'server' ? serverOrigin(address.trim()) : source === 'cloud' ? cloudOrigin : '' } catch { /* Validated on submit. */ }
  const session = account(origin)
  function resetCredentials() {
    setName('')
    setPassword('')
    setRegister(false)
    setError(null)
  }
  function open() {
    const pref = storagePreference()
    setSource(pref.source)
    setAddress(pref.address)
    resetCredentials()
    setVisible(true)
  }
  async function save() {
    if (source !== 'device' && !origin) { setError('storage.invalid'); return }
    setBusy(true)
    setError(null)
    try {
      if (origin && !session) {
        const authenticated = await clientFor(origin).signIn(name, password, register)
        if (!authenticated.name || !authenticated.token) throw new Error('Invalid account')
        rememberAccount(origin, authenticated)
      } else if (origin) await clientFor(origin).boards()
      if (source === 'server') localStorage.setItem('penrill-server-origin', origin)
      localStorage.setItem('penrill-library-source', source)
      onSave()
      setVisible(false)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0
      if (session && status === 401) {
        rememberAccount(origin, null)
        onSave()
      }
      setError(status === 401 ? 'share.authError' : status === 409 ? 'share.taken' : 'storage.error')
    } finally { setBusy(false); setPassword('') }
  }
  async function logout() {
    setBusy(true)
    try {
      try {
        await clientFor(origin).signOut()
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
      }
      rememberAccount(origin,null)
      resetCredentials()
      onSave()
    } catch { setError('storage.error') }
    finally { setBusy(false) }
  }
  return <>
    <button className="icon-btn" title={t('settings.title')} aria-label={t('settings.title')} onClick={open}><Cog6ToothIcon width={20} /></button>
    <Dialog open={visible} onClose={() => { if (!busy) setVisible(false) }} className="storage-settings">
      <header><DialogTitle>{t('settings.title')}</DialogTitle>
        <button className="icon-btn" disabled={busy} aria-label={t('storage.close')} onClick={() => setVisible(false)}><XMarkIcon width={18} /></button>
      </header>
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        <h3><ArrowPathIcon width={18} />{t('share.sync')}</h3>
        <fieldset disabled={busy} className="storage-options">
          <legend>{t('storage.destination')}</legend>
          {(['device','cloud','server'] as const).filter(s => s !== 'cloud' || cloudOrigin).map(s => {
            const Icon = {device: ComputerDesktopIcon, cloud: CloudIcon, server: ServerStackIcon}[s]
            return <label key={s}><input type="radio" name="storage-source" checked={s === source} onChange={() => { setSource(s); resetCredentials() }} />
              <Icon width={24} />{t(s === 'cloud' ? cloudLabel : s === 'device' ? 'storage.device' : 'storage.server')}</label>
          })}
        </fieldset>
        {source === 'server' && <label>{t('storage.address')}
          <input type="url" required value={address} disabled={busy} onChange={e => { setAddress(e.target.value); resetCredentials() }} />
        </label>}
        {source !== 'device' && <section className="account-section">
          <h3><UserCircleIcon width={19} />{t('share.account')}</h3>
          <small>{origin}</small>
          {session ? <><strong>{session.name}</strong>
            <button type="button" className="text-btn outline" disabled={busy} onClick={() => void logout()}>{t('share.logout')}</button></> : <>
            <label>{t('share.username')}<input required autoComplete="username" pattern="[a-z0-9_\-]{3,32}" title={t('share.nameHint')} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
            <label>{t('share.password')}<input required type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={10} maxLength={256} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
            {register && <small>{t('share.nameHint')}</small>}
            <button type="button" className="text-btn outline" disabled={busy} onClick={() => { setRegister(!register); setError(null) }}>{t(register ? 'share.existing' : 'share.createAccount')}</button>
          </>}
        </section>}
        {error && <p role="alert">{t(error)}</p>}
        <button className="text-btn primary" disabled={busy}>{t(busy ? 'storage.connecting' : origin && !session ? register ? 'share.register' : 'share.login' : 'storage.apply')}</button>
      </form>
    </Dialog>
  </>
}
