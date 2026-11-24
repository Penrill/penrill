import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../../../board/editorContext'
import { useT } from '../../../board/i18n'
import { TrackpadInk, trackpadFrame } from '../../../board/modules/trackpadInk'
import { InsertButton } from '../../../board/ui/chrome'
import { Notice } from '../../../board/ui/notices'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'

export function TrackpadButton() {
  const editor = useEditor()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [aspect, setAspect] = useState(1.6)
  const [error, setError] = useState(false)
  useEffect(() => {
    const api = platform.trackpad
    if (!open || !api) return
    const ink = new TrackpadInk(editor)
    let active = true
    let bounds = trackpadFrame(editor.view(), 1.6)
    const finish = () => {
      active = false
      ink.cancel()
      setOpen(false)
    }
    const off = api.onTouch((phase, x, y, ratio) => {
      if (!active) return
      if (phase === 'finish') return finish()
      if (phase === 'cancel') return ink.cancel()
      if (phase === 'pan') return ink.pan(x, y)
      if (phase === 'begin') {
        setAspect(ratio)
        bounds = trackpadFrame(editor.view(), ratio)
      }
      ink.point(phase, x, y, bounds)
    })
    const leave = boardLibrary.onLeaving(finish)
    window.addEventListener('resize', finish)
    void api.start().catch(() => {
      if (active) {
        setError(true)
        finish()
      }
    })
    return () => {
      active = false
      off()
      leave()
      window.removeEventListener('resize', finish)
      api.stop()
      ink.cancel()
    }
  }, [open, editor])
  const frame = open && trackpadFrame(editor.view(), aspect)
  return <>
    <InsertButton label={t('trackpad.title')} active={open} onClick={() => {
      setError(false)
      const session = editor.session.getState()
      if (session.tool !== 'highlighter') session.selectPen(session.activePen)
      setOpen(true)
    }} icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="3" /><path d="M3 16h18" />
    </svg>} />
    {frame && createPortal(<div className="pointer-events-none fixed z-50 rounded-xl border-2 border-dashed border-blue-500" style={frame}>
      <span role="status" className="panel absolute bottom-full left-1/2 mb-2 w-max max-w-full -translate-x-1/2 px-3 py-1 text-center text-sm">{t('trackpad.hint')}</span>
    </div>, document.body)}
    {error && <Notice onClose={() => setError(false)}>{t('trackpad.error')}</Notice>}
  </>
}
