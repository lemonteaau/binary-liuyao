import { useCallback, useEffect, useRef, useState } from 'react'
import { SupportNudge } from '@/components/SupportNudge'
import { trackEvent } from '@/lib/analytics'
import {
  READING_OUTCOME_MAX_LENGTH,
  READING_QUESTION_MAX_LENGTH,
} from '@/lib/reading-storage'
import { useReading } from '@/store/reading'
import type { ReadingNotes, ReadingRecord } from '@/store/reading'

const SAVE_DELAY_MS = 500

/** 父组件以记录 ID 作为 key，切换排盘时草稿随之重置。 */
export function ReadingNotesPanel({ record }: { record: ReadingRecord }) {
  const { updateNotes } = useReading()
  const [question, setQuestion] = useState(record.question ?? '')
  const [outcome, setOutcome] = useState(record.outcome ?? '')
  const [saved, setSaved] = useState(true)
  // 仅在本次新写下应验记录时出现，打开已有记录不会触发
  const [outcomeJustWritten, setOutcomeJustWritten] = useState(false)
  const hadOutcomeRef = useRef(Boolean(record.outcome?.trim()))
  const pendingRef = useRef<ReadingNotes | null>(null)
  const timerRef = useRef<number>(0)
  const trackedRef = useRef(new Set<keyof ReadingNotes>())
  const recordId = record.id

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current)
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    updateNotes(recordId, pending)
    setSaved(true)
    if (!hadOutcomeRef.current && pending.outcome?.trim()) {
      hadOutcomeRef.current = true
      setOutcomeJustWritten(true)
    }
  }, [recordId, updateNotes])

  // 离开结果页时立即写入尚在防抖中的草稿
  useEffect(() => flush, [flush])

  function change(field: keyof ReadingNotes, value: string) {
    if (field === 'question') setQuestion(value)
    else setOutcome(value)
    pendingRef.current = { ...pendingRef.current, [field]: value }
    setSaved(false)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS)
    if (value.trim() && !trackedRef.current.has(field)) {
      trackedRef.current.add(field)
      trackEvent('填写占事记录', { 字段: field === 'question' ? '所问何事' : '应验记录' })
    }
  }

  return (
    <section className="panel reading-notes mt-4 p-4 sm:p-5" aria-labelledby="reading-notes-title">
      <span className="panel-tag">占事记录</span>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="reading-notes-title" className="sr-only">占事记录</h2>
        <label className="block text-[0.9375rem] tracking-[0.12em] text-ink" htmlFor="reading-question">
          所问何事
        </label>
        <span role="status" aria-live="polite" className="shrink-0 text-[0.8125rem] tracking-[0.08em] text-signal">
          {saved ? '已保存' : '正在保存…'}
        </span>
      </div>
      <input
        id="reading-question"
        type="text"
        value={question}
        maxLength={READING_QUESTION_MAX_LENGTH}
        onChange={(event) => change('question', event.target.value)}
        onBlur={flush}
        placeholder="例如：这次面试能否通过"
        autoComplete="off"
        className="mt-2 w-full border border-edge bg-void px-3 py-2 text-base text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
      />
      <label className="mt-4 block text-[0.9375rem] tracking-[0.12em] text-ink" htmlFor="reading-outcome">
        应验记录
      </label>
      <textarea
        id="reading-outcome"
        value={outcome}
        maxLength={READING_OUTCOME_MAX_LENGTH}
        onChange={(event) => change('outcome', event.target.value)}
        onBlur={flush}
        rows={3}
        placeholder="事情有了结果后回来记一笔，日后复盘对照卦象。"
        className="mt-2 w-full resize-y border border-edge bg-void px-3 py-2 text-base leading-relaxed text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
      />
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-fog">
        只保存在当前浏览器，不会写入分享链接、分享图或复制的排盘文本。
      </p>
      {outcomeJustWritten && (
        <SupportNudge kind="outcome" occurrence={recordId} className="mt-2">
          卦有应验？如果 HEX//64 帮上了忙，可以请作者喝杯茶。
        </SupportNudge>
      )}
    </section>
  )
}
