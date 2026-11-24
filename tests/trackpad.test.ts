import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Editor } from '../src/board/editor.ts'
import { TrackpadInk, trackpadFrame } from '../src/board/modules/trackpadInk.ts'

test('trackpad contacts map absolutely to the frame and lift commits one undoable stroke', () => {
  const editor = new Editor([])
  const ink = new TrackpadInk(editor)
  const frame = trackpadFrame({ width: 1000, height: 800 }, 2)
  assert.deepEqual(frame, { width: 640, height: 320, left: 180, top: 240 })
  editor.setCamera({ x: 10, y: 20, zoom: 2 })
  ink.point('begin', 0, 0, frame)
  ink.point('move', 0.5, 0.5, frame)
  ink.point('end', 1, 1, frame)
  const [stroke] = editor.scene.getItems()
  assert.equal(stroke.type, 'stroke')
  assert.deepEqual(stroke.points, [[100, 140, 0.5], [260, 220, 0.5], [420, 300, 0.5]])
  ink.point('begin', 0.2, 0.5, frame)
  ink.cancel()
  ink.point('end', 0.5, 0.5, frame)
  assert.equal(editor.trackpadInk, null)
  assert.equal(editor.scene.getItems().length, 1)
  editor.scene.undo()
  assert.equal(editor.scene.getItems().length, 0)
  editor.dispose()
})

test('repeated trackpad pans move the board at screen scale and leave no connecting ink', () => {
  const editor = new Editor([])
  const ink = new TrackpadInk(editor)
  const frame = trackpadFrame({ width: 1000, height: 800 }, 2)
  editor.setCamera({ x: 0, y: 0, zoom: 2 })
  ink.point('begin', 0, 0, frame)
  ink.pan(1, 0)
  ink.pan(1, 0)
  ink.point('end', 1, 1, frame)
  assert.deepEqual(editor.camera, { x: -32, y: 0, zoom: 2 })
  ink.point('begin', 0, 0, frame)
  ink.point('end', 0, 0, frame)
  const positions = editor.scene.getItems().map(item => item.type === 'stroke' && item.points)
  assert.deepEqual(positions, [[[90, 120, 0.5]], [[58, 120, 0.5]]])
  editor.dispose()
})
