/** Old hash routes are converted locally; reading data must never become a query. */
export function legacyRouteDestination(hash: string): string | null {
  if (!hash.startsWith('#/')) return null
  const route = hash.slice(1)
  // A fragment is untrusted input. Never create a protocol-relative destination.
  if (route.startsWith('//') || route.includes('\\')) return '/'
  const url = new URL(route, 'https://legacy.invalid')
  let pathname = url.pathname.replace(/\/+$/, '') || '/'
  try {
    const decoded = decodeURIComponent(pathname).toLowerCase()
    if (/^\/(?:result|settings|about|ai-guide)?$/.test(decoded)) pathname = decoded
  } catch {
    // Preserve malformed/unknown paths for the existing generator fallback.
  }
  // Parse the pathname before moving parameters: encoded paths and dot segments
  // may still identify a result page and must retain the same privacy boundary.
  if (pathname === '/result') return `/result${url.search ? `#${url.search.slice(1)}` : ''}`
  return `${pathname}${url.search}${url.hash}`
}

/** Run before React on an initial legacy-link visit. */
export function migrateLegacyRoute(): void {
  const destination = legacyRouteDestination(window.location.hash)
  if (destination !== null) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    window.history.replaceState(window.history.state, '', `${base}${destination}`)
  }
}
