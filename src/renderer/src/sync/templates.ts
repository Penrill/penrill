import { create } from 'zustand'
import { renderThumbnail } from '../../../board/engine/export'
import { decodeBoard, encodeBoard } from '../../../board/engine/serialize'
import type { TemplateEntry } from '../../../shared/library'
import { boardLibrary } from '../boardLibrary'
import { platform } from '../platform'
import { storagePreference } from '../storagePreference'
import { account } from './accounts'
import type { SharedTemplate } from './api'
import { isAccessError } from './api'
import { clientFor } from './clients'

/**
 * Templates on a server are one template, not copies. Its author edits it and everyone who added
 * it gets the change; others can only use it, or duplicate it to have a template of their own.
 *
 * Each device keeps a cached copy (to work offline) and remembers where it came from:
 * - `mine`: this account shared it. Edits here go to the server.
 * - `theirs`: added from someone else. Read-only here; follows the author's version.
 */
export interface TemplateLink {
  origin: string
  user: string
  remote: string
  kind: 'mine' | 'theirs'
  author: string
  folder: string
  updated: number
  /** Edited here while the server could not be reached: sent on the next refresh. */
  pending?: boolean
  /** The author stopped sharing it, or access to its folder was lost. The cached copy stays usable. */
  gone?: boolean
}

const PREFIX = 'penrill-template:'

export const useTemplateLinks = create(() => ({ version: 0 }))
const changed = (): void => useTemplateLinks.setState(({ version }) => ({ version: version + 1 }))

export function templateLink(localId: string): TemplateLink | null {
  try {
    const link = JSON.parse(localStorage.getItem(PREFIX + localId) ?? 'null') as TemplateLink | null
    return link && account(link.origin)?.name === link.user ? link : null
  } catch {
    return null
  }
}

function saveLink(localId: string, link: TemplateLink | null): void {
  if (link) localStorage.setItem(PREFIX + localId, JSON.stringify(link))
  else localStorage.removeItem(PREFIX + localId)
  changed()
}

/** Whose a template is: this person's own (shared or not), or someone else's from the server. */
export function isMine(localId: string): boolean {
  return templateLink(localId)?.kind !== 'theirs'
}

/** The server templates are shared on: the one boards sync with, while signed in there. */
export function templateServer(): string | null {
  const { origin } = storagePreference()
  return origin && account(origin) ? origin : null
}

async function contentOf(template: TemplateEntry): Promise<Uint8Array> {
  return encodeBoard(await decodeBoard(await platform.library.loadTemplate(template.id)))
}

async function findLocal(localId: string): Promise<TemplateEntry | undefined> {
  return (await platform.library.list()).templates.find((tp) => tp.id === localId)
}

/** Shares one of this person's templates with everyone on the server (`folder` empty) or one folder. */
export async function shareTemplate(origin: string, localId: string, folder: string): Promise<void> {
  const template = await findLocal(localId)
  const user = account(origin)?.name
  if (!template || !user || !isMine(localId)) throw new Error('Not a template of yours')
  const shared = await clientFor(origin).publishTemplate(folder, template.name, await contentOf(template))
  saveLink(localId, { origin, user, remote: shared.id, kind: 'mine', author: user, folder, updated: shared.updated })
}

/** Stops sharing: people who added it keep their copy, marked as no longer shared. */
export async function stopSharing(localId: string): Promise<void> {
  const link = templateLink(localId)
  if (!link || link.kind !== 'mine') return
  try {
    await clientFor(link.origin).removeTemplate(link.remote)
  } catch (error) {
    if (!isAccessError(error)) throw error
  }
  saveLink(localId, null)
}

