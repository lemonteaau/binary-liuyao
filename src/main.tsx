import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
