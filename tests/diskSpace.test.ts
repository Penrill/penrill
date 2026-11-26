// Free space check before a Windows update installs. Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPARE_BYTES, spaceShortfall } from '../src/main/diskSpace.ts'

const MB = 1024 * 1024
const free = (table: Record<string, number>) => (drive: string): number => table[drive] ?? 0

test('enough space on one drive: no shortfall', () => {
  const need = { installDrive: 'C:\\', tempDrive: 'C:\\', installedBytes: 350 * MB, installerBytes: 130 * MB }
  assert.equal(spaceShortfall(need, free({ 'C:\\': 2000 * MB })), null)
})

test('app and temp on one drive add up', () => {
  const need = { installDrive: 'C:\\', tempDrive: 'c:\\', installedBytes: 350 * MB, installerBytes: 130 * MB }
  const short = spaceShortfall(need, free({ 'C:\\': 500 * MB }))
  assert.deepEqual(short, { drive: 'C:\\', missingBytes: 480 * MB + SPARE_BYTES - 500 * MB })
})

test('a full temp drive is reported even when the app drive has room', () => {
  const need = { installDrive: 'D:\\', tempDrive: 'C:\\', installedBytes: 350 * MB, installerBytes: 130 * MB }
  const short = spaceShortfall(need, free({ 'C:\\': 100 * MB, 'D:\\': 100000 * MB }))
  assert.equal(short?.drive, 'C:\\')
  assert.equal(short?.missingBytes, 130 * MB + SPARE_BYTES - 100 * MB)
})

test('the app drive on its own needs only the app', () => {
  const need = { installDrive: 'D:\\', tempDrive: 'C:\\', installedBytes: 350 * MB, installerBytes: 130 * MB }
  assert.equal(spaceShortfall(need, free({ 'C:\\': 1000 * MB, 'D:\\': 600 * MB })), null)
})
