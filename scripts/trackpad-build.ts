import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Plugin } from 'vite'

export function trackpadBuild(): Plugin {
  return {
    name: 'macos-trackpad',
    buildStart() {
      if (process.platform !== 'darwin') return
      const temp = mkdtempSync(join(tmpdir(), 'penrill-trackpad-'))
      const binary = join(temp, 'trackpad.node')
      try {
        execFileSync('xcrun', ['clang++', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0',
          '-std=c++17', '-fobjc-arc', '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'AppKit',
          '-framework', 'CoreGraphics', '-I', resolve(dirname(process.execPath), '../include/node'),
          'native/macos/trackpad.mm', '-o', binary], { stdio: 'inherit' })
        this.emitFile({ type: 'asset', fileName: 'trackpad.node', source: readFileSync(binary) })
        this.addWatchFile('native/macos/trackpad.mm')
      } finally {
        rmSync(temp, { recursive: true, force: true })
      }
    }
  }
}
