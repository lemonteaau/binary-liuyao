const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function scrollIntoViewOnMobile(element: HTMLElement | null): boolean {
  if (!element || !isMobileViewport()) return false

  element.scrollIntoView({
    behavior: prefersInstantScroll() ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest',
  })
  return true
}

/**
 * 路由替换内部滚动容器时立即归零，并在 WebKit 完成滚动锚定与布局后再次校正。
 */
export function resetScrollPosition(element: HTMLElement | null): () => void {
  if (!element) return () => undefined

  const reset = () => {
    element.scrollTop = 0
    element.scrollLeft = 0
  }

  reset()
  let secondFrame = 0
  const firstFrame = window.requestAnimationFrame(() => {
    reset()
    secondFrame = window.requestAnimationFrame(reset)
  })

  return () => {
    window.cancelAnimationFrame(firstFrame)
    if (secondFrame) window.cancelAnimationFrame(secondFrame)
  }
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
