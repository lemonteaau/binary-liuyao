import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  markFeedbackSubmitted,
  submitFeedback,
} from '@/lib/feedback'
import type { FeedbackSource } from '@/lib/feedback'

const MAX_MESSAGE_LENGTH = 1200
const MAX_CONTACT_LENGTH = 120

export function FeedbackForm({
  source = 'about',
  focusOnMount = false,
}: {
  source?: FeedbackSource
  focusOnMount?: boolean
}) {
  const textareaId = useId()
  const contactId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const submissionIdRef = useRef<string | null>(null)
  const submittedPayloadRef = useRef<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  useEffect(() => {
    if (!focusOnMount) return
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOnMount])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current) return
    const trimmedMessage = message.trim()
    const trimmedContact = contact.trim()
    if (trimmedMessage.length < 2 || trimmedMessage.length > MAX_MESSAGE_LENGTH) return
    if (trimmedContact.length > MAX_CONTACT_LENGTH) return

    setStatus('submitting')
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 10_000)

    try {
      // 内容或联系方式改过就换新 ID，避免服务端按旧提交去重而丢掉修改
      const payload = JSON.stringify([trimmedMessage, trimmedContact])
      if (submittedPayloadRef.current !== payload) {
        submissionIdRef.current = null
      }
      submissionIdRef.current ??= crypto.randomUUID()
      submittedPayloadRef.current = payload
      await submitFeedback({
        submissionId: submissionIdRef.current,
        message: trimmedMessage,
        contact: trimmedContact,
        source,
        signal: controller.signal,
      })
      if (requestRef.current !== controller) return
      markFeedbackSubmitted()
      submissionIdRef.current = null
      setMessage('')
      setStatus('success')
    } catch {
      if (requestRef.current === controller) setStatus('error')
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === controller) requestRef.current = null
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

      <div className="feedback-contact">
        <label htmlFor={contactId}>
          联系方式<span className="text-fog">（选填）</span>
        </label>
        <input
          id={contactId}
          type="text"
          value={contact}
          maxLength={MAX_CONTACT_LENGTH}
          disabled={status === 'submitting'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="邮箱 / 微信号 / QQ"
          onChange={(event) => {
            setContact(event.target.value)
            if (status === 'error') setStatus('idle')
          }}
        />
      </div>

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
