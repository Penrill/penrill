import { trackpadBuild } from './scripts/trackpad-build'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [trackpadBuild()] },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()]
  }
})
