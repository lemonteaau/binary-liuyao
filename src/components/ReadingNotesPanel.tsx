import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SupportNudge } from '@/components/SupportNudge'
import { trackEvent } from '@/lib/analytics'
import { READING_OUTCOME_MAX_LENGTH } from '@/lib/reading-storage'
import { useReading } from '@/store/reading'
import type { ReadingNotes, ReadingRecord } from '@/store/reading'

const SAVE_DELAY_MS = 500

type NoteField = keyof ReadingNotes

export interface NoteDraft {
  value: string
  saved: boolean
  change: (value: string) => void
  flush: () => void
}

/**
 * 单个备注字段的草稿：输入即显示，防抖后写入当前排盘与历史。
 * 调用方以记录 ID 作为 key 挂载，切换排盘时草稿随之重置。
 */
export function useNoteDraft(
  record: ReadingRecord,
  field: NoteField,
  onSaved?: (value: string) => void,
): NoteDraft {
  const { updateNotes } = useReading()
  const [value, setValue] = useState(record[field] ?? '')
  const [saved, setSaved] = useState(true)
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<number>(0)
  const trackedRef = useRef(false)
  const onSavedRef = useRef(onSaved)
  const recordId = record.id

  useLayoutEffect(() => {
    onSavedRef.current = onSaved
  })

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current)
    const pending = pendingRef.current
    if (pending === null) return
    pendingRef.current = null
    updateNotes(recordId, field === 'question' ? { question: pending } : { outcome: pending })
    setSaved(true)
    onSavedRef.current?.(pending)
  }, [field, recordId, updateNotes])

  // 离开结果页时立即写入尚在防抖中的草稿
  useEffect(() => flush, [flush])

  const change = useCallback((next: string) => {
    setValue(next)
    pendingRef.current = next
    setSaved(false)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS)
    if (next.trim() && !trackedRef.current) {
      trackedRef.current = true
      trackEvent('填写占事记录', { 字段: field === 'question' ? '所问何事' : '应验记录' })
    }
  }, [field, flush])

  return { value, saved, change, flush }
}

/** 应验记录在事后补写，放在结果页末尾；父组件以记录 ID 作为 key。 */
export function ReadingOutcomePanel({ record }: { record: ReadingRecord }) {
  // 仅在本次新写下应验记录时出现，打开已有记录不会触发
  const [outcomeJustWritten, setOutcomeJustWritten] = useState(false)
  const hadOutcomeRef = useRef(Boolean(record.outcome?.trim()))
  const outcome = useNoteDraft(record, 'outcome', (value) => {
    if (hadOutcomeRef.current || !value.trim()) return
    hadOutcomeRef.current = true
    setOutcomeJustWritten(true)
  })

  return (
    <section className="panel reading-notes mt-4 p-4 sm:p-5" aria-labelledby="reading-outcome-label">
      <span className="panel-tag">占事记录</span>
      <div className="flex items-baseline justify-between gap-3">
        <label
          id="reading-outcome-label"
          className="block text-[0.9375rem] tracking-[0.12em] text-ink"
          htmlFor="reading-outcome"
        >
          应验记录
        </label>
        <span role="status" aria-live="polite" className="shrink-0 text-[0.8125rem] tracking-[0.08em] text-signal">
          {outcome.saved ? '已保存' : '正在保存…'}
        </span>
      </div>
      <textarea
        id="reading-outcome"
        value={outcome.value}
        maxLength={READING_OUTCOME_MAX_LENGTH}
        onChange={(event) => outcome.change(event.target.value)}
        onBlur={outcome.flush}
        rows={3}
        placeholder="事情有了结果后回来记一笔，日后复盘对照卦象。"
        className="mt-2 w-full resize-y border border-edge bg-void px-3 py-2 text-base leading-relaxed text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
      />
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-fog">
        只保存在当前浏览器，不会写入分享链接、分享图或复制的排盘文本。
      </p>
      {outcomeJustWritten && (
        <SupportNudge kind="outcome" occurrence={record.id} className="mt-2">
          卦有应验？如果 HEX//64 帮上了忙，可以请作者喝杯茶。
        </SupportNudge>
      )}
    </section>
  )
}
