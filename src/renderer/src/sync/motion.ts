// Pacing and smoothing for what others see live: cursors and ink in flight.
// The sender sends at a steady rate whatever the display rate; the receiver eases between what arrives,
// so network jitter shows as a slightly later cursor instead of one that jumps.

/** How often cursors and ink go out: 25 a second. */
export const SEND_INTERVAL_MS = 40

/** How quickly a peer's cursor catches up with where it was last seen: most of the way in about two sends. */
export const GLIDE_MS = 30

export interface Clock {
  now(): number
  later(run: () => void, ms: number): () => void
}

export const realClock: Clock = {
  now: () => performance.now(),
  later: (run, ms) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  }
}

/** Calls flush at most once per interval; an urgent poke flushes at once. */
export class Pacer {
  private last = -Infinity
  private cancel: (() => void) | null = null
  private readonly flush: () => void
  private readonly clock: Clock
  private readonly interval: number

  constructor(flush: () => void, clock: Clock = realClock, interval = SEND_INTERVAL_MS) {
    this.flush = flush
    this.clock = clock
    this.interval = interval
  }

  poke(urgent = false): void {
    const wait = this.last + this.interval - this.clock.now()
    if (urgent || wait <= 0) {
      this.run()
      return
    }
    this.cancel ??= this.clock.later(() => this.run(), wait)
  }

  dispose(): void {
    this.cancel?.()
    this.cancel = null
  }

  private run(): void {
    this.cancel?.()
    this.cancel = null
    this.last = this.clock.now()
    this.flush()
  }
}

/** The share of the remaining way to cover in a frame of dt milliseconds. */
export function glideStep(dt: number, glideMs = GLIDE_MS): number {
  return dt <= 0 ? 0 : 1 - Math.exp(-dt / glideMs)
}

/** How many of the queued points to draw in a frame of dt milliseconds, so the queue empties over one send interval. */
export function releaseCount(queued: number, dt: number, interval = SEND_INTERVAL_MS): number {
  if (queued <= 0) return 0
  return Math.min(queued, Math.max(1, Math.ceil(queued * Math.min(1, dt / interval))))
}
