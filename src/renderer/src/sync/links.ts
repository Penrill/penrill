import { create } from 'zustand'
import { account } from './accounts'

export interface Link {
  origin: string
  user: string
  remote: string
  seq: number | null
  published: boolean
  /** Seen in this device's trash; once the board is gone from there, its server copy goes too. */
  trashed?: boolean
  /** Who owns the board on the server, once known. */
  owner?: string
  /** For a board someone else owns: whether they let this account copy and export it. */
  copying?: boolean
  /** For the owner: someone else can open the board. */
  shared?: boolean
  /** For the owner's shared board: what its deletion does to the copies of the people it was shared with. */
  copies?: 'keep' | 'remove'
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

/** A board someone else owns and shared with this account. */
export const sharedWithMe = (link: Link) => !!link.owner && link.owner !== link.user

/**
 * Whether the board may be duplicated, saved as a file, exported or copied out of. Boards of this device and of
 * this account always; boards shared with it only when their owner allows it.
 */
export function canCopy(localId: string | null | undefined): boolean {
  const link = localId ? linkFor(localId) : null
  return !link || !sharedWithMe(link) || link.copying === true
}

/** What a check of the server copy found about a board missing from the server's list. */
export type CopyState = 'here' | 'gone' | 'removed' | 'denied' | 'signed-out'

/**
 * What to do with this device's copy: `drop` a board someone else owns when they stopped sharing it or
 * deleted it for everyone; `forget` the server copy of a board deleted with copies kept (and of this
 * account's own boards), keeping it here; `denied` while signed out or without access to one's own board.
 */
export function copyOutcome(link: Link, state: CopyState): 'keep' | 'drop' | 'forget' | 'denied' {
  if (state === 'here') return 'keep'
  // Signed out is not a lost share: the board waits for this account to sign in again.
  if (state === 'signed-out') return 'denied'
  if (sharedWithMe(link) && (state === 'denied' || state === 'removed')) return 'drop'
  return state === 'denied' ? 'denied' : 'forget'
}

/** The owner just let someone onto the board: deleting it now asks what happens to their copies. */
export function markShared(link: Link): void {
  for (const [localId, known] of allLinks()) {
    if (known.origin === link.origin && known.user === link.user && known.remote === link.remote && !known.shared) {
      saveLink(localId, { ...known, shared: true }, true)
    }
  }
}

export function saveLink(localId: string, link: Link, quiet = false): void {
  localStorage.setItem(PREFIX + localId, JSON.stringify(link))
  if (!quiet) linksChanged()
}

export function removeLink(localId: string): void {
  localStorage.removeItem(PREFIX + localId)
  linksChanged()
}

const HIDDEN_PREFIX = 'penrill-hidden-remote:'
const hiddenKey = (origin: string, user: string) => HIDDEN_PREFIX + JSON.stringify([origin, user])

/** Server boards this device let go of: they stay on the server but are not offered for download here. */
export function hiddenRemotes(origin: string, user: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(hiddenKey(origin, user)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function hideRemote(origin: string, user: string, remote: string): void {
  const hidden = hiddenRemotes(origin, user)
  hidden.add(remote)
  localStorage.setItem(hiddenKey(origin, user), JSON.stringify([...hidden]))
  linksChanged()
}

const DROP_PREFIX = 'penrill-drop:'

/**
 * Takes a board off the server: the board stays on this device, its link becomes a pending
 * deletion that the next sync pass sends (and retries while offline). The server only deletes
 * boards of their owner; for a board someone shared, this device just stops syncing it.
 */
export function removeFromServer(localId: string): void {
  const link = linkFor(localId)
  if (!link) return
  localStorage.setItem(DROP_PREFIX + localId, JSON.stringify(link))
  hideRemote(link.origin, link.user, link.remote)
  removeLink(localId)
}

/** Stop syncing: the board stays here only, and its server copy is deleted (if it is this account's). */
export const stopSyncing = removeFromServer

/** The server copy is already gone: the board just stays on this device. */
export function forgetServerCopy(localId: string): void {
  const link = linkFor(localId)
  if (link) hideRemote(link.origin, link.user, link.remote)
  removeLink(localId)
}

export function pendingDeletions(): [string, Link][] {
  const drops: [string, Link][] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(DROP_PREFIX)) continue
    try {
      drops.push([key.slice(DROP_PREFIX.length), JSON.parse(localStorage.getItem(key)!) as Link])
    } catch {
      localStorage.removeItem(key)
    }
  }
  return drops
}

export function deletionDone(localId: string): void {
  localStorage.removeItem(DROP_PREFIX + localId)
}

/** Every link this device keeps, also of boards in the trash or deleted from it. */
export function allLinks(): [string, Link][] {
  const links: [string, Link][] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    const link = linkFor(key.slice(PREFIX.length))
    if (link) links.push([key.slice(PREFIX.length), link])
  }
  return links
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
