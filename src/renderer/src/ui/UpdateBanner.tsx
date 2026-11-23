import { useEffect, useState } from 'react'
import { boardLibrary } from '../boardLibrary'
import { useT } from '../../../board/i18n'
import type { UpdateState } from '../../../shared/platform'
import { platform } from '../platform'
import { useApp } from '../appState'
import { Notice, NoticeButton } from '../../../board/ui/notices'
import { Button } from '@penrill/ui/button'
import { Text } from '@penrill/ui/text'

/**
 * Update notices, in the bottom-left notice area: "updated to X" once after an update, and "X is
 * ready" or "X is available" when there is something to do. Each goes away by itself after a
 * while (the update still installs on the next start); the download itself shows only in
 * Settings, under About.
 */
export function UpdateBanner() {
  const t = useT()
  const [s, setS] = useState<UpdateState>({ status: 'idle' })
  const [hidden, setHidden] = useState<string[]>([])
  useEffect(() => {
    void platform.update.getState().then(setS)
    return platform.update.onState(setS)
  }, [])
  useEffect(() => {
    if (platform.platform !== 'web') return
    const hour = 60 * 60 * 1000
    let lastCheck = 0
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < hour) return
      lastCheck = Date.now()
      void platform.update.check()
    }
    check()
    const timer = window.setInterval(check, hour)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  const hide = (key: string) => () => setHidden((h) => [...h, key])
  const justUpdated = useApp((st) => st.justUpdatedTo)
  if (justUpdated && !hidden.includes(`updated:${justUpdated}`)) {
    return (
      <Notice
        tone="success"
        timeout={10000}
        onClose={hide(`updated:${justUpdated}`)}
        actions={<NoticeButton onClick={() => void platform.update.openDownload()}>{t('update.whatsNew')}</NoticeButton>}
      >
        {t('update.updated', { version: justUpdated })}
      </Notice>
    )
  }
  const key = `${s.status}:${s.version}`
  if (hidden.includes(key)) return null
  if (s.status === 'ready' && platform.platform !== 'web') {
    return (
      <Notice
        timeout={15000}
        onClose={hide(key)}
        actions={
          <NoticeButton
            primary
            onClick={async () => {
              await boardLibrary.flush(true)
              await platform.update.install()
            }}
          >
            {t('update.restart')}
          </NoticeButton>
        }
      >
        {t('update.ready', { version: s.version ?? '' })}
      </Notice>
    )
  }
  if (s.status === 'available' && s.manual) {
    return (
      <Notice
        timeout={15000}
        onClose={hide(key)}
        actions={
          <NoticeButton primary onClick={() => void platform.update.openDownload()}>
            {t('update.download')}
          </NoticeButton>
        }
      >
        {t('update.available', { version: s.version ?? '' })}
      </Notice>
    )
  }
  return null
}

/** Settings, About: the version, a manual check and what the updater is doing. */
export function AboutSection() {
  const t = useT()
  const [version, setVersion] = useState('')
  const [reloading, setReloading] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const web = platform.platform === 'web'
  const reload = async () => {
    setReloading(true)
    setSaveFailed(false)
    try {
      await boardLibrary.flush(true)
      const { board, saveStatus } = useApp.getState()
      if (board && saveStatus !== 'saved') setSaveFailed(true)
      else await platform.update.install()
    } finally {
      setReloading(false)
    }
  }
  const [s, setS] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    void platform.update.version().then(setVersion)
    void platform.update.getState().then(setS)
    return platform.update.onState(setS)
  }, [])
  const status =
    s.status === 'dev'
      ? t('update.dev')
      : s.status === 'store'
      ? t('update.store')
      : s.status === 'web'
      ? t('update.web')
      : s.status === 'checking'
      ? t('update.checking')
      : s.status === 'none'
        ? t('update.upToDate')
        : s.status === 'downloading'
          ? `${t('update.downloading', { version: s.version ?? '' })} ${s.percent ?? 0}%`
          : s.status === 'ready'
            ? t(web ? 'update.webReady' : 'update.ready', { version: s.version ?? '' })
            : s.status === 'available'
              ? t('update.available', { version: s.version ?? '' })
              : s.status === 'error'
                ? t('update.error')
                : ''
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm/6 font-medium text-zinc-950 dark:text-white">Penrill {version}</span>
        {web && s.status === 'ready' ? (
          <Button color="blue" disabled={reloading} onClick={() => void reload()}>{t('update.reload')}</Button>
        ) : s.status !== 'store' && (
          <Button outline disabled={s.status === 'checking' || s.status === 'downloading'} onClick={() => void platform.update.check()}>
            {t('update.check')}
          </Button>
        )}
      </div>
      {status && <div role="status"><Text>{status}</Text></div>}
      {saveFailed && <p role="alert">{t('update.saveFailed')}</p>}
      <Text>{t('about.description')}</Text>
      <Text>{t('about.credit')}</Text>
      <a href="https://penrill.com/" target="_blank" rel="noopener noreferrer" className="w-fit text-sm text-blue-600 underline dark:text-blue-400">penrill.com</a>
    </div>
  )
}
