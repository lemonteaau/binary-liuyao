import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { claimHexagramOrdinal } from '@/lib/hexagram-counter'
import type { ChartData, InputMethod, LineValue } from '@/types'

export interface ReadingRecord {
  id: string
  chart: ChartData
  rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
  counterEventId?: string
  ordinal?: number | null
}

const CURRENT_KEY = 'hex64.current.v1'
const HISTORY_KEY = 'hex64.history.v1'
const HISTORY_LIMIT = 20

function loadCurrent(): ReadingRecord | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    return raw ? (JSON.parse(raw) as ReadingRecord) : null
  } catch {
    return null
  }
}

function loadHistory(): ReadingRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as ReadingRecord[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

interface ReadingContextValue {
  current: ReadingRecord | null
  history: ReadingRecord[]
  commitReading: (chart: ChartData, rawLines: ReadingRecord['rawLines']) => ReadingRecord
  clearCurrent: () => void
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
    (chart: ChartData, rawLines: ReadingRecord['rawLines']) => {
      const shouldCount = chart.inputMethod !== 'link'
      const record: ReadingRecord = {
        id: makeId(),
        chart,
        rawLines,
        counterEventId: shouldCount ? crypto.randomUUID() : undefined,
        ordinal: shouldCount ? null : undefined,
      }
      setCurrent(record)
      setHistory((prev) => {
        const next = [record, ...prev.filter((r) => r.id !== record.id)].slice(0, HISTORY_LIMIT)
        saveHistory(next)
        return next
      })
      saveCurrent(record)
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

  const value = useMemo(
    () => ({ current, history, commitReading, clearCurrent }),
    [current, history, commitReading, clearCurrent],
  )

  return <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
}

export function useReading(): ReadingContextValue {
  const ctx = useContext(ReadingContext)
  if (!ctx) throw new Error('useReading must be used within ReadingProvider')
  return ctx
}

export const INPUT_METHOD_LABELS_UI: Record<InputMethod, string> = {
  entropy: '电脑模拟',
  coin: '摇币指定',
  manual: '手动指定',
  hexagram: '卦名检索',
  number: '数字起卦',
  time: '时间起卦',
  link: '链接导入',
}
