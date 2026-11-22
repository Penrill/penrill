import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '../..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

// The web app, published at https://app.penrill.com/ (see .github/workflows/pages.yml).
//   npm run dev:web                   http://localhost:5174/
//   npm run build:web                 into dist/web
//   npm run build:web -- --mode cloud into dist/cloud, served by Penrill Cloud
export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  base: '/',
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5174,
    fs: { allow: [searchForWorkspaceRoot(root)] }
  },
  build: {
    outDir: resolve(root, mode === 'cloud' ? 'dist/cloud' : 'dist/web'),
    emptyOutDir: true
  }
}))
