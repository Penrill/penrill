import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { getImage, loadImage, subscribeImageLoad } from '../src/board/engine/images.ts'

class MockImage {
  onload?: () => void
}

const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
before(() => { Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage }) })
after(() => {
  if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage)
  else Reflect.deleteProperty(globalThis, 'Image')
})

test('image loading notifies each subscribed board until it leaves', (t) => {
  let first = 0
  let second = 0
  const offFirst = subscribeImageLoad(() => { first++ })
  const offSecond = subscribeImageLoad(() => { second++ })
  t.after(offFirst)
  t.after(offSecond)
  const img = getImage('multi-board') as MockImage
  img.onload?.()
  offFirst()
  img.onload?.()
  assert.deepEqual([first, second], [1, 2])
})

test('loading an already failed cached image rejects immediately', async () => {
  const img = getImage('broken-image')
  Object.assign(img, { complete: true, naturalWidth: 0 })
  await assert.rejects(loadImage('broken-image'), /failed to load/)
})
