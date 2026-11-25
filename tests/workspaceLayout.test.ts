// 4-edge workspace chrome layout, custom presets and migration (src/board/workspaceLayout.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addToolToPreferredDock,
  allPlacedTools,
  cleanCustomPresets,
  cleanEdgeDocks,
  cleanWorkspaceLayout,
  cloneWorkspaceLayout,
  DEFAULT_WORKSPACE_LAYOUT,
  detectWorkspacePreset,
  flyoutAnchor,
  hiddenToolsInDocks,
  isVerticalDock,
  matchWorkspacePreset,
  migrateLegacyLayout,
  moveWholeDock,
  penDirection,
  placeToolInDock,
  removeItemFromDocks,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESETS
} from '../src/board/workspaceLayout.ts'

test('every built-in preset is detected by detectWorkspacePreset', () => {
  for (const id of WORKSPACE_PRESET_IDS) {
    assert.equal(detectWorkspacePreset(WORKSPACE_PRESETS[id]), id)
  }
})

test('tweaking any field or dock switches preset detection to custom', () => {
  assert.equal(DEFAULT_WORKSPACE_LAYOUT.optionsMode, 'popover')
  assert.deepEqual(DEFAULT_WORKSPACE_LAYOUT.docks.left, [])
  assert.deepEqual(DEFAULT_WORKSPACE_LAYOUT.docks.right, [])
  assert.deepEqual(DEFAULT_WORKSPACE_LAYOUT.docks.bottom, [])
  assert.ok(DEFAULT_WORKSPACE_LAYOUT.docks.top.includes('pen1'))
  assert.ok(DEFAULT_WORKSPACE_LAYOUT.docks.top.includes('shapes'))
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, optionsMode: 'strip' }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.split, optionsMode: 'strip' }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, insertLabels: true }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, collapseSelectTools: true }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, showShortcutBadges: false }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, zoomDock: 'top-left' }), 'custom')
  const moved = {
    ...WORKSPACE_PRESETS.default,
    docks: placeToolInDock(WORKSPACE_PRESETS.default.docks, 'undo', 'bottom')
  }
  assert.equal(detectWorkspacePreset(moved), 'custom')
})

test('cleanEdgeDocks deduplicates tools across edges and migrates old instrument buttons', () => {
  const docks = cleanEdgeDocks({
    top: ['pen1', 'ruler', 'compass', 'divider:a'],
    left: ['pen1', 'eraser', 'divider:a', 'unknown'],
    right: [],
    bottom: ['shapes']
  })
  assert.deepEqual(docks.top, ['pen1', 'instruments', 'divider:a'])
  assert.equal(docks.left.includes('pen1'), false)
  assert.equal(docks.left.includes('eraser'), true)
  // Duplicate divider ID on another edge gets renamed so IDs stay globally unique.
  assert.equal(docks.left.includes('divider:a'), false)
  assert.equal(docks.left.some((id) => id.startsWith('divider:')), true)
  assert.deepEqual(docks.bottom, ['shapes'])
})

test('cleanWorkspaceLayout falls back to defaults and migrates v3 shapes automatically', () => {
  assert.deepEqual(cleanWorkspaceLayout(null), DEFAULT_WORKSPACE_LAYOUT)
  assert.deepEqual(cleanWorkspaceLayout('top'), DEFAULT_WORKSPACE_LAYOUT)

  // Options strip can dock to any of the four screen edges.
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    assert.equal(cleanWorkspaceLayout({ ...DEFAULT_WORKSPACE_LAYOUT, optionsDock: edge }).optionsDock, edge)
  }

  // Legacy v3 merged top layout migrates into docks.top.
  const migratedTop = cleanWorkspaceLayout({
    toolsDock: 'top',
    insertDock: 'merged',
    optionsMode: 'popover',
    optionsDock: 'top',
    zoomDock: 'bottom-right',
    insertLabels: false,
    collapseSelectTools: false
  })
  assert.ok(migratedTop.docks.top.includes('pen1'))
  assert.ok(migratedTop.docks.top.includes('shapes'))
  assert.deepEqual(migratedTop.docks.left, [])
  assert.deepEqual(migratedTop.docks.bottom, [])
  assert.equal(migratedTop.optionsMode, 'popover')
  assert.equal(migratedTop.collapseSelectTools, false)

  // Legacy v3 split layout with a custom flat toolbarLayout keeps hidden tools hidden and restores dividers.
  const migratedSplit = migrateLegacyLayout(
    { toolsDock: 'right', insertDock: 'bottom', zoomDock: 'bottom-left' },
    ['select', 'pan', 'pen1', 'pen2', 'shapes', 'graph', 'undo']
  )
  assert.equal(migratedSplit.docks.right.includes('pen1'), true)
  assert.equal(migratedSplit.docks.right.includes('laser'), false)
  assert.equal(migratedSplit.docks.right.some((id) => id.startsWith('divider:')), true)
  assert.deepEqual(migratedSplit.docks.bottom, ['shapes', 'graph'])
  assert.equal(migratedSplit.zoomDock, 'bottom-left')
})

