const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** 设置中的“动画”与系统“减少动态效果”均允许时才播放动画。 */
export function motionEnabled(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.motion === 'off') return false
  return typeof window.matchMedia !== 'function'
    || !window.matchMedia(REDUCED_MOTION_QUERY).matches
}
