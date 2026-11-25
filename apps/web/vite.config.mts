import tailwindcss from '@tailwindcss/vite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '../..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

// The web app, published at https://app.penrill.com/ (see .github/workflows/pages.yml).
//   npm run dev:web   http://localhost:5174/
//   npm run build:web into dist/web
const build = randomUUID()
const buildInfo = JSON.stringify({ version, build })

export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [react(), tailwindcss(), {
    name: 'penrill-web-build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'web-build.json', source: buildInfo })
    },
    configureServer(server) {
      server.middlewares.use('/web-build.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(buildInfo)
      })
    }
  }],
  define: { __WEB_BUILD__: JSON.stringify(build), __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5174,
    fs: { allow: [searchForWorkspaceRoot(root)] }
  },
  build: {
    outDir: resolve(root, 'dist/web'),
    emptyOutDir: true
  }
})
