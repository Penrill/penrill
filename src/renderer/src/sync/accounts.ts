import { create } from 'zustand'
import { serverOrigin } from '../../../shared/http'

export interface Account {
  name: string
  token: string
}

const key = (origin: string) => 'penrill-account:' + serverOrigin(origin)

export const useAccounts = create(() => ({ version: 0 }))

export const accountsChanged = () => useAccounts.setState(({ version }) => ({ version: version + 1 }))

export function account(origin: string): Account | null {
  if (!origin) return null
  try {
    return JSON.parse(localStorage.getItem(key(origin)) ?? 'null')
  } catch {
    return null
  }
}

export function rememberAccount(origin: string, value: Account | null): void {
  if (value) localStorage.setItem(key(origin), JSON.stringify(value))
  else localStorage.removeItem(key(origin))
  accountsChanged()
}
