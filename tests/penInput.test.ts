import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inkSamples, penInContact, penWidth } from '../src/board/tools/penInput.ts'

function pen(timeStamp: number, pressure: number, buttons: number): PointerEvent {
  return { pointerType: 'pen', timeStamp, pressure, buttons } as PointerEvent
}

test('a new stroke ignores batched positions from before contact and from hover', () => {
  const before = pen(1, 0.5, 1)
  const hover = pen(3, 0, 0)
  const light = pen(4, 0.05, 0)
  const tip = pen(5, 0, 1)
  const move = { ...tip, getCoalescedEvents: () => [before, hover, light, tip] }
  assert.deepEqual(inkSamples(move, 2), [light, tip])
  assert.equal(penInContact(hover), false)
  assert.equal(penInContact(light), true)
})

test('ink uses the dispatched contact when coalesced events are unavailable or empty', () => {
  const move = pen(2, 0.5, 1)
  assert.deepEqual(inkSamples(move, 1), [move])
  const empty = { ...move, getCoalescedEvents: () => [] }
  assert.deepEqual(inkSamples(empty, 1), [empty])
})

test('tilt broadens light ink equally with altitude or tilt axes', () => {
  const vertical = { pressure: 0.3, altitudeAngle: Math.PI / 2, tiltX: 0, tiltY: 0 }
  assert.equal(penWidth(vertical), 0.3)
  const angled = penWidth({ ...vertical, altitudeAngle: Math.PI / 4 })
  assert.ok(angled > 0.3 && angled < 1)
  assert.ok(Math.abs(penWidth({ ...vertical, tiltX: 45 }) - angled) < 1e-10)
})
