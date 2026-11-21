// Run by build.mjs inside Electron: `electron render.cjs jobs.json`. Rasterizes with Chromium so the
// PNGs look exactly like the SVG/HTML in a browser.
//   { svg, out, size }           SVG markup -> size x size PNG, transparent background
//   { html, out, width, height } HTML file  -> width x height screenshot
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')

const fail = (e) => {
  console.error(String((e && e.stack) || e))
  app.exit(1)
}
process.on('unhandledRejection', fail)
setTimeout(() => fail('render timed out'), 120000)

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  for (const job of jobs) {
    const png = job.svg ? await rasterize(job) : await screenshot(job)
    for (const out of [].concat(job.out)) fs.writeFileSync(out, png)
  }
  app.exit(0)
})

let canvasWindow
async function rasterize({ svg, size }) {
  if (!canvasWindow) {
    canvasWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await canvasWindow.loadURL('data:text/html,<canvas></canvas>')
  }
  const win = canvasWindow
  const url = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'
    await img.decode()
    const c = document.querySelector('canvas')
    c.width = c.height = ${size}
    const g = c.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, ${size}, ${size})
    return c.toDataURL('image/png')
  })()`)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function screenshot({ html, width, height }) {
  const win = new BrowserWindow({
    show: false, width, height, useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: 1 },
  })
  await win.loadFile(html)
  await win.webContents.executeJavaScript(
    'Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))])',
  )
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width, height })
  return image.resize({ width, height }).toPNG()
}
