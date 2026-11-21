import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { whenSignedOut } from './api'
import { App } from './App'
import { useLang } from './i18n'
import { loadSession } from './session'
import './server.css'

// Catalyst's dark variant follows data-theme; these pages follow the system.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (): void => {
  document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark.matches ? 'dark' : 'light'
}
applyTheme()
dark.addEventListener('change', applyTheme)
document.documentElement.lang = useLang.getState().lang

// A session that ran out on the server: ask who is here again, and the app shows sign-in.
whenSignedOut(() => void loadSession())
void loadSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