test('placeToolInDock moves tools across edges, reorders within an edge, and creates unique dividers', () => {
  let docks = cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT).docks
  // Move undo from top to empty bottom edge.
  docks = placeToolInDock(docks, 'undo', 'bottom', 0)
  assert.deepEqual(docks.bottom, ['undo'])
  assert.equal(docks.top.includes('undo'), false)

  // Insert a fresh divider on bottom and reorder.
  docks = placeToolInDock(docks, 'divider', 'bottom', 1)
  docks = placeToolInDock(docks, 'redo', 'bottom', 2)
  assert.equal(docks.bottom.length, 3)
  assert.equal(docks.bottom[0], 'undo')
  assert.ok(docks.bottom[1].startsWith('divider:'))
  assert.equal(docks.bottom[2], 'redo')

  // Move redo before undo on the same edge.
  docks = placeToolInDock(docks, 'redo', 'bottom', 0)
  assert.equal(docks.bottom[0], 'redo')
  assert.equal(docks.bottom[1], 'undo')
})

test('removeItemFromDocks hides tools and addToolToPreferredDock restores them', () => {
  let docks = cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT).docks
  assert.equal(hiddenToolsInDocks(docks, true).length, 0)

  docks = removeItemFromDocks(docks, 'laser')
  assert.deepEqual(hiddenToolsInDocks(docks, true), ['laser'])
  assert.equal(allPlacedTools(docks).has('laser'), false)

  docks = addToolToPreferredDock(docks, 'laser')
  assert.equal(hiddenToolsInDocks(docks, true).length, 0)
  assert.equal(docks.top.includes('laser'), true)
})

test('moveWholeDock moves to an empty edge and merges onto an occupied edge with a divider', () => {
  // Move top to empty right.
  const movedRight = moveWholeDock(WORKSPACE_PRESETS.split.docks, 'top', 'right')
  assert.deepEqual(movedRight.top, [])
  assert.ok(movedRight.right.includes('pen1'))

  // Merge left (insert tools) into right.
  const merged = moveWholeDock(movedRight, 'left', 'right')
  assert.deepEqual(merged.left, [])
  assert.ok(merged.right.includes('pen1'))
  assert.ok(merged.right.includes('shapes'))
  // Separating divider exists between redo and text.
  const redoIdx = merged.right.indexOf('redo')
  const textIdx = merged.right.indexOf('text')
  assert.equal(textIdx, redoIdx + 2)
  assert.ok(merged.right[redoIdx + 1].startsWith('divider:'))
})

test('custom presets clean cleanly and match via matchWorkspacePreset', () => {
  const customLayout: typeof DEFAULT_WORKSPACE_LAYOUT = {
    ...cloneWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT),
    docks: placeToolInDock(DEFAULT_WORKSPACE_LAYOUT.docks, 'undo', 'bottom'),
    showShortcutBadges: false
  }
  const presets = cleanCustomPresets([
    { id: 'p1', name: '  Geometry  ', layout: customLayout, updatedAt: 100 },
    { id: 'p1', name: 'Duplicate id ignored', layout: customLayout, updatedAt: 200 },
    { id: 'bad', name: '   ', layout: customLayout }
  ])
  assert.equal(presets.length, 1)
  assert.equal(presets[0].name, 'Geometry')

  const matched = matchWorkspacePreset(customLayout, presets)
  assert.equal(matched.kind, 'custom')
  if (matched.kind === 'custom') assert.equal(matched.preset.id, 'p1')

  const builtin = matchWorkspacePreset(WORKSPACE_PRESETS.split, presets)
  assert.deepEqual(builtin, { kind: 'builtin', id: 'split' })

  const unsaved = matchWorkspacePreset({ ...customLayout, zoomDock: 'top-left' }, presets)
  assert.deepEqual(unsaved, { kind: 'unsaved' })
})

test('dock helpers orient flyouts and pens inward toward the canvas', () => {
  assert.equal(isVerticalDock('left'), true)
  assert.equal(isVerticalDock('right'), true)
  assert.equal(isVerticalDock('top'), false)
  assert.equal(isVerticalDock('bottom'), false)

  assert.equal(flyoutAnchor('top'), 'bottom')
  assert.equal(flyoutAnchor('bottom'), 'top')
  assert.equal(flyoutAnchor('left'), 'right')
  assert.equal(flyoutAnchor('right'), 'left')

  assert.equal(penDirection('top'), 'down')
  assert.equal(penDirection('bottom'), 'up')
  assert.equal(penDirection('left'), 'right')
  assert.equal(penDirection('right'), 'left')
})
