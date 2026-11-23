// The web app: the desktop renderer's app shell with the web platform (src/renderer/src/web).
const url = new URL(location.href)
const reloadPath = url.searchParams.get('__penrill_reload')
if (reloadPath !== null) {
  const path = /^\d+:(\/.*)$/.exec(reloadPath)?.[1]
  if (path) url.pathname = path
  url.searchParams.delete('__penrill_reload')
  history.replaceState(history.state, '', url)
}

if (import.meta.env.MODE === 'cloud') {
  void import('./cloud').then(({ startCloud }) => startCloud())
} else {
  void import('../../src/renderer/src/main')
}

// Works offline after the first visit (public/sw.js). Not in dev: it would cache the dev server.
if (import.meta.env.MODE !== 'cloud' && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL(import.meta.env.BASE_URL + 'sw.js', location.origin)).catch(() => {
      // Still works online without it.
    })
  })
}
