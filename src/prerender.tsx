import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { Shell } from './App'
import { ReadingProvider } from './store/reading'
import { SettingsProvider } from './store/settings'

/** Reuse the actual public pages, without executing effects or accessing user data. */
export function renderPublicPage(pathname: string): string {
  return renderToStaticMarkup(
    <SettingsProvider>
      <ReadingProvider>
        <MemoryRouter basename={import.meta.env.BASE_URL} initialEntries={[`${import.meta.env.BASE_URL.replace(/\/$/, '')}${pathname}`]}>
          <Shell />
        </MemoryRouter>
      </ReadingProvider>
    </SettingsProvider>,
  )
}
