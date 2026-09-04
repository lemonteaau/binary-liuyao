import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FEEDBACK_PROMPT_ACTIVE_MS,
  FEEDBACK_STATE_CHANGED_EVENT,
  isFeedbackPromptEligible,
  loadFeedbackPromptState,
  saveFeedbackPromptState,
  snoozeFeedbackPrompt,
} from '@/lib/feedback'

const TRACK_INTERVAL_MS = 15_000

export function FeedbackInvitation({ suppressed = false }: { suppressed?: boolean }) {
  const location = useLocation()
  const isLocalPreview = import.meta.env.DEV &&
    new URLSearchParams(location.search).get('feedback-preview') === '1'
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const [visible, setVisible] = useState(() =>
    isFeedbackPromptEligible(loadFeedbackPromptState()),
  )

  useEffect(() => {
    function syncVisibility() {
      setVisible(isFeedbackPromptEligible(loadFeedbackPromptState()))
    }

    window.addEventListener(FEEDBACK_STATE_CHANGED_EVENT, syncVisibility)
    window.addEventListener('storage', syncVisibility)
    return () => {
      window.removeEventListener(FEEDBACK_STATE_CHANGED_EVENT, syncVisibility)
      window.removeEventListener('storage', syncVisibility)
    }
  }, [])

  useEffect(() => {
    const initial = loadFeedbackPromptState()
    if (initial.submitted || (initial.dismissedUntil ?? 0) > Date.now()) return

    let activeMs = initial.activeMs
    let lastTick = Date.now()

    function recordActiveTime() {
      const now = Date.now()
      const elapsed = Math.min(Math.max(now - lastTick, 0), TRACK_INTERVAL_MS * 2)
      lastTick = now
      if (document.visibilityState === 'hidden') return

      const latest = loadFeedbackPromptState()
      if (latest.submitted || (latest.dismissedUntil ?? 0) > now) return

      activeMs = Math.max(activeMs, latest.activeMs) + elapsed
      saveFeedbackPromptState({ ...latest, activeMs })
      if (activeMs >= FEEDBACK_PROMPT_ACTIVE_MS) setVisible(true)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') recordActiveTime()
      lastTick = Date.now()
    }

    const interval = window.setInterval(recordActiveTime, TRACK_INTERVAL_MS)
    window.addEventListener('pagehide', recordActiveTime)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(interval)
      recordActiveTime()
      window.removeEventListener('pagehide', recordActiveTime)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function closeInvitation() {
    if (isLocalPreview) {
      setPreviewDismissed(true)
      return
    }
    snoozeFeedbackPrompt()
    setVisible(false)
  }

  const shouldShow = visible || (isLocalPreview && !previewDismissed)
  if (suppressed || !shouldShow || location.pathname === '/about') return null

  return (
    <aside className="feedback-invitation" aria-labelledby="feedback-invitation-title">
      <div className="feedback-invitation-signal" aria-hidden="true" />
      <button
        type="button"
        className="feedback-invitation-close"
        aria-label="关闭反馈邀请，30 天内不再提示"
        title="30 天内不再提示"
        onClick={closeInvitation}
      >
        ×
      </button>
      <h2 id="feedback-invitation-title">用了一阵子，还顺手吗？</h2>
      <p>
        如果有哪里让你困惑，或有一个很想要的功能，欢迎留下你的建议。
      </p>
      <div className="feedback-invitation-actions">
        <button type="button" className="feedback-invitation-later" onClick={closeInvitation}>
          以后再说
        </button>
        <Link to="/about?feedback=1" className="btn btn-primary" onClick={closeInvitation}>
          写两句
        </Link>
      </div>
    </aside>
  )
}
