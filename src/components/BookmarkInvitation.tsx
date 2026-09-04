import { useEffect, useRef, useState } from 'react'
import { BookmarkSimple } from '@phosphor-icons/react'
import { useLocation } from 'react-router-dom'
import {
  BOOKMARK_PROMPT_STATE_CHANGED_EVENT,
  BOOKMARK_PROMPT_STORAGE_KEY,
  BOOKMARK_PROMPT_VISIT_DELAY_MS,
  dismissBookmarkPrompt,
  loadBookmarkPromptState,
  registerBookmarkPromptVisit,
} from '@/lib/bookmark-prompt'

interface BookmarkInvitationProps {
  onDismiss?: () => void
  onVisibilityChange?: (visible: boolean) => void
}

export function BookmarkInvitation({
  onDismiss,
  onVisibilityChange,
}: BookmarkInvitationProps) {
  const location = useLocation()
  const platform = detectPlatform()
  const isLocalPreview = import.meta.env.DEV &&
    new URLSearchParams(location.search).get('bookmark-preview') === '1'
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const [triggerReady, setTriggerReady] = useState(false)
  const visitTimerRef = useRef<number>(0)

  useEffect(() => {
    function syncEligibility() {
      window.clearTimeout(visitTimerRef.current)
      const state = loadBookmarkPromptState()

      if (state.dismissed) {
        setTriggerReady(false)
        return
      }
      if (state.completedReadingCount >= 2) {
        setTriggerReady(true)
        return
      }
      if (state.visitCount >= 2) {
        visitTimerRef.current = window.setTimeout(
          () => setTriggerReady(true),
          BOOKMARK_PROMPT_VISIT_DELAY_MS,
        )
        return
      }
      setTriggerReady(false)
    }

    registerBookmarkPromptVisit()
    syncEligibility()

    function handleStorage(event: StorageEvent) {
      if (event.key === BOOKMARK_PROMPT_STORAGE_KEY) syncEligibility()
    }

    window.addEventListener(BOOKMARK_PROMPT_STATE_CHANGED_EVENT, syncEligibility)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.clearTimeout(visitTimerRef.current)
      window.removeEventListener(BOOKMARK_PROMPT_STATE_CHANGED_EVENT, syncEligibility)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const shouldShow =
    (platform.mobile && triggerReady && !loadBookmarkPromptState().dismissed) ||
    (isLocalPreview && !previewDismissed)

  useEffect(() => {
    onVisibilityChange?.(shouldShow)
    return () => onVisibilityChange?.(false)
  }, [onVisibilityChange, shouldShow])

  function closeInvitation() {
    if (isLocalPreview) {
      setPreviewDismissed(true)
    } else {
      dismissBookmarkPrompt()
      setTriggerReady(false)
    }
    onDismiss?.()
  }

  if (!shouldShow) return null

  return (
    <aside
      className="feedback-invitation bookmark-invitation"
      aria-labelledby="bookmark-invitation-title"
    >
      <div className="feedback-invitation-signal" aria-hidden="true" />
      <button
        type="button"
        className="feedback-invitation-close"
        aria-label="关闭快捷访问提示，以后不再提示"
        title="以后不再提示"
        onClick={closeInvitation}
      >
        ×
      </button>
      <p className="bookmark-invitation-kicker">
        <BookmarkSimple size={15} weight="regular" aria-hidden="true" />
        快速返回
      </p>
      <h2 id="bookmark-invitation-title">
        {platform.mobile ? '把 HEX//64 留在手边' : '把 HEX//64 加入书签'}
      </h2>
      <p>{bookmarkInstructions(platform)}</p>
      <div className="feedback-invitation-actions">
        <button type="button" className="btn btn-primary" onClick={closeInvitation}>
          知道了
        </button>
      </div>
    </aside>
  )
}

function detectPlatform(): { mobile: boolean; ios: boolean } {
  const userAgent = navigator.userAgent
  const ios = /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  const mobile = ios || /Android|Mobile/i.test(userAgent)
  return { mobile, ios }
}

function bookmarkInstructions(platform: { mobile: boolean; ios: boolean }): string {
  if (!platform.mobile) {
    return '按 ⌘ D（macOS）或 Ctrl D（Windows / Linux）将本站加入书签。'
  }
  if (platform.ios) {
    return '打开浏览器的分享或菜单按钮，选择“添加到主屏幕”；也可以先添加书签。'
  }
  return '打开浏览器菜单，选择“添加到主屏幕”或“添加书签”。'
}
