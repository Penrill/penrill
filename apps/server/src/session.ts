import { create } from 'zustand'
import { api, type Session } from './api'
import type { MessageKey } from './i18n'

interface SessionState {
  status: 'loading' | 'offline' | 'ready'
  session: Session | null
  /** A message for the next page shown, such as "Password changed." after a redirect. */
  notice: { key: MessageKey; vars?: Record<string, string> } | null
}

export const useSession = create<SessionState>(() => ({ status: 'loading', session: null, notice: null }))

export async function loadSession(): Promise<void> {
  try {
    const session = await api.session()
    useSession.setState({ status: 'ready', session })
    document.title = session.server
  } catch {
    useSession.setState({ status: 'offline' })
  }
}

export function notify(key: MessageKey, vars?: Record<string, string>): void {
  useSession.setState({ notice: { key, vars } })
}

export function clearNotice(): void {
  if (useSession.getState().notice) useSession.setState({ notice: null })
}
