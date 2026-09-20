const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function scrollIntoViewIfNeeded(element: HTMLElement | null): boolean {
  if (!element) return false

  const rect = element.getBoundingClientRect()
  if (rect.height <= 0) return false

  const viewport = window.visualViewport
  let top = viewport?.offsetTop ?? 0
  let bottom = top + (viewport?.height ?? window.innerHeight)
  // The CRT screen scrolls independently of the document. Intersect all
  // clipping ancestors so window height alone cannot hide an obscured panel.
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (!/^(auto|scroll|hidden|clip)$/.test(window.getComputedStyle(parent).overflowY)) continue
    const bounds = parent.getBoundingClientRect()
    top = Math.max(top, bounds.top + parent.clientTop)
    bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight)
  }

  const margin = parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0
  top += margin
  if (bottom <= top) return false
  // A tall panel cannot fit in one screen: showing its beginning is enough.
  const visibleHeight = Math.min(rect.height, bottom - top)
  if (rect.top >= top - 1 && rect.top + visibleHeight <= bottom + 1) return false

  element.scrollIntoView({
    behavior: prefersInstantScroll() ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest',
  })
  return true
}

function prefersInstantScroll(): boolean {
  if (document.documentElement.dataset.motion === 'off') return true
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}
