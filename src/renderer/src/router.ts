import { useApp, type AppState, type HomeTab } from './appState'
import { platform } from './platform'

/**
 * Which screen the app shows, as an address: the home screen's pages and each board have their own
 * (`/app/board/<id>` on penrill.com), so a reload, a bookmark and the browser's Back button land on
 * the same screen. The desktop app has no address bar and keeps the same routes in memory only.
 */
export type Route = { view: 'home'; tab: HomeTab } | { view: 'board'; id: string }

const TABS: readonly HomeTab[] = ['boards', 'templates', 'deleted', 'sync']

/** The address bar follows the app only in a browser. */
const urlRouting = platform.platform === 'web'
/** Where the app is served from: /app/ on penrill.com, / on Penrill Cloud. */
const BASE = urlRouting ? import.meta.env.BASE_URL : '/'

export function parseRoute(path: string): Route {
  const rest = path.startsWith(BASE) ? path.slice(BASE.length) : ''
  const [first, second] = rest.split('/').filter(Boolean)
  if (first === 'board' && second) return { view: 'board', id: decodeURIComponent(second) }
  const tab = TABS.find((t) => t === first)
  return { view: 'home', tab: tab ?? 'boards' }
}

export function routePath(route: Route): string {
  if (route.view === 'board') return `${BASE}board/${encodeURIComponent(route.id)}`
  return route.tab === 'boards' ? BASE : BASE + route.tab
}

export const homePath = (tab: HomeTab): string => routePath({ view: 'home', tab })

function routeOf(state: AppState): Route | null {
  if (state.view === 'home') return { view: 'home', tab: state.homeTab }
  // A new board has no id until the library has created it.
  return state.board ? { view: 'board', id: state.board.id } : null
}

const keyOf = (state: AppState): string => {
  const route = routeOf(state)
  return route ? routePath(route) : ''
}

/**
 * Keeps the address in step with the screen and shows the screen of an address the browser goes
 * back or forward to. Returns the route the app was opened with.
 */
export function startRouter(show: (route: Route) => Promise<void>): Route {
  if (!urlRouting) return { view: 'home', tab: 'boards' }
  // penrill.com is a static site: an address inside the app that has no file of its own comes back
  // from the site's 404 page as /app/?route=board/<id>.
  const redirected = new URLSearchParams(location.search).get('route')
  if (redirected !== null) history.replaceState(null, '', BASE + redirected.replace(/^\/+/, ''))
  // The first screen replaces the address the app was opened with (a board that no longer exists
  // turns into the home screen without leaving a dead entry in the history), and so does every
  // screen reached with Back or Forward.
  let replace = true
  useApp.subscribe((state, previous) => {
    const path = keyOf(state)
    if (!path || path === keyOf(previous)) return
    if (path !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', path)
    replace = false
  })
  window.addEventListener('popstate', () => {
    replace = true
    void show(parseRoute(location.pathname)).finally(() => (replace = false))
  })
  return parseRoute(location.pathname)
}
