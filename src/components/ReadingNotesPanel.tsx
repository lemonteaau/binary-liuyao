import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { SupportNudge } from '@/components/SupportNudge'
import { trackEvent } from '@/lib/analytics'
import { READING_INTERPRETATION_MAX_LENGTH, READING_OUTCOME_MAX_LENGTH } from '@/lib/reading-storage'
import { useReading } from '@/store/reading'
import type { ReadingNotes, ReadingRecord } from '@/store/reading'

const SAVE_DELAY_MS = 500

type NoteField = keyof ReadingNotes
/** 备注是在哪里写下的，随统计事件上报 */
type NotePlace = '结果页' | '历史页'

const NOTE_FIELD_LABELS: Record<NoteField, string> = {
  question: '所问何事',
  interpretation: '我的解读',
  outcome: '应验记录',
}

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
  place: NotePlace = '结果页',
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
    updateNotes(recordId, { [field]: pending })
    setSaved(true)
    onSavedRef.current?.(pending)
  }, [field, recordId, updateNotes])

  // 离开页面或收起输入框时立即写入尚在防抖中的草稿
  useEffect(() => flush, [flush])

  const change = useCallback((next: string) => {
    setValue(next)
    pendingRef.current = next
    setSaved(false)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS)
    if (next.trim() && !trackedRef.current) {
      trackedRef.current = true
      trackEvent('填写占事记录', { 字段: NOTE_FIELD_LABELS[field], 位置: place })
    }
  }, [field, flush, place])

  return { value, saved, change, flush }
}

/** 保存状态的文字；什么都没填时不显示「已保存」。 */
export function noteStatusText(draft: NoteDraft): string {
  if (!draft.saved) return '正在保存…'
  return draft.value.trim() ? '已保存' : ''
}

function NoteFieldHead({ inputId, label, draft }: { inputId: string; label: string; draft: NoteDraft }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label
        id={`${inputId}-label`}
        className="block text-[0.9375rem] tracking-[0.12em] text-ink"
        htmlFor={inputId}
      >
        {label}
      </label>
      <span role="status" aria-live="polite" className="shrink-0 text-[0.8125rem] tracking-[0.08em] text-signal">
        {noteStatusText(draft)}
      </span>
    </div>
  )
}

const NOTE_TEXTAREA_CLASS = 'mt-2 w-full resize-y border border-edge bg-void px-3 py-2 text-base leading-relaxed text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none'
const NOTE_PRIVACY_HINT = '只保存在当前浏览器，不会写入分享链接、分享图或复制的排盘文本。'

/**
 * 应验记录的输入框，结果页与历史页共用；调用方以记录 ID 作为 key 挂载。
 * children 排在输入框与打赏提示之间。
 */
export function ReadingOutcomeField({
  record,
  inputId,
  placeholder,
  place,
  autoFocus = false,
  children,
}: {
  record: ReadingRecord
  inputId: string
  placeholder: string
  place: NotePlace
  autoFocus?: boolean
  children?: ReactNode
}) {
  // 仅在本次新写下应验记录时出现，打开已有记录不会触发
  const [outcomeJustWritten, setOutcomeJustWritten] = useState(false)
  const hadOutcomeRef = useRef(Boolean(record.outcome?.trim()))
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const outcome = useNoteDraft(record, 'outcome', (value) => {
    if (hadOutcomeRef.current || !value.trim()) return
    hadOutcomeRef.current = true
    setOutcomeJustWritten(true)
  }, place)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <>
      <NoteFieldHead inputId={inputId} label="应验记录" draft={outcome} />
      <textarea
        ref={inputRef}
        id={inputId}
        value={outcome.value}
        maxLength={READING_OUTCOME_MAX_LENGTH}
        onChange={(event) => outcome.change(event.target.value)}
        onBlur={outcome.flush}
        rows={3}
        placeholder={placeholder}
        className={NOTE_TEXTAREA_CLASS}
      />
      {children}
      {outcomeJustWritten && (
        <SupportNudge kind="outcome" occurrence={record.id} className="mt-2">
          卦有应验？如果 HEX//64 帮上了忙，可以请作者喝杯茶。
        </SupportNudge>
      )}
    </>
  )
}

/**
 * 应验记录在事后补写：新排的盘放在结果页末尾，回看旧盘（review）时紧跟所问。
 * 父组件以记录 ID 作为 key。
 */
export function ReadingOutcomePanel({ record, review = false }: { record: ReadingRecord; review?: boolean }) {
  return (
    <section className="panel reading-notes mt-4 p-4 sm:p-5" aria-labelledby="reading-outcome-label">
      <span className="panel-tag">占事记录</span>
      <ReadingOutcomeField
        record={record}
        inputId="reading-outcome"
        place="结果页"
        placeholder={review
          ? '这件事后来怎么样了？记一笔，日后复盘对照卦象。'
          : '事情有了结果后回来记一笔，日后复盘对照卦象。'}
      >
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-fog">{NOTE_PRIVACY_HINT}</p>
      </ReadingOutcomeField>
    </section>
  )
}

/** 看完盘写下自己的判断，排在完整排盘之后；父组件以记录 ID 作为 key。 */
export function ReadingInterpretationPanel({ record }: { record: ReadingRecord }) {
  const interpretation = useNoteDraft(record, 'interpretation')

  return (
    <section className="panel reading-notes mt-4 p-4 sm:p-5" aria-labelledby="reading-interpretation-label">
      <span className="panel-tag">解读备忘</span>
      <NoteFieldHead inputId="reading-interpretation" label="我的解读" draft={interpretation} />
      <textarea
        id="reading-interpretation"
        value={interpretation.value}
        maxLength={READING_INTERPRETATION_MAX_LENGTH}
        onChange={(event) => interpretation.change(event.target.value)}
        onBlur={interpretation.flush}
        rows={4}
        placeholder="看完卦象后的判断和思路记在这里，日后对照应验复盘。"
        className={NOTE_TEXTAREA_CLASS}
      />
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-fog">{NOTE_PRIVACY_HINT}</p>
    </section>
  )
}
