import { create } from 'zustand'
import { serverOrigin } from '../../../shared/http'
import type { ConnectApi, StoredAccount } from '../../../shared/platform'

export type Account = StoredAccount

const PREFIX = 'penrill-account:'
const key = (origin: string) => PREFIX + serverOrigin(origin)

export const useAccounts = create(() => ({ version: 0 }))

export const accountsChanged = () => useAccounts.setState(({ version }) => ({ version: version + 1 }))

/**
 * Where tokens live: on the desktop in the system keychain through the main process (read once at
 * startup, kept here in memory), in a browser in local storage. Read through `window.penrill`
 * directly: the web platform itself reads accounts while it is being created.
 */
const secure: ConnectApi | undefined = typeof window === 'undefined' ? undefined : window.penrill?.connect
const memory: Record<string, Account> = secure ? { ...secure.accounts } : {}

// Accounts saved in local storage by versions before the keychain move there once.
if (secure) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const stored = localStorage.key(i)
    if (!stored?.startsWith(PREFIX)) continue
    try {
      const origin = serverOrigin(stored.slice(PREFIX.length))
      const value = JSON.parse(localStorage.getItem(stored) ?? 'null') as Account | null
      if (value && !memory[origin]) {
        memory[origin] = value
        void secure.saveAccount(origin, value)
      }
    } catch {
      // Unreadable entry: drop it.
    }
    localStorage.removeItem(stored)
  }
}

export function account(origin: string): Account | null {
  if (!origin) return null
  try {
    if (secure) return memory[serverOrigin(origin)] ?? null
    return JSON.parse(localStorage.getItem(key(origin)) ?? 'null')
  } catch {
    return null
  }
}

export function rememberAccount(origin: string, value: Account | null): void {
  if (secure) {
    const at = serverOrigin(origin)
    if (value) memory[at] = value
    else delete memory[at]
    void secure.saveAccount(at, value)
  } else if (value) localStorage.setItem(key(origin), JSON.stringify(value))
  else localStorage.removeItem(key(origin))
  accountsChanged()
}
