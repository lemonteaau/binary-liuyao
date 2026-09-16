import { StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { migrateLegacyRoute } from './lib/routing'

migrateLegacyRoute()

function ClientApp() {
  useLayoutEffect(() => {
    document.documentElement.removeAttribute('data-app-loading')
  }, [])

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClientApp />
  </StrictMode>,
)
