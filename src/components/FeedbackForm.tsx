import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  markFeedbackSubmitted,
  submitFeedback,
} from '@/lib/feedback'
import type { FeedbackSource } from '@/lib/feedback'

const MAX_MESSAGE_LENGTH = 1200

export function FeedbackForm({
  source = 'about',
  focusOnMount = false,
}: {
  source?: FeedbackSource
  focusOnMount?: boolean
}) {
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const submissionIdRef = useRef<string | null>(null)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!focusOnMount) return
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOnMount])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedMessage = message.trim()
    if (trimmedMessage.length < 2 || trimmedMessage.length > MAX_MESSAGE_LENGTH) return

    setStatus('submitting')
    submissionIdRef.current ??= crypto.randomUUID()

    try {
      await submitFeedback({
        submissionId: submissionIdRef.current,
        message: trimmedMessage,
        source,
      })
      markFeedbackSubmitted()
      submissionIdRef.current = null
      setMessage('')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="feedback-success" role="status">
        <span className="feedback-success-mark" aria-hidden="true">✓</span>
        <div>
          <p className="font-bold tracking-[0.12em] text-signal">反馈已收到</p>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-fog">
            谢谢你花时间写下这些，我会认真看每一条的。
          </p>
        </div>
      </div>
    )
  }

  return (
    <form className="feedback-form" onSubmit={handleSubmit}>
      <label htmlFor={textareaId} className="sr-only">反馈意见</label>
      <textarea
        ref={textareaRef}
        id={textareaId}
        value={message}
        minLength={2}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={5}
        required
        disabled={status === 'submitting'}
        placeholder="哪里不顺手，或者希望以后添加一些功能，都可以写在这里:)"
        onChange={(event) => {
          setMessage(event.target.value)
          if (status === 'error') setStatus('idle')
        }}
      />

      <div className="feedback-form-footer">
        <div className="min-w-0">
          {status === 'error' && (
            <p className="text-[0.875rem] text-flux" role="alert">
              暂时没有发送成功。内容还在，可以稍后再试。
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[0.8125rem] tabular-nums text-fog" aria-hidden="true">
            {message.length}/{MAX_MESSAGE_LENGTH}
          </span>
          <button
            type="submit"
            className="btn btn-primary feedback-submit"
            disabled={status === 'submitting' || message.trim().length < 2}
          >
            {status === 'submitting' ? '正在发送…' : '发送'}
          </button>
        </div>
      </div>
    </form>
  )
}
