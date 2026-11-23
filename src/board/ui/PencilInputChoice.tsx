import { useState, type ReactNode } from 'react'
import { Dialog, DialogBody, DialogDescription, DialogTitle } from '@penrill/ui/dialog'
import { useT } from '../i18n'
import { shouldOfferPencilChoice } from '../modules/iPadInput'
import { prefsStore, usePrefs } from '../store'
import { isIPad } from '../tools/penInput'

export function PencilInputChoice({ children }: { children: ReactNode }) {
  const t = useT()
  const mode = usePrefs(s => s.iPadFingerMode)
  const [open, setOpen] = useState(false)
  const choose = (value: 'draw' | 'pan') => {
    prefsStore.setState({ iPadFingerMode: value })
    setOpen(false)
  }
  return (
    <div className="contents" onPointerUpCapture={e => {
      if (shouldOfferPencilChoice(isIPad(navigator), mode, e.pointerType)) setOpen(true)
    }}>
      {children}
      <Dialog open={open && mode === null} onClose={() => choose('draw')} size="md">
        <DialogTitle>{t('pen.inputChoice')}</DialogTitle>
        <DialogDescription>{t('pen.inputHint')}</DialogDescription>
        <DialogBody className="grid gap-3">
          <button type="button" className="rounded-xl bg-blue-600 px-4 py-3 text-left text-white" onClick={() => choose('pan')}>
            <span className="block font-semibold">{t('pen.onlyPencil')}</span>
            <span className="mt-1 block text-sm">{t('pen.panHint')}</span>
          </button>
          <button type="button" className="rounded-xl border border-zinc-400/50 px-4 py-3 text-left dark:text-white" onClick={() => choose('draw')}>
            <span className="block font-semibold">{t('pen.allowFinger')}</span>
            <span className="mt-1 block text-sm">{t('pen.drawHint')}</span>
          </button>
        </DialogBody>
      </Dialog>
    </div>
  )
}
