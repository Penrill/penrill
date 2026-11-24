// Saved toolbar layouts, ordering, dividers and projection (src/board/toolbarLayout.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addToolbarDivider,
  cleanToolbarLayout,
  DEFAULT_TOOLBAR,
  DEFAULT_TOOLBAR_WITH_DIVIDERS,
  insertDefaultDividers,
  isToolShown,
  moveToolbarItem,
  projectBarItems,
  removeToolbarItem,
  sanitizeDividers,
  withToolShown
} from '../src/board/toolbarLayout.ts'

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

test('withToolShown preserves custom order and dividers and returns null when restored to default', () => {
  assert.equal(isToolShown(null, 'laser'), true)
  const saved = cleanToolbarLayout(['redo', 'divider:a', 'pen1', 'undo'])
  assert.equal(isToolShown(saved, 'pen1'), true)
  assert.equal(isToolShown(saved, 'laser'), false)

  // Showing a hidden tool preserves the custom order and dividers already in the list.
  const withLaser = withToolShown(saved, 'laser', true)
  assert.ok(withLaser)
  assert.equal(withLaser.indexOf('redo'), 0)
  assert.equal(withLaser.includes('divider:a'), true)
  assert.ok(withLaser.indexOf('pen1') < withLaser.indexOf('laser'))
  assert.ok(withLaser.indexOf('laser') < withLaser.indexOf('undo'))

  // Hiding and showing a tool from the default layout returns cleanly to null.
  const hidden = withToolShown(null, 'laser', false)
  assert.ok(hidden)
  assert.equal(hidden.includes('laser'), false)
  assert.equal(withToolShown(hidden, 'laser', true), null)

  // Same for an item inside a multi-item group.
  const hiddenPen = withToolShown(null, 'pen2', false)
  assert.ok(hiddenPen)
  assert.equal(hiddenPen.includes('pen2'), false)
  assert.equal(withToolShown(hiddenPen, 'pen2', true), null)
})

test('projectBarItems derives split and merged bars from one unified list', () => {
  const drawing = projectBarItems(null, 'drawing', { collapseSelect: true })
  assert.deepEqual(
    drawing.map((i) => (i.kind === 'divider' ? '|' : i.kind === 'selectGroup' ? `select:${i.modes.join(',')}` : i.id)),
    ['select:select,brushSelect,move', 'pan', '|', 'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', '|', 'laser', '|', 'undo', 'redo']
  )

  const insert = projectBarItems(null, 'insert', { templates: true })
  assert.deepEqual(
    insert.map((i) => (i.kind === 'divider' ? '|' : i.kind === 'selectGroup' ? 'select' : i.id)),
    ['text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates']
  )

  const insertNoTpl = projectBarItems(null, 'insert', { templates: false })
  assert.equal(insertNoTpl.some((i) => i.kind === 'tool' && i.id === 'templates'), false)

  const merged = projectBarItems(null, 'merged', { templates: true, collapseSelect: false })
  assert.deepEqual(
    merged.map((i) => (i.kind === 'divider' ? '|' : i.kind === 'selectGroup' ? 'select' : i.id)),
    [
      'select', 'brushSelect', 'move', 'pan', '|',
      'pen1', 'pen2', 'pen3', 'highlighter', 'eraser', '|',
      'laser', '|',
      'text', 'formula', 'shapes', 'graph', 'instruments', 'image', 'templates', '|',
      'undo', 'redo'
    ]
  )
})

test('reordering and dividers work in both split and merged views', () => {
  // Move eraser before pen1.
  const eraserIdx = DEFAULT_TOOLBAR_WITH_DIVIDERS.indexOf('eraser')
  const pen1Idx = DEFAULT_TOOLBAR_WITH_DIVIDERS.indexOf('pen1')
  const reordered = moveToolbarItem(null, eraserIdx, pen1Idx)
  assert.ok(reordered)
  const drawing = projectBarItems(reordered, 'drawing', { collapseSelect: true })
  const ids = drawing.filter((i) => i.kind === 'tool').map((i) => i.id)
  assert.ok(ids.indexOf('eraser') < ids.indexOf('pen1'))

  // Moving back restores null (default).
  const restored = moveToolbarItem(reordered, pen1Idx, eraserIdx)
  assert.equal(restored, null)

  // Add a custom divider between shapes and graph, visible in insert bar.
  const graphIdx = DEFAULT_TOOLBAR_WITH_DIVIDERS.indexOf('graph')
  const withDiv = addToolbarDivider(null, graphIdx, 'custom1')
  const insert = projectBarItems(withDiv, 'insert', { templates: true })
  assert.deepEqual(
    insert.map((i) => (i.kind === 'divider' ? '|' : i.kind === 'tool' ? i.id : 'select')),
    ['text', 'formula', 'shapes', '|', 'graph', 'instruments', 'image', 'templates']
  )

  // Removing that divider restores null.
  assert.equal(removeToolbarItem(withDiv, 'divider:custom1'), null)
})

test('sanitizeDividers removes leading, trailing and adjacent dividers', () => {
  assert.deepEqual(
    sanitizeDividers(['divider:1', 'pen1', 'divider:2', 'divider:3', 'eraser', 'divider:4']),
    ['pen1', 'divider:2', 'eraser']
  )
})

test('insertDefaultDividers migrates flat v0.13 lists without losing hidden tools', () => {
  const flat = ['select', 'brushSelect', 'move', 'pan', 'pen1', 'pen2', 'text', 'shapes', 'undo', 'redo'] as const
  const migrated = insertDefaultDividers(flat)
  const drawing = projectBarItems(migrated, 'drawing', { collapseSelect: true })
  assert.deepEqual(
    drawing.map((i) => (i.kind === 'divider' ? '|' : i.kind === 'selectGroup' ? 'selectGroup' : i.id)),
    ['selectGroup', 'pan', '|', 'pen1', 'pen2', '|', 'undo', 'redo']
  )
})
