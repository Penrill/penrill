// The "perfect circle" easter egg's roundness test. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitRound, isRound } from '../src/board/easter/triggers/circle.ts'

const ring = (n: number, turns: number, wobble = 0, squash = 1): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2 * turns
    const r = 100 * (1 + wobble * Math.sin(i * 1.3))
    return [200 + Math.cos(a) * r, 300 + Math.sin(a) * r * squash]
  })

test('a hand-drawn circle with a slight wobble counts as round', () => {
  const fit = fitRound(ring(90, 1.02, 0.015))
  assert.ok(isRound(fit))
  assert.ok(Math.abs(fit.cx - 200) < 5 && Math.abs(fit.cy - 300) < 5 && Math.abs(fit.r - 100) < 3)
})

test('an oval, a wobbly blob, half a circle and a spiral do not', () => {
  assert.equal(isRound(fitRound(ring(90, 1, 0, 0.8))), false)
  assert.equal(isRound(fitRound(ring(90, 1, 0.08))), false)
  assert.equal(isRound(fitRound(ring(90, 0.5))), false)
  assert.equal(isRound(fitRound(ring(90, 2.2))), false)
})

test('too few points is no circle at all', () => {
  assert.equal(fitRound(ring(8, 1)), null)
})
