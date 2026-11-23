import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowsFingerInk, shouldOfferPencilChoice } from "../src/board/modules/iPadInput.ts"
import { inkSamples, penInContact, stylusStrategy } from '../src/board/tools/penInput.ts'

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
  const { pressure: penWidth, preference } = stylusStrategy({ platform: 'Win32', userAgent: '', maxTouchPoints: 10 })
  assert.equal(preference, 'tabletPressure')
  const vertical = { pressure: 0.3, altitudeAngle: Math.PI / 2, tiltX: 0, tiltY: 0 }
  assert.equal(penWidth(vertical), 0.3)
  const angled = penWidth({ ...vertical, altitudeAngle: Math.PI / 4 })
  assert.ok(angled > 0.3 && angled < 1)
  assert.ok(Math.abs(penWidth({ ...vertical, tiltX: 45 }) - angled) < 1e-10)
})

test('iPad pen input preserves the full measured pressure range regardless of tilt', () => {
  for (const platform of [
    { platform: 'iPad', userAgent: 'iPad', maxTouchPoints: 5 },
    { platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 5 }
  ]) {
    const strategy = stylusStrategy(platform)
    assert.equal(strategy.preference, 'pencilPressure')
    for (const pressure of [0, 0.01, 0.5, 1]) {
      assert.equal(strategy.pressure({ pressure, altitudeAngle: 0.1, tiltX: 80, tiltY: 12 }), pressure)
    }
  }
  assert.equal(stylusStrategy({ platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 0 }).preference, 'tabletPressure')
})

test('finger ink is available on a new iPad and only pen contact offers the choice', () => {
  assert.ok(allowsFingerInk(true, null))
  assert.ok(shouldOfferPencilChoice(true, null, 'pen'))
  for (const pointer of ['mouse', 'touch']) assert.equal(shouldOfferPencilChoice(true, null, pointer), false)
  assert.equal(shouldOfferPencilChoice(false, null, 'pen'), false)
  assert.equal(allowsFingerInk(false, null), false)
})

test('both saved iPad modes suppress the prompt and route finger ink independently of other platforms', () => {
  for (const mode of ['draw', 'pan'] as const) {
    assert.equal(shouldOfferPencilChoice(true, mode, 'pen'), false)
    assert.equal(allowsFingerInk(true, mode), mode === 'draw')
    assert.equal(allowsFingerInk(false, mode), false)
  }
})
