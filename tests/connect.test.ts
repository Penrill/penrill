// Connect links and server addresses (src/shared/connect.ts). Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseConnectTarget, shortPin } from '../src/shared/connect.ts'

const PIN = 'sha256/DKcfXd3pcBnwWg0mV8ZCdAH/Kcc1XypDV7CU4Yd1ofI='

test('reads the app link a server page offers', () => {
  const link = `penrill://connect?server=${encodeURIComponent('https://192.168.0.91:5081')}&pin=${encodeURIComponent(PIN)}`
  assert.deepEqual(parseConnectTarget(link), { origin: 'https://192.168.0.91:5081', pin: PIN })
})

test('reads the web link from a QR code, with the server in the fragment', () => {
  const link = `https://penrill.com/connect#server=${encodeURIComponent('https://pi.local:5081')}&pin=${encodeURIComponent(PIN)}`
  assert.deepEqual(parseConnectTarget(link), { origin: 'https://pi.local:5081', pin: PIN })
})

test('ignores a malformed pin instead of trusting it', () => {
  assert.deepEqual(parseConnectTarget('penrill://connect?server=https%3A%2F%2Fpi.local%3A5081&pin=sha256%2Fnope'), { origin: 'https://pi.local:5081' })
})

test('a bare host means HTTPS; addresses become origins', () => {
  assert.deepEqual(parseConnectTarget(' raspberrypi.local:5081 '), { origin: 'https://raspberrypi.local:5081' })
  assert.deepEqual(parseConnectTarget('https://board.example.com/some/page'), { origin: 'https://board.example.com' })
  assert.deepEqual(parseConnectTarget('http://127.0.0.1:5081'), { origin: 'http://127.0.0.1:5081' })
})

test('refuses plain HTTP on the network and links without a server', () => {
  assert.throws(() => parseConnectTarget('http://192.168.0.91:5081'))
  assert.throws(() => parseConnectTarget('penrill://connect?pin=x'))
  assert.throws(() => parseConnectTarget('penrill://open?server=https%3A%2F%2Fa.b'))
})

test('short pin matches the server', () => {
  assert.equal(shortPin(PIN), '0CA7-1F5D-DDE9')
})
