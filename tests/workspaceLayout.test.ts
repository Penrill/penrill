// Workspace chrome layout presets and validation (src/board/workspaceLayout.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanWorkspaceLayout,
  DEFAULT_WORKSPACE_LAYOUT,
  detectWorkspacePreset,
  flyoutAnchor,
  isVerticalDock,
  penDirection,
  WORKSPACE_PRESET_IDS,
  WORKSPACE_PRESETS
} from '../src/board/workspaceLayout.ts'

test('every built-in preset is detected by detectWorkspacePreset', () => {
  for (const id of WORKSPACE_PRESET_IDS) {
    assert.equal(detectWorkspacePreset(WORKSPACE_PRESETS[id]), id)
  }
})

test('tweaking any field switches preset detection to custom', () => {
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.top, optionsMode: 'strip' }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, toolsDock: 'right' }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, insertLabels: false }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, collapseSelectTools: false }), 'custom')
  assert.equal(detectWorkspacePreset({ ...WORKSPACE_PRESETS.default, zoomDock: 'top-right' }), 'custom')
})

test('cleanWorkspaceLayout falls back to defaults for missing or invalid values', () => {
  assert.deepEqual(cleanWorkspaceLayout(null), DEFAULT_WORKSPACE_LAYOUT)
  assert.deepEqual(cleanWorkspaceLayout('top'), DEFAULT_WORKSPACE_LAYOUT)
  assert.deepEqual(
    cleanWorkspaceLayout({
      toolsDock: 'diagonal',
      insertDock: 'merged',
      optionsMode: 'popover',
      optionsDock: 'sideways',
      zoomDock: 'bottom-left',
      insertLabels: 'yes',
      collapseSelectTools: false
    }),
    {
      toolsDock: 'left',
      insertDock: 'merged',
      optionsMode: 'popover',
      optionsDock: 'top',
      zoomDock: 'bottom-left',
      insertLabels: true,
      collapseSelectTools: false
    }
  )
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
