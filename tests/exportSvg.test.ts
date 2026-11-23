// The SVG (and so the PDF) export draws the paper pattern as vector shapes. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { patternSvg } from '../src/board/engine/paperSvg.ts'

const box = { minX: -24, minY: -24, maxX: 664, maxY: 424 }

test('every paper pattern is plain vector paths, never an SVG <pattern> (PDF would blur it)', () => {
  for (const bg of ['dots', 'grid', 'lines', 'math', 'hand', 'slant', 'chalk-grid'] as const) {
    const svg = patternSvg(bg, box)
    assert.ok(!svg.includes('<pattern'), bg)
    assert.ok(svg.startsWith('<path d="M'), bg)
  }
  assert.equal(patternSvg('blank', box), '')
})

test('dots sit on the same world points as on the board, one dot per cell', () => {
  const svg = patternSvg('dots', box)
  const dots = svg.match(/a1\.1 1\.1 0 1 0 2\.2 0/g) ?? []
  // x: -24, 0, …, 648 (29 dots); y: -24, 0, …, 408 (19 dots).
  assert.equal(dots.length, 29 * 19)
  assert.ok(svg.includes('M-25.1 -24a1.1'))
})

test('grid lines are 1 unit wide on the cell edges, as on the board', () => {
  const svg = patternSvg('grid', box)
  assert.ok(svg.includes('M-24 0.5H664'))
  assert.ok(svg.includes('M0.5 -24V424'))
})

test('slanted paper keeps handwriting rows and adds sparse guides on either surface', () => {
  for (const prefix of ['', 'chalk-'] as const) {
    const rows = patternSvg(`${prefix}hand`, box)
    const slant = patternSvg(`${prefix}slant`, box)
    assert.ok(slant.startsWith(rows))
    assert.equal(slant.slice(rows.length).match(/L/g)?.length, 6)
  }
})
