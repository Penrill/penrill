/** A seeded random source, so a show looks the same every time it plays. */
export interface Rng {
  (): number
  /** A number in [a, b). */
  range(a: number, b: number): number
  /** -1..1 times `a`. */
  spread(a: number): number
  pick<T>(list: readonly T[]): T
  chance(p: number): boolean
}

export function rng(seed = 1): Rng {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  return Object.assign(next, {
    range: (a: number, b: number) => a + next() * (b - a),
    spread: (a: number) => (next() * 2 - 1) * a,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p
  })
}
