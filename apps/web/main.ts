// The web app: the desktop renderer's app shell with the web platform (src/renderer/src/web).
if (import.meta.env.MODE === 'cloud') {
  void import('./cloud').then(({ startCloud }) => startCloud())
} else {
  void import('../../src/renderer/src/main')
}

// Works offline after the first visit (public/sw.js). Not in dev: it would cache the dev server.
if (import.meta.env.MODE !== 'cloud' && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {
      // Still works online without it.
    })
  })
}
