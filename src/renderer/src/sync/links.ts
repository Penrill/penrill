import { create } from 'zustand'
import { account } from './accounts'

export interface Link {
  origin: string
  user: string
  remote: string
  seq: number | null
  published: boolean
}

const PREFIX = 'penrill-link:'

export const useLinks = create(() => ({ version: 0 }))

export const linksChanged = () => useLinks.setState(({ version }) => ({ version: version + 1 }))

export function linkFor(localId: string): Link | null {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + localId) ?? 'null')
  } catch {
    return null
  }
}

export function activeLink(localId: string): Link | null {
  const link = linkFor(localId)
  return link && account(link.origin)?.name === link.user ? link : null
}

export function saveLink(localId: string, link: Link, quiet = false): void {
  localStorage.setItem(PREFIX + localId, JSON.stringify(link))
  if (!quiet) linksChanged()
}

export function removeLink(localId: string): void {
  localStorage.removeItem(PREFIX + localId)
  linksChanged()
}

export function linkedBoards(): [string, Link][] {
  const links: [string, Link][] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    const localId = key.slice(PREFIX.length)
    const link = activeLink(localId)
    if (link) links.push([localId, link])
  }
  return links
}

export const scopeOf = (link: Link) => JSON.stringify([link.origin, link.user, link.remote])

export const newRemoteId = () => crypto.randomUUID().replaceAll('-', '')

/** Starts syncing a board of this device with the account on `origin`. */
export function linkBoard(localId: string, origin: string): void {
  const user = account(origin)?.name
  if (user && !activeLink(localId)) saveLink(localId, { origin, user, remote: newRemoteId(), seq: null, published: false })
}

const NEW_PREFIX = 'penrill-sync-new:'

/** Whether boards made from now on sync by themselves. On unless turned off for this server. */
export function syncsNewBoards(origin: string): boolean {
  return localStorage.getItem(NEW_PREFIX + origin) !== 'off'
}

export function setSyncsNewBoards(origin: string, on: boolean): void {
  localStorage.setItem(NEW_PREFIX + origin, on ? 'on' : 'off')
  linksChanged()
}
