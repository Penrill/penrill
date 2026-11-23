import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Change } from '@penrill/sync/protocol'
import { Editor } from '../src/board/editor.ts'
import { prefsStore } from '../src/board/store.ts'
import { EditorDocument } from '../src/renderer/src/sync/editorDocument.ts'

test('opening a board and receiving remote patterns preserve the local surface', () => {
  const original = prefsStore.getState().background
  const editor = new Editor([])
  const emitted: Change[] = []
  const doc = new EditorDocument(editor, { get: () => 'Board', set: () => {}, subscribe: () => () => {} }, change => emitted.push(change))
  try {
    prefsStore.setState({ background: 'chalk-grid' })
    editor.loadData({ items: [], background: 'lines', camera: editor.camera })
    assert.equal(prefsStore.getState().background, 'chalk-lines')
    doc.attach()
    assert.equal(doc.meta().background, 'lines')
    prefsStore.setState({ background: 'lines' })
    doc.flush()
    assert.equal(emitted.length, 0)
    doc.apply({ items: new Map(), background: 'chalk-slant' })
    assert.equal(prefsStore.getState().background, 'slant')
    doc.flush()
    assert.equal(emitted.length, 0)
    prefsStore.setState({ background: 'chalk-blank' })
    doc.flush()
    assert.deepEqual(emitted[0].ops, [{ op: 'meta', background: 'blank' }])
    doc.apply({ items: new Map(), background: 'grid' })
    assert.equal(prefsStore.getState().background, 'chalk-grid')
  } finally {
    doc.detach()
    editor.dispose()
    prefsStore.setState({ background: original })
  }
})
