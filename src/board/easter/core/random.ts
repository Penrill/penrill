/** A repeatable "random" number in [0, 1), so particle shows look the same every time. */
export function rnd(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** A list of `n` things made by `f` (usually particles with their inline style). */
export function particles<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i))
}
