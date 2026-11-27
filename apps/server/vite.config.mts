import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

const root = resolve(import.meta.dirname, '../..')
// The server's web pages ship inside Penrill Server (penrill-server, a sibling checkout by default).
const wwwroot = process.env.PENRILL_SERVER_WWWROOT ?? resolve(root, '../penrill-server/src/Web/wwwroot')
// The server to talk to while developing; run it with `dotnet run` in penrill-server.
const server = process.env.PENRILL_SERVER_URL ?? 'http://127.0.0.1:5081'

// Penrill Server's own web pages: setup, sign-in, devices and administration.
//   npm run dev:server-ui     http://localhost:5175 (the API goes to the running server)
//   npm run build:server-ui   into penrill-server's wwwroot, which the server serves and ships
export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    fs: { allow: [searchForWorkspaceRoot(root)] },
    proxy: { '/web': { target: server, changeOrigin: false } }
  },
  build: {
    outDir: wwwroot,
    emptyOutDir: true,
    // Headless UI and motion make one ~600 kB bundle; it loads once from the local network.
    chunkSizeWarningLimit: 800
  }
})
