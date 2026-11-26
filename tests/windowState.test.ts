// Reopening the window on the screen it was closed on (src/main/windowState.ts). Run: npm test
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readWindowState, restoreBounds, writeWindowState } from '../src/main/windowState.ts'

const left = { x: 0, y: 0, width: 1920, height: 1040 }
const right = { x: 1920, y: 0, width: 2560, height: 1400 }

test('a window closed on the second screen reopens there, where it was', () => {
  const saved = { x: 2100, y: 100, width: 1400, height: 900, maximized: false }
  assert.deepEqual(restoreBounds(saved, [left, right]), { x: 2100, y: 100, width: 1400, height: 900 })
})

test('a window hanging off its screen is pulled back in and shrunk to fit', () => {
  const saved = { x: 1500, y: -50, width: 3000, height: 900, maximized: false }
  assert.deepEqual(restoreBounds(saved, [left, right]), { x: 1920, y: 0, width: 2560, height: 900 })
})

test('when that screen is unplugged the window opens at the default spot', () => {
  const saved = { x: 2100, y: 100, width: 1400, height: 900, maximized: true }
  assert.equal(restoreBounds(saved, [left]), null)
})

test('the saved state survives a round trip; a missing or broken file is ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'penrill-win-'))
  try {
    const file = join(dir, 'window.json')
    assert.equal(readWindowState(file), null)
    writeWindowState(file, { x: -1800, y: 20, width: 1200, height: 800, maximized: true })
    assert.deepEqual(readWindowState(file), { x: -1800, y: 20, width: 1200, height: 800, maximized: true })
    writeFileSync(file, '{"x":1')
    assert.equal(readWindowState(file), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
