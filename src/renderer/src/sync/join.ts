import { create } from 'zustand'
import { platform } from '../platform'
import { setStoragePreference } from '../storagePreference'
import { account, rememberAccount } from './accounts'
import { ApiError } from './api'
import { clientFor } from './clients'
import { openRemote } from './librarySync'

/** Where the editor lives for people who follow a draw link: the web app next to this page, or penrill.com from the desktop app. */
export function drawLink(origin: string, token: string): string {
  const editor = platform.connect ? 'https://penrill.com/app/' : location.origin + import.meta.env.BASE_URL
  return `${editor}#server=${encodeURIComponent(origin)}&join=${token}`
}

/**
 * Opening a board's draw link. A device that already has an account on that server (from an
 * earlier link, or a real one) just gets the board; otherwise the person says a name and gets a
 * guest account for that board only.
 */
export type JoinState =
  | { step: 'idle' }
  | { step: 'ask'; origin: string; token: string; failed?: 'unknown' | 'network' }
  /** `asked`: the name dialog stays up while it works; otherwise nothing is shown. */
  | { step: 'joining'; asked: boolean }

export const useJoin = create<JoinState>(() => ({ step: 'idle' }))

const failure = (error: unknown): 'unknown' | 'network' => (error instanceof ApiError && error.status === 404 ? 'unknown' : 'network')

async function open(origin: string, board: string): Promise<void> {
  await openRemote(origin, { id: board, title: '', seq: 0, updated: new Date().toISOString() })
  useJoin.setState({ step: 'idle' }, true)
}

export const joinFlow = {
  async start(origin: string, token: string): Promise<void> {
    if (!account(origin)) {
      useJoin.setState({ step: 'ask', origin, token }, true)
      return
    }
    useJoin.setState({ step: 'joining', asked: false }, true)
    try {
      await open(origin, (await clientFor(origin).join(token, null)).board)
    } catch (error) {
      // A signed-out or removed account: carry on as someone new.
      const reason = failure(error)
      useJoin.setState({ step: 'ask', origin, token, ...(reason === 'unknown' ? { failed: reason } : {}) }, true)
    }
  },

  async submit(name: string): Promise<void> {
    const state = useJoin.getState()
    if (state.step !== 'ask') return
    const { origin, token } = state
    useJoin.setState({ step: 'joining', asked: true }, true)
    try {
      const guest = await clientFor(origin).join(token, name)
      if (guest.token) {
        rememberAccount(origin, { name: guest.name, token: guest.token, guest: true })
        setStoragePreference('server', origin)
      }
      await open(origin, guest.board)
    } catch (error) {
      useJoin.setState({ step: 'ask', origin, token, failed: failure(error) }, true)
    }
  },

  close(): void {
    useJoin.setState({ step: 'idle' }, true)
  }
}
