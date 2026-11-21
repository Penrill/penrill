import { Button } from '@penrill/ui/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@penrill/ui/dialog'
import { Field, Label } from '@penrill/ui/fieldset'
import { Input } from '@penrill/ui/input'
import { Text } from '@penrill/ui/text'
import { useState, type FormEvent } from 'react'
import { useT } from '../../../board/i18n'
import { joinFlow, useJoin } from '../sync/join'

/** Shown when someone opens a board's draw link: they only say their name, then they draw. */
export function JoinDialog() {
  const t = useT()
  const state = useJoin()
  const [name, setName] = useState('')
  if (state.step === 'idle' || (state.step === 'joining' && !state.asked)) return null
  const busy = state.step === 'joining'
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void joinFlow.submit(name.trim())
  }
  return (
    <Dialog open onClose={joinFlow.close} size="sm">
      <form onSubmit={submit}>
        <DialogTitle>{t('join.title')}</DialogTitle>
        <DialogDescription>{t('join.hint')}</DialogDescription>
        <DialogBody>
          <Field disabled={busy}>
            <Label>{t('join.name')}</Label>
            <Input autoFocus required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {state.step === 'ask' && state.failed && (
            <Text className="mt-4 text-red-600! dark:text-red-500!">{t(state.failed === 'unknown' ? 'join.unknown' : 'join.failed')}</Text>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={joinFlow.close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="blue" disabled={busy || !name.trim()}>
            {t('join.button')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
