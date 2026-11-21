import { useEffect, useRef, useState } from 'react'
import { useSession } from '../editorContext'
import { useT } from '../i18n'
import { prefsStore, usePrefs } from '../store'
import { Notice, NoticeButton } from './notices'

type Which = 'straightedge' | 'protractor' | 'compass'
const ORDER: Which[] = ['compass', 'protractor', 'straightedge']

/**
 * How to use a drawing instrument, for a few seconds after it is put on the board. "Got it" is
 * remembered and that tip doesn't come back; otherwise it shows again the next time.
 */
export function InstrumentTip() {
  const t = useT()
  const on: Record<Which, boolean> = {
    straightedge: useSession((s) => s.ruler !== null || s.setSquare !== null),
    protractor: useSession((s) => s.protractor !== null),
    compass: useSession((s) => s.compass !== null)
  }
  const hidden = usePrefs((s) => s.hiddenTips)
  const [shown, setShown] = useState<Which | null>(null)
  const before = useRef(on)
  useEffect(() => {
    const started = ORDER.find((w) => on[w] && !before.current[w] && !hidden.includes(w))
    before.current = on
    if (started) setShown(started)
    else setShown((s) => (s && !on[s] ? null : s))
  }, [on.straightedge, on.protractor, on.compass])
  if (!shown) return null
  return (
    <Notice
      key={shown}
      timeout={9000}
      closable={false}
      onClose={() => setShown(null)}
      actions={
        <NoticeButton
          onClick={() => {
            prefsStore.setState((s) => ({ hiddenTips: [...s.hiddenTips, shown] }))
            setShown(null)
          }}
        >
          {t('tip.hide')}
        </NoticeButton>
      }
    >
      {t(shown === 'compass' ? 'tip.compass' : shown === 'protractor' ? 'tip.protractor' : 'tip.straightedge')}
    </Notice>
  )
}
