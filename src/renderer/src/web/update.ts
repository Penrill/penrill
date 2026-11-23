import type { UpdateApi, UpdateState } from '../../../shared/platform'

/** Each deployment has its own ID, including builds made between tagged releases. */
export function createWebUpdater(build: string, version: string): UpdateApi {
  let state: UpdateState = { status: 'web' }
  const listeners = new Set<(state: UpdateState) => void>()
  const set = (value: UpdateState) => {
    state = value
    for (const notify of listeners) notify(value)
  }
  return {
    async version() { return version },
    async getState() { return state },
    onState(handler) {
      listeners.add(handler)
      return () => { listeners.delete(handler) }
    },
    async check() {
      if (state.status === 'checking') return
      set({ status: 'checking' })
      try {
        const response = await fetch(new URL(import.meta.env.BASE_URL + 'web-build.json', location.origin), {
          cache: 'no-store', signal: AbortSignal.timeout(12000)
        })
        if (!response.ok) throw new Error('Build information unavailable')
        const latest = await response.json()
        if (typeof latest.build !== 'string' || !latest.build || typeof latest.version !== 'string') throw new Error('Invalid build information')
        set(latest.build === build ? { status: 'none' } : { status: 'ready', version: latest.version })
      } catch {
        set({ status: 'error' })
      }
    },
    async install() {
      if (state.status !== 'ready') return
      const url = new URL(location.href)
      // Fetch the actual entry page directly, including on static hosts with a 404 router.
      url.searchParams.set('__penrill_reload', Date.now() + ':' + url.pathname)
      url.pathname = import.meta.env.BASE_URL
      location.replace(url.href)
    },
    async openDownload() {
      window.open('https://github.com/Penrill/penrill/releases', '_blank', 'noopener')
    }
  }
}
