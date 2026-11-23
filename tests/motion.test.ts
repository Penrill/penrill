// Pacing and smoothing of live cursors and ink (src/renderer/src/sync/motion.ts).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { glideStep, Pacer, releaseCount, SEND_INTERVAL_MS, type Clock } from '../src/renderer/src/sync/motion.ts'

class FakeClock implements Clock {
  time = 0
  private timers: { at: number; run: () => void }[] = []
  now = () => this.time
  later = (run: () => void, ms: number) => {
    const timer = { at: this.time + ms, run }
    this.timers.push(timer)
    return () => { this.timers = this.timers.filter(t => t !== timer) }
  }
  advance(ms: number): void {
    const end = this.time + ms
    for (;;) {
      const due = this.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers = this.timers.filter(t => t !== due)
      this.time = due.at
      due.run()
    }
    this.time = end
  }
}

test('a fast pointer is sent at a steady rate and its last position is not lost', () => {
  const clock = new FakeClock()
  const sent: number[] = []
  let position = 0
  const pacer = new Pacer(() => sent.push(position), clock)
  for (let i = 1; i <= 100; i++) {
    position = i
    pacer.poke()
    clock.advance(2)
  }
  clock.advance(SEND_INTERVAL_MS)
  assert.ok(sent.length <= 6, `sent ${sent.length} times in 200 ms`)
  assert.equal(sent.at(-1), 100)
})

test('an urgent poke goes out at once', () => {
  const clock = new FakeClock()
  let sent = 0
  const pacer = new Pacer(() => sent++, clock)
  pacer.poke()
  pacer.poke()
  assert.equal(sent, 1)
  pacer.poke(true)
  assert.equal(sent, 2)
  clock.advance(SEND_INTERVAL_MS * 2)
  assert.equal(sent, 2)
})

test('a cursor glides most of the way within two sends and gets there', () => {
  let x = 0
  for (let t = 0; t < SEND_INTERVAL_MS * 2; t += 16) x += (100 - x) * glideStep(16)
  assert.ok(x > 90, `at ${x}`)
  assert.equal(glideStep(0), 0)
  assert.ok(glideStep(1000) > 0.999)
})

test('queued ink is fed in over one send interval and never stalls', () => {
  let queued = 30
  let frames = 0
  while (queued > 0) {
    queued -= releaseCount(queued, 16)
    frames++
  }
  assert.ok(frames >= 2 && frames <= 6, `${frames} frames`)
  assert.equal(releaseCount(5, 0), 1)
  assert.equal(releaseCount(0, 16), 0)
  assert.equal(releaseCount(3, 500), 3)
})