/** After this person edits or renames a template they shared: the server's copy follows. */
export async function pushTemplate(localId: string): Promise<void> {
  const link = templateLink(localId)
  const template = await findLocal(localId)
  if (!link || link.kind !== 'mine' || !template) return
  try {
    const shared = await clientFor(link.origin).updateTemplate(link.remote, template.name, await contentOf(template))
    saveLink(localId, { ...link, updated: shared.updated, pending: false, gone: false })
  } catch (error) {
    // Removed on the server (by an admin): it is just a template of this person's again.
    if (isAccessError(error)) saveLink(localId, null)
    else saveLink(localId, { ...link, pending: true })
  }
}

/** Deletes a template here. One this person shared stops being shared too. */
export async function deleteTemplate(localId: string): Promise<void> {
  if (templateLink(localId)?.kind === 'mine') await stopSharing(localId)
  else saveLink(localId, null)
  await boardLibrary.deleteTemplate(localId)
}

/** A template of this person's own with the same content, to change freely. */
export async function duplicateTemplate(localId: string, name: string): Promise<void> {
  const template = await findLocal(localId)
  if (!template) return
  const data = await decodeBoard(await platform.library.loadTemplate(localId))
  const thumb = await renderThumbnail(data.items, data.background, boardLibrary.editor.features)
  await platform.library.saveTemplate(name, await encodeBoard(data), thumb)
  await boardLibrary.refreshLibrary()
}

/** Local templates linked to this server template, if any were added on this device. */
export function localFor(origin: string, remote: string): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    const link = templateLink(key.slice(PREFIX.length))
    if (link?.origin === origin && link.remote === remote) return key.slice(PREFIX.length)
  }
  return null
}

async function download(origin: string, shared: SharedTemplate): Promise<{ bytes: Uint8Array; thumb: Uint8Array | null }> {
  const bytes = await clientFor(origin).template(shared.id)
  const data = await decodeBoard(bytes)
  return { bytes, thumb: await renderThumbnail(data.items, data.background, boardLibrary.editor.features) }
}

/** Adds a template from the server to this device's templates. Someone else's stays theirs. */
export async function addTemplate(origin: string, shared: SharedTemplate): Promise<void> {
  const user = account(origin)?.name
  if (!user || localFor(origin, shared.id)) return
  const { bytes, thumb } = await download(origin, shared)
  const entry = await platform.library.saveTemplate(shared.name, bytes, thumb)
  saveLink(entry.id, {
    origin,
    user,
    remote: shared.id,
    kind: shared.author === user ? 'mine' : 'theirs',
    author: shared.author,
    folder: shared.folder,
    updated: shared.updated
  })
  await boardLibrary.refreshLibrary()
}

let refreshing: Promise<void> | null = null

/**
 * Brings linked templates up to date with the server: new versions of others' templates come in,
 * edits of this person's that could not be sent go out, removed ones are marked as no longer shared.
 */
export function refreshTemplates(origin: string, catalog: SharedTemplate[]): Promise<void> {
  refreshing ??= (async () => {
    const byId = new Map(catalog.map((tp) => [tp.id, tp]))
    let touched = false
    for (const template of (await platform.library.list()).templates) {
      const link = templateLink(template.id)
      if (!link || link.origin !== origin) continue
      const shared = byId.get(link.remote)
      if (link.kind === 'mine') {
        if (link.pending) await pushTemplate(template.id)
        else if (!shared) saveLink(template.id, null)
        continue
      }
      if (!shared) {
        if (!link.gone) saveLink(template.id, { ...link, gone: true })
        continue
      }
      if (shared.updated === link.updated && !link.gone) continue
      try {
        const { bytes, thumb } = await download(origin, shared)
        await platform.library.replaceTemplate(template.id, bytes, thumb)
        if (shared.name !== template.name) await platform.library.renameTemplate(template.id, shared.name)
        boardLibrary.forgetTemplateThumb(template.id)
        saveLink(template.id, { ...link, updated: shared.updated, folder: shared.folder, gone: false })
        touched = true
      } catch {
        // Tried again on the next refresh.
      }
    }
    if (touched) await boardLibrary.refreshLibrary()
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}
