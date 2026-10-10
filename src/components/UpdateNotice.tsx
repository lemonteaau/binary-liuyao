import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { trackEvent } from '@/lib/analytics'
import { APP_BUILD, APP_VERSION, fetchLatestVersion, releaseOf } from '@/lib/app-version'
import { IS_DEV_SERVER } from '@/lib/dev-server'

/** 页面可见期间的例行检查间隔 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000
/** 两次检查之间的最短间隔，避免频繁切换标签页时反复请求 */
export const UPDATE_CHECK_MIN_GAP_MS = 60_000

/**
 * 长期不关的标签页会一直运行旧版本，部署后旧的懒加载分块还会 404。
 * 回到标签页或定时比对线上版本号，a.b 变了才提示刷新，c 位的小更新不打扰；
 * 分块加载失败说明功能已经受影响，只要线上换过构建就立即提示。
 */
export function useAppUpdate(): { available: boolean; dismiss: () => void } {
  const [available, setAvailable] = useState(false)
  const latestRelease = useRef<string | null>(null)
  const dismissedRelease = useRef<string | null>(null)

  useEffect(() => {
    if (IS_DEV_SERVER) return

    // 刚加载的页面就是最新版本，从现在开始计时
    let lastCheckedAt = Date.now()
    let controller: AbortController | null = null

    async function check(urgent: boolean) {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!urgent && now - lastCheckedAt < UPDATE_CHECK_MIN_GAP_MS) return
      lastCheckedAt = now
      controller?.abort()
      controller = new AbortController()
      const latest = await fetchLatestVersion(controller.signal)
      if (!latest) return
      const release = releaseOf(latest.version)
      latestRelease.current = release
      if (urgent) {
        if (latest.build !== APP_BUILD) setAvailable(true)
      } else if (release !== releaseOf(APP_VERSION) && release !== dismissedRelease.current) {
        setAvailable(true)
      }
    }

    const checkWhenDue = () => void check(false)
    const checkNow = () => void check(true)

    document.addEventListener('visibilitychange', checkWhenDue)
    // 从往返缓存恢复的页面不会触发 visibilitychange
    window.addEventListener('pageshow', checkWhenDue)
    window.addEventListener('vite:preloadError', checkNow)
    const timer = window.setInterval(checkWhenDue, UPDATE_CHECK_INTERVAL_MS)

    return () => {
      controller?.abort()
      document.removeEventListener('visibilitychange', checkWhenDue)
      window.removeEventListener('pageshow', checkWhenDue)
      window.removeEventListener('vite:preloadError', checkNow)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (available) trackEvent('展示新版本提示')
  }, [available])

  // 只忽略这一个 a.b 版本；之后 a.b 再变会重新提示
  const dismiss = useCallback(() => {
    dismissedRelease.current = latestRelease.current
    setAvailable(false)
  }, [])

  return { available, dismiss }
}

export function UpdateNotice({ onDismiss }: { onDismiss: () => void }) {
  function reload() {
    trackEvent('点击刷新新版本')
    window.location.reload()
  }

  return (
    <aside
      className="feedback-invitation"
      role="status"
      aria-labelledby="update-notice-title"
    >
      <div className="feedback-invitation-signal" aria-hidden="true" />
      <button
        type="button"
        className="feedback-invitation-close"
        aria-label="关闭新版本提示"
        onClick={onDismiss}
      >
        ×
      </button>
      <p className="bookmark-invitation-kicker">
        <ArrowsClockwise size={15} weight="regular" aria-hidden="true" />
        系统更新
      </p>
      <h2 id="update-notice-title">HEX//64 有新版本</h2>
      <p>刷新页面即可使用最新版本；已生成的排盘和记录保存在本机，不受影响。</p>
      <div className="feedback-invitation-actions">
        <button type="button" className="feedback-invitation-later" onClick={onDismiss}>
          稍后
        </button>
        <button type="button" className="btn btn-primary" onClick={reload}>
          立即刷新
        </button>
      </div>
    </aside>
  )
}
