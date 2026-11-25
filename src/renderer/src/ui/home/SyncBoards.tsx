import { Badge } from '@penrill/ui/badge'
import { Button } from '@penrill/ui/button'
import { Checkbox } from '@penrill/ui/checkbox'
import { Subheading } from '@penrill/ui/heading'
import { Switch, SwitchField } from '@penrill/ui/switch'
import { Description, Label } from '@penrill/ui/fieldset'
import { Text } from '@penrill/ui/text'
import { useState, type ReactNode } from 'react'
import { useT } from '../../../../board/i18n'
import type { BoardEntry } from '../../../../shared/library'
import { boardLibrary } from '../../boardLibrary'
import { cloudOrigin } from '../../storagePreference'
import { syncCoordinator } from '../../sync/coordinator'
import { useSyncStatus } from '../../sync/librarySync'
import { activeLink, canCopy, linkBoard, linkFor, saveLink, setSyncsNewBoards, sharedWithMe, stopSyncing, syncsNewBoards, useLinks } from '../../sync/links'
import { SharedDeleteAlert } from '../share/ShareBoard'
import { useDeviceBoards } from './BoardsPage'
import { Picture, useImageUrl } from './parts'

/** Servers that were just connected and still wait for the person to pick which boards go there. */
const choosing = new Set<string>()

export function askWhichBoards(origin: string): void {
  choosing.add(origin)
}

export function isChoosingBoards(origin: string): boolean {
  return choosing.has(origin)
}

const liveBoards = (boards: BoardEntry[]): BoardEntry[] =>
  boards.filter((b) => !b.deletedAt && !b.missing).sort((a, b) => b.updatedAt - a.updatedAt)

function BoardRow({ entry, control }: { entry: BoardEntry; control: ReactNode }) {
  const thumb = useImageUrl(() => boardLibrary.thumbUrl(entry), [entry])
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="block h-9 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-zinc-950/10 dark:ring-white/10">
        <Picture url={thumb} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm/6 text-zinc-950 dark:text-white">{entry.title}</span>
      {control}
    </li>
  )
}

/**
 * Right after connecting: which of this device's boards go to the server. Nothing is uploaded
 * before the person says so; on a shared server (a school, a team) private boards stay private.
 */
