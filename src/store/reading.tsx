import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChartData, InputMethod, LineValue } from '@/types'

export interface ReadingRecord {
  id: string
  chart: ChartData
  rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
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

export function ReadingProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ReadingRecord | null>(loadCurrent)
  const [history, setHistory] = useState<ReadingRecord[]>(loadHistory)

  const commitReading = useCallback(
    (chart: ChartData, rawLines: ReadingRecord['rawLines']) => {
      const record: ReadingRecord = { id: makeId(), chart, rawLines }
      setCurrent(record)
      setHistory((prev) => {
        const next = [record, ...prev.filter((r) => r.id !== record.id)].slice(0, HISTORY_LIMIT)
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
        } catch {
          /* ignore quota */
        }
        return next
      })
      try {
        localStorage.setItem(CURRENT_KEY, JSON.stringify(record))
      } catch {
        /* ignore quota */
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
