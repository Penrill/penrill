// Boards someone else owns: whether they may be copied, and what happens to them when sharing ends
// (src/renderer/src/sync/links.ts). Run: npm test
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    }
  }
})
const { canCopy, copyOutcome, markShared, linkFor, saveLink } = await import('../src/renderer/src/sync/links.ts')

const link = (fields: Record<string, unknown> = {}) =>
  ({ origin: 'https://cloud.example', user: 'bob', remote: 'r1', seq: 1, published: true, ...fields })

beforeEach(() => store.clear())

test('boards of this device and of this account can always be copied', () => {
  assert.equal(canCopy('nowhere'), true)
  assert.equal(canCopy(null), true)
  saveLink('mine', link({ owner: 'bob' }))
  assert.equal(canCopy('mine'), true)
  saveLink('unknown', link())
  assert.equal(canCopy('unknown'), true)
})

test('a board someone else shared can be copied only when they allow it', () => {
  saveLink('theirs', link({ owner: 'ann' }))
  assert.equal(canCopy('theirs'), false)
  saveLink('theirs', link({ owner: 'ann', copying: false }))
  assert.equal(canCopy('theirs'), false)
  saveLink('theirs', link({ owner: 'ann', copying: true }))
  assert.equal(canCopy('theirs'), true)
})

test('a board someone else shared leaves when they stop sharing it or delete it for everyone', () => {
  const theirs = link({ owner: 'ann' })
  assert.equal(copyOutcome(theirs, 'denied'), 'drop')
  assert.equal(copyOutcome(theirs, 'removed'), 'drop')
  assert.equal(copyOutcome(theirs, 'gone'), 'forget')
  assert.equal(copyOutcome(theirs, 'here'), 'keep')
})

test('signing out, and boards of this account, never take a board off the device', () => {
  assert.equal(copyOutcome(link({ owner: 'ann' }), 'signed-out'), 'denied')
  const mine = link({ owner: 'bob' })
  assert.equal(copyOutcome(mine, 'denied'), 'denied')
  assert.equal(copyOutcome(mine, 'removed'), 'forget')
  // An owner not known yet: better to keep a board than to remove one by mistake.
  assert.equal(copyOutcome(link(), 'denied'), 'denied')
})

test('sharing a board marks every copy of its link on this device', () => {
  saveLink('a', link({ owner: 'bob' }))
  saveLink('b', link({ owner: 'bob', remote: 'other' }))
  markShared(link())
  assert.equal(linkFor('a')?.shared, true)
  assert.equal(linkFor('b')?.shared, undefined)
})
