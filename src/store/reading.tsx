import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { recordActionIntroReading, syncActionIntroReadings } from '@/lib/action-intro'
import { claimHexagramOrdinal, shouldClaimHexagramOrdinal } from '@/lib/hexagram-counter'
import { trackDivinationEvent } from '@/lib/analytics'
import { mergeHistory } from '@/lib/history-backup'
import {
  isReadingRecord,
  READING_OUTCOME_MAX_LENGTH,
  READING_QUESTION_MAX_LENGTH,
} from '@/lib/reading-storage'
import { recordSupportNudgeReading, syncSupportNudgeReadings } from '@/lib/support-nudge'
import {
  recordBookmarkPromptReading,
  syncBookmarkPromptReadingCount,
} from '@/lib/bookmark-prompt'
import type { HanziSeed } from '@/features/hanzi/derive'
import type { ChartData, InputMethod, LineValue } from '@/types'

export interface ReadingRecord {
  id: string
  chart: ChartData
  rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
  hanziSeed?: HanziSeed
  source?: 'share-link'
  counterEventId?: string
  ordinal?: number | null
  /** 用户记录的所问之事，只保存在本地，不进入分享链接 */
  question?: string
  /** 用户事后补记的应验情况 */
  outcome?: string
}

export type ReadingNotes = Pick<ReadingRecord, 'question' | 'outcome'>

export interface CommitReadingOptions {
  fromShareLink?: boolean
  readingId?: string
  ordinal?: number
  hanziSeed?: HanziSeed
}

const CURRENT_KEY = 'hex64.current.v1'
const HISTORY_KEY = 'hex64.history.v1'
export const HISTORY_LIMIT = 100

function loadCurrent(): ReadingRecord | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    const record: unknown = raw ? JSON.parse(raw) : null
    return isReadingRecord(record) ? record : null
  } catch {
    return null
  }
}

function loadHistory(): ReadingRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(isReadingRecord).slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

interface ReadingContextValue {
  current: ReadingRecord | null
  history: ReadingRecord[]
  commitReading: (
    chart: ChartData,
    rawLines: ReadingRecord['rawLines'],
    options?: CommitReadingOptions,
  ) => ReadingRecord
  clearCurrent: () => void
  openReading: (id: string) => boolean
  updateNotes: (id: string, notes: ReadingNotes) => void
  deleteReading: (id: string) => void
  importReadings: (records: ReadingRecord[]) => number
}

const ReadingContext = createContext<ReadingContextValue | null>(null)

function makeId(): string {
  const buf = new Uint8Array(3)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function saveCurrent(record: ReadingRecord): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(record))
  } catch {
    /* ignore quota */
  }
}

function saveHistory(records: ReadingRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records))
  } catch {
    /* ignore quota */
  }
}

