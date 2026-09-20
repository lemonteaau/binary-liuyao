const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Legacy mobile-only helper kept for callers outside the generator flow.
 * New generator interactions use scrollIntoViewIfNeeded, which handles
 * clipping containers and landscape tablets.
 */
export function scrollIntoViewOnMobile(element: HTMLElement | null): boolean {
  if (!element || !isMobileViewport()) return false

  element.scrollIntoView({
    behavior: prefersInstantScroll() ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest',
  })
  return true
}

function isMobileViewport(): boolean {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
  }
  return window.innerWidth <= 767
}

function prefersInstantScroll(): boolean {
  if (document.documentElement.dataset.motion === 'off') return true
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}
