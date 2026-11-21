import { useSyncExternalStore } from 'react'

/** The few pages of the server's web app need no router library: the path is the state. */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(href: string, replace = false): void {
  if (replace) history.replaceState(null, '', href)
  else history.pushState(null, '', href)
  window.scrollTo(0, 0)
  for (const listener of listeners) listener()
}

export interface Location {
  path: string
  query: URLSearchParams
}

let cached: { href: string; location: Location } | null = null

function snapshot(): Location {
  const href = window.location.pathname + window.location.search
  if (cached?.href !== href) {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    cached = { href, location: { path, query: new URLSearchParams(window.location.search) } }
  }
  return cached.location
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, snapshot)
}

/** `/invite/:token` against `/invite/abc` gives `{ token: 'abc' }`, or null when the path is different. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/')
  const got = path.split('/')
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i])
    else if (want[i] !== got[i]) return null
  }
  return params
}