export function ChooseBoards({ origin, server, onDone }: { origin: string; server: string; onDone: () => void }) {
  const t = useT()
  const boards = liveBoards(useDeviceBoards()).filter((b) => !activeLink(b.id))
  // Penrill Cloud is this person's own space; a server is shared with other people.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(origin === cloudOrigin ? boards.map((b) => b.id) : []))
  const [newBoards, setNewBoards] = useState(() => syncsNewBoards(origin))
  const toggle = (id: string, on: boolean): void =>
    setPicked((old) => {
      const next = new Set(old)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const finish = (sync: boolean): void => {
    if (sync) for (const id of picked) linkBoard(id, origin)
    setSyncsNewBoards(origin, newBoards)
    choosing.delete(origin)
    void syncCoordinator.refresh()
    onDone()
  }
  const all = boards.length > 0 && picked.size === boards.length

  return (
    <div>
      <Badge color="green">{t('sync.connectedShort', { server })}</Badge>
      <Subheading className="m-0 mt-6">{t('sync.chooseTitle')}</Subheading>
      <Text className="mt-2">{t(origin === cloudOrigin ? 'sync.chooseHintCloud' : 'sync.chooseHintServer')}</Text>
      {boards.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between gap-3 border-b border-zinc-950/5 pb-2 dark:border-white/5">
            <label className="flex items-center gap-3 text-sm/6 font-medium text-zinc-950 dark:text-white">
              <Checkbox checked={all} indeterminate={picked.size > 0 && !all} onChange={(on) => setPicked(new Set(on ? boards.map((b) => b.id) : []))} />
              {t('sync.chooseAll')}
            </label>
            <Text className="m-0">{t('sync.chosen', { n: picked.size, total: boards.length })}</Text>
          </div>
          <ul role="list" className="m-0 max-h-96 list-none divide-y divide-zinc-950/5 overflow-y-auto p-0 dark:divide-white/5">
            {boards.map((b) => (
              <BoardRow key={b.id} entry={b} control={<Checkbox aria-label={b.title} checked={picked.has(b.id)} onChange={(on) => toggle(b.id, on)} />} />
            ))}
          </ul>
        </>
      )}
      <SwitchField className="mt-6">
        <Label>{t('sync.newBoards')}</Label>
        <Description>{t('sync.newBoardsHint')}</Description>
        <Switch color="blue" checked={newBoards} onChange={setNewBoards} />
      </SwitchField>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button color="blue" onClick={() => finish(true)}>
          {picked.size > 0 ? t('sync.chooseDone', { n: picked.size }) : t('sync.chooseNone')}
        </Button>
        {picked.size > 0 && (
          <Button plain onClick={() => finish(false)}>
            {t('sync.chooseLater')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** While connected: every board of this device with a switch, and whether new ones sync by themselves. */
export function SyncedBoards({ origin }: { origin: string }) {
  const t = useT()
  useLinks((s) => s.version)
  const states = useSyncStatus((s) => s.states)
  const boards = liveBoards(useDeviceBoards())
  const synced = boards.filter((b) => activeLink(b.id)).length
  // A shared board of this account asks first what happens to the copies of the people it is shared with.
  const [asking, setAsking] = useState<BoardEntry | null>(null)
  const stop = (id: string): void => {
    stopSyncing(id)
    void syncCoordinator.refresh()
  }
  const set = (entry: BoardEntry, on: boolean): void => {
    const link = activeLink(entry.id)
    if (on) {
      linkBoard(entry.id, origin)
      void syncCoordinator.refresh()
    } else if (link?.shared && !sharedWithMe(link)) setAsking(entry)
    else stop(entry.id)
  }
  return (
    <section className="mt-12">
      <Subheading className="m-0">{t('sync.boardsTitle', { n: synced, total: boards.length })}</Subheading>
      <Text className="mt-1">{t('sync.boardsHint')}</Text>
      <SwitchField className="mt-6">
        <Label>{t('sync.newBoards')}</Label>
        <Description>{t('sync.newBoardsHint')}</Description>
        <Switch color="blue" checked={syncsNewBoards(origin)} onChange={(on) => setSyncsNewBoards(origin, on)} />
      </SwitchField>
      {boards.length > 0 && (
        <ul role="list" className="m-0 mt-6 list-none divide-y divide-zinc-950/5 border-t border-zinc-950/5 p-0 dark:divide-white/5 dark:border-white/5">
          {boards.map((b) => {
            const on = !!activeLink(b.id)
            const status = states[b.id]
            return (
              <BoardRow
                key={b.id}
                entry={b}
                control={
                  <span className="flex shrink-0 items-center gap-3">
                    {on && (status === 'offline' || status === 'denied' || status === 'read-only' || status === 'quota' || status === 'room-full') && (
                      <Badge color={status === 'denied' || status === 'quota' ? 'red' : 'amber'}>{t(`storage.${status}`)}</Badge>
                    )}
                    {/* A board someone else shared without copying stays synced: unsynced, it would become a free copy. */}
                    <Switch color="blue" aria-label={b.title} checked={on} disabled={on && !canCopy(b.id)} onChange={(value) => set(b, value)} />
                  </span>
                }
              />
            )
          })}
        </ul>
      )}
      {asking && (
        <SharedDeleteAlert
          title={asking.title}
          onClose={() => setAsking(null)}
          onChoose={(copies) => {
            const link = linkFor(asking.id)
            if (link) saveLink(asking.id, { ...link, copies }, true)
            stop(asking.id)
          }}
        />
      )}
    </section>
  )
}
