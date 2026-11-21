/**
 * Up to 0.12 the app was called Inkboard and its localStorage keys started with "inkboard". Moves a
 * saved value to its Penrill key once, so settings survive the update. A value already under the new
 * key wins. Safe to call on every start: once the old key is gone it does nothing.
 */
export function moveStorageKey(from: string, to: string): void {
  try {
    const old = localStorage.getItem(from)
    if (old === null) return
    if (localStorage.getItem(to) === null) localStorage.setItem(to, old)
    localStorage.removeItem(from)
  } catch {
    // storage unavailable: nothing to move
  }
}
