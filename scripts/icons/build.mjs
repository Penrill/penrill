// Regenerates every logo file from scripts/icons/logo.mjs.
//   npm run icons                     Mist palette
//   npm run icons -- --palette blue   another palette from PALETTES
// Writes build/icon.svg and the PNGs below, then rasterizes them in Electron (render.cjs).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import electron from 'electron'
import { PALETTES, logoSvg } from './logo.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const at = (p) => join(root, p)

const flag = process.argv.indexOf('--palette')
const name = flag > 0 ? process.argv[flag + 1] : 'mist'
const palette = PALETTES[name]
if (!palette) {
  console.error(`Unknown palette "${name}". Known: ${Object.keys(PALETTES).join(', ')}`)
  process.exit(1)
}

const icon = logoSvg(palette)
const bleed = logoSvg(palette, { bleed: true })
writeFileSync(at('build/icon.svg'), icon)

const tmp = mkdtempSync(join(tmpdir(), 'penrill-icons-'))
const base = `<base href="${pathToFileURL(root).href}">`
const preview = readFileSync(at('scripts/icons/social-preview.html'), 'utf8')
  .replace('<head>', `<head>\n${base}`)
  .replace(/\{\{(\w+)\}\}/g, (_, key) => palette[key])
writeFileSync(join(tmp, 'social-preview.html'), preview)

const jobs = [
  // electron-builder makes the .icns / .ico / Linux sizes from this one.
  { svg: icon, size: 1024, out: at('build/icon.png') },
  { svg: icon, size: 512, out: at('site/public/img/icon.png') },
  { svg: icon, size: 192, out: at('apps/web/public/icon-192.png') },
  { svg: icon, size: 512, out: at('apps/web/public/icon-512.png') },
  { svg: bleed, size: 180, out: [at('site/public/img/apple-touch-icon.png'), at('apps/web/public/apple-touch-icon.png')] },
  {
    html: join(tmp, 'social-preview.html'), width: 1280, height: 640,
    out: [at('site/public/img/social-preview.png'), at('docs/images/social-preview.png')],
  },
]
writeFileSync(join(tmp, 'jobs.json'), JSON.stringify(jobs))

const run = spawnSync(electron, [at('scripts/icons/render.cjs'), join(tmp, 'jobs.json')], { stdio: 'inherit' })
rmSync(tmp, { recursive: true, force: true })
if (run.status !== 0) process.exit(run.status ?? 1)
console.log(`Logo files written with the "${name}" palette.`)