export function ReadingProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ReadingRecord | null>(loadCurrent)
  const [history, setHistory] = useState<ReadingRecord[]>(loadHistory)
  const currentId = current?.id
  const currentCounterEventId = current?.counterEventId
  const currentOrdinal = current?.ordinal

  useEffect(() => {
    const localReadings = history.filter(
      (record) => record.source !== 'share-link' && record.chart.inputMethod !== 'link',
    )
    syncBookmarkPromptReadingCount(localReadings.length)
    syncSupportNudgeReadings(localReadings.length)
    syncActionIntroReadings(localReadings.map((record) => record.chart.inputMethod))
  }, [history])

  useEffect(() => {
    if (!currentId || currentOrdinal !== null || !currentCounterEventId) return

    const readingId = currentId
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5_000)
    let active = true

    claimHexagramOrdinal(currentCounterEventId, controller.signal)
      .then((ordinal) => {
        if (!active) return

        setCurrent((record) => {
          if (!record || record.id !== readingId || record.ordinal !== null) return record
          const next = { ...record, ordinal }
          saveCurrent(next)
          return next
        })
        setHistory((records) => {
          const next = records.map((record) =>
            record.id === readingId ? { ...record, ordinal } : record,
          )
          saveHistory(next)
          return next
        })
      })
      .catch(() => {
        if (!active) return
        setCurrent((record) =>
          record?.id === readingId ? { ...record, ordinal: undefined } : record,
        )
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [currentCounterEventId, currentId, currentOrdinal])

  const commitReading = useCallback(
    (chart: ChartData, rawLines: ReadingRecord['rawLines'], options: CommitReadingOptions = {}) => {
      const isNewReading = !options.fromShareLink && chart.inputMethod !== 'link'
      const shouldClaimCounter = isNewReading && shouldClaimHexagramOrdinal()
      const id = options.readingId ?? makeId()
      const previous = loadHistory().find((r) => r.id === id)
      const record: ReadingRecord = {
        id,
        chart,
        rawLines,
        hanziSeed: options.hanziSeed,
        source: options.fromShareLink ? 'share-link' : undefined,
        counterEventId: shouldClaimCounter ? crypto.randomUUID() : undefined,
        ordinal: shouldClaimCounter ? null : options.ordinal,
        // 再次打开同一分享链接时保留此前写下的备注
        question: previous?.question,
        outcome: previous?.outcome,
      }
      setCurrent(record)
      setHistory((prev) => {
        const next = [record, ...prev.filter((r) => r.id !== record.id)].slice(0, HISTORY_LIMIT)
        saveHistory(next)
        return next
      })
      saveCurrent(record)
      if (isNewReading) {
        recordBookmarkPromptReading()
        recordSupportNudgeReading(record.id)
        recordActionIntroReading(chart.inputMethod)
        trackDivinationEvent('成功生成排盘', chart.inputMethod)
      }
      return record
    },
    [],
  )

  const clearCurrent = useCallback(() => {
    setCurrent(null)
    try {
      localStorage.removeItem(CURRENT_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const openReading = useCallback((id: string) => {
    const record = loadHistory().find((r) => r.id === id)
    if (!record) return false
    setCurrent(record)
    saveCurrent(record)
    return true
  }, [])

  const updateNotes = useCallback((id: string, notes: ReadingNotes) => {
    const patch = normalizeNotes(notes)
    setCurrent((record) => {
      if (record?.id !== id) return record
      const next = { ...record, ...patch }
      saveCurrent(next)
      return next
    })
    setHistory((records) => {
      if (!records.some((r) => r.id === id)) return records
      const next = records.map((r) => (r.id === id ? { ...r, ...patch } : r))
      saveHistory(next)
      return next
    })
  }, [])

  const deleteReading = useCallback((id: string) => {
    setHistory((records) => {
      const next = records.filter((r) => r.id !== id)
      saveHistory(next)
      return next
    })
  }, [])

  const importReadings = useCallback((records: ReadingRecord[]) => {
    const merged = mergeHistory(loadHistory(), records, HISTORY_LIMIT)
    setHistory(merged.records)
    saveHistory(merged.records)
    return merged.added
  }, [])

  const value = useMemo(
    () => ({
      current,
      history,
      commitReading,
      clearCurrent,
      openReading,
      updateNotes,
      deleteReading,
      importReadings,
    }),
    [current, history, commitReading, clearCurrent, openReading, updateNotes, deleteReading, importReadings],
  )

  return <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
}

function normalizeNotes(notes: ReadingNotes): ReadingNotes {
  const patch: ReadingNotes = {}
  if ('question' in notes) {
    patch.question = notes.question?.slice(0, READING_QUESTION_MAX_LENGTH) || undefined
  }
  if ('outcome' in notes) {
    patch.outcome = notes.outcome?.slice(0, READING_OUTCOME_MAX_LENGTH) || undefined
  }
  return patch
}

export function useReading(): ReadingContextValue {
  const ctx = useContext(ReadingContext)
  if (!ctx) throw new Error('useReading must be used within ReadingProvider')
  return ctx
}

export const INPUT_METHOD_LABELS_UI: Record<InputMethod, string> = {
  entropy: '电脑起卦',
  coin: '摇币起卦',
  manual: '手动排卦',
  hexagram: '卦名起卦',
  number: '数字起卦',
  time: '时间起卦',
  hanzi: '汉字起卦',
  link: '分享链接',
}
