// Lets the web app open without a network after the first visit.
// Network first, so a reload always gets the latest version when online; the cache is the fallback.
// Board data is not here: it lives in IndexedDB (src/renderer/src/web/library.ts).
const CACHE = 'penrill-app'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  const url = new URL(request.url)
  if (url.pathname.endsWith('/web-build.json')) return
  const refreshing = request.mode === 'navigate' && url.searchParams.has('__penrill_reload')
  url.searchParams.delete('__penrill_reload')
  const key = refreshing ? url.href : request
  event.respondWith(
    fetch(request, refreshing ? { cache: 'reload' } : undefined)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(key, copy))
        }
        return response
      })
      .catch(async () => (await caches.match(key)) ?? (request.mode === 'navigate' ? caches.match('./') : Response.error()))
  )
})
