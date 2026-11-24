// Keeping floating cards on screen (ui/dock.ts fitBox). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'

// dock.ts reads the DOM only inside functions these tests don't call.
import { fitBox, fitPopoverForEdge } from '../src/board/ui/dock.ts'

const area = { w: 1000, h: 700, top: 84 }
const inside = (f: { left: number; top: number }, w: number, h: number): void => {
  assert.ok(f.left >= 8 && f.left + w <= area.w - 8, `x ${f.left}`)
  assert.ok(f.top >= 8 && f.top + h <= area.h - 8, `y ${f.top}`)
}

test('goes above the anchor, centred, when there is room', () => {
  const f = fitBox({ left: 400, right: 600, top: 300, bottom: 400 }, 200, 40, area)
  assert.equal(f.side, 'above')
  assert.equal(f.left, 400)
  assert.equal(f.top, 300 - 8 - 40)
})

test('flips below when the anchor is under the top toolbar', () => {
  const f = fitBox({ left: 400, right: 600, top: 90, bottom: 200 }, 200, 40, area)
  assert.equal(f.side, 'below')
  assert.equal(f.top, 208)
})

test('is pushed back inside at the left and right edges', () => {
  for (const x of [-300, 0, 990, 1500]) inside(fitBox({ left: x, right: x + 20, top: 300, bottom: 320 }, 260, 40, area), 260, 40)
})

test('an anchor larger than the window keeps the box in the visible area', () => {
  const f = fitBox({ left: -500, right: 2500, top: -900, bottom: 3000 }, 300, 40, area)
  inside(f, 300, 40)
  assert.equal(f.top, 84)
})

test('an anchor entirely off screen still gets a visible box', () => {
  inside(fitBox({ left: 200, right: 300, top: -400, bottom: -300 }, 200, 40, area), 200, 40)
  inside(fitBox({ left: 200, right: 300, top: 1200, bottom: 1300 }, 200, 40, area), 200, 40)
})

test('a tall box takes the roomier side and reports how much fits', () => {
  const f = fitBox({ left: 400, right: 440, top: 500, bottom: 540 }, 240, 600, area)
  assert.equal(f.side, 'above')
  assert.ok(f.maxHeight <= area.h - 8 - 84)
  inside(f, 240, Math.min(600, f.maxHeight))
})

test('prefers below when asked and it fits', () => {
  const f = fitBox({ left: 400, right: 440, top: 300, bottom: 340 }, 240, 200, area, 'below')
  assert.equal(f.side, 'below')
  assert.equal(f.top, 348)
})

test('fitBox keeps clear of both left and right docked rails when room allows', () => {
  const withRails = { w: 1000, h: 700, top: 84, left: 80, right: 920 }
  const leftClamped = fitBox({ left: 40, right: 80, top: 300, bottom: 340 }, 200, 40, withRails)
  assert.equal(leftClamped.left, 80)
  const rightClamped = fitBox({ left: 900, right: 940, top: 300, bottom: 340 }, 200, 40, withRails)
  assert.equal(rightClamped.left, 920 - 8 - 200)
})

test('fitPopoverForEdge opens inward from each screen edge and stays inside viewport', () => {
  const vp = { w: 1000, h: 700 }
  const fromTop = fitPopoverForEdge({ left: 450, right: 490, top: 12, bottom: 52 }, 260, 220, 'top', vp)
  assert.equal(fromTop.top, 60)

  const fromBottom = fitPopoverForEdge({ left: 450, right: 490, top: 648, bottom: 688 }, 260, 220, 'bottom', vp)
  assert.equal(fromBottom.top, 648 - 8 - 220)

  const fromLeft = fitPopoverForEdge({ left: 12, right: 60, top: 300, bottom: 340 }, 260, 220, 'left', vp)
  assert.equal(fromLeft.left, 68)

  const fromRight = fitPopoverForEdge({ left: 940, right: 988, top: 300, bottom: 340 }, 260, 220, 'right', vp)
  assert.equal(fromRight.left, 940 - 8 - 260)
})
