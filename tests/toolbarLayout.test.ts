// Saved toolbar layouts (src/board/toolbarLayout.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanToolbarLayout, DEFAULT_TOOLBAR } from '../src/board/toolbarLayout.ts'

test('instruments share one dropdown button', () => {
  assert.ok(DEFAULT_TOOLBAR.some((id) => id === 'instruments'))
  assert.ok(!DEFAULT_TOOLBAR.some((id) => id === 'ruler' || id === 'compass'))
})

test('a layout saved with one button per instrument gets the dropdown in their place', () => {
  const saved = ['pen1', 'ruler', 'square45', 'divider:a', 'protractor', 'compass', 'undo']
  assert.deepEqual(cleanToolbarLayout(saved), ['pen1', 'instruments', 'divider:a', 'undo'])
})

test('unknown ids are dropped', () => {
  assert.deepEqual(cleanToolbarLayout(['pen1', 'nope', 42]), ['pen1'])
  assert.equal(cleanToolbarLayout('pen1'), null)
})

test('a saved layout only decides which tools are shown', async () => {
  const { isToolShown, withToolShown } = await import('../src/board/toolbarLayout.ts')
  assert.equal(isToolShown(null, 'laser'), true)
  const saved = cleanToolbarLayout(['redo', 'divider:a', 'pen1', 'undo'])
  assert.equal(isToolShown(saved, 'pen1'), true)
  assert.equal(isToolShown(saved, 'laser'), false)
  // Showing a tool keeps the others as they were and drops dividers and the old order.
  assert.deepEqual(withToolShown(saved, 'laser', true), ['pen1', 'laser', 'undo', 'redo'])
  // Hiding one from "everything shown" lists the rest; showing it again goes back to null.
  const hidden = withToolShown(null, 'laser', false)
  assert.equal(hidden?.includes('laser'), false)
  assert.equal(hidden?.length, DEFAULT_TOOLBAR.length - 1)
  assert.equal(withToolShown(hidden, 'laser', true), null)
})
