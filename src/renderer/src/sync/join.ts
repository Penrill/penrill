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
 * Opening a board's draw link: ask for a name, get a guest account for just that board, open it.
 * Someone already signed in with a real account is not replaced by a guest.
 */
export type JoinState =
  | { step: 'idle' }
  | { step: 'ask'; origin: string; token: string; failed?: 'unknown' | 'signedIn' | 'network' }
  | { step: 'joining' }

export const useJoin = create<JoinState>(() => ({ step: 'idle' }))

export const joinFlow = {
  start(origin: string, token: string): void {
    const existing = account(origin)
    useJoin.setState({ step: 'ask', origin, token, ...(existing && !existing.guest ? { failed: 'signedIn' as const } : {}) }, true)
  },

  async submit(name: string): Promise<void> {
    const state = useJoin.getState()
    if (state.step !== 'ask' || state.failed === 'signedIn') return
    const { origin, token } = state
    useJoin.setState({ step: 'joining' }, true)
    try {
      const guest = await clientFor(origin).join(token, name)
      rememberAccount(origin, { name: guest.name, token: guest.token, guest: true })
      setStoragePreference('server', origin)
      await openRemote(origin, { id: guest.board, title: '', seq: 0, updated: new Date().toISOString() })
      useJoin.setState({ step: 'idle' }, true)
    } catch (error) {
      useJoin.setState({ step: 'ask', origin, token, failed: error instanceof ApiError && error.status === 404 ? 'unknown' : 'network' }, true)
    }
  },

  close(): void {
    useJoin.setState({ step: 'idle' }, true)
  }
}
