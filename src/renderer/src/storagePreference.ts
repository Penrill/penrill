import { serverOrigin } from '../../shared/http'

export const hostedCloud = import.meta.env.MODE === 'cloud'
export const cloudOrigin = hostedCloud ? window.location.origin : import.meta.env.VITE_PENRILL_CLOUD_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5082' : '')
export const cloudLabel = import.meta.env.DEV && !import.meta.env.VITE_PENRILL_CLOUD_URL ? 'storage.localCloud' : 'storage.cloud'
export type StorageSource = 'device' | 'cloud' | 'server'

export function storagePreference() {
  if (hostedCloud) return { source: 'cloud' as const, address: '', origin: cloudOrigin }
  const saved = localStorage.getItem('penrill-library-source')
  const source: StorageSource = saved === 'server' || (saved === null && import.meta.env.DEV)
    ? 'server' : saved === 'cloud' && cloudOrigin ? 'cloud' : 'device'
  let address = 'http://127.0.0.1:5081'
  try { address = serverOrigin(localStorage.getItem('penrill-server-origin') || address) }
  catch { /* Use the local development service for an invalid saved address. */ }
  return { source, address, origin: source === 'server' ? address : source === 'cloud' ? cloudOrigin : '' }
}
