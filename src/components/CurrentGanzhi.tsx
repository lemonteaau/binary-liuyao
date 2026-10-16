import { useEffect, useState } from 'react'
import { buildCalendar } from '@/calendar/solar-lunar'
import { BRANCHES } from '@/data/trigrams'
import type { Branch, CalendarData } from '@/types'

/** 时柱两小时才变一次，前台每半分钟核对一次即可 */
const REFRESH_MS = 30_000

/** 时辰的起止钟点：子时 23:00–01:00，丑时 01:00–03:00…… */
export function shichenRange(branch: Branch): string {
  const index = BRANCHES.indexOf(branch)
  const start = (index * 2 + 23) % 24
  const end = (start + 2) % 24
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`
  return `${pad(start)}–${pad(end)}`
}

function useCurrentCalendar(timezone: string): CalendarData {
  const [calendar, setCalendar] = useState(() => buildCalendar(new Date(), timezone))

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      clearInterval(timer)
      if (document.visibilityState === 'hidden') return
      setCalendar(buildCalendar(new Date(), timezone))
      timer = setInterval(() => setCalendar(buildCalendar(new Date(), timezone)), REFRESH_MS)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [timezone])

  return calendar
}

/** 首页常驻的此刻四柱，当老黄历看；与排盘同一套历法 */
export function CurrentGanzhi({ timezone }: { timezone: string }) {
  const { ganzhi, hourZhi } = useCurrentCalendar(timezone)

  return (
    <p className="current-ganzhi" data-nosnippet="">
      <span className="current-ganzhi-label">此刻</span>
      <span className="current-ganzhi-pillars">
        <span>{ganzhi.year}年</span>
        <span>{ganzhi.month}月</span>
        <span>{ganzhi.day}日</span>
        <span className="text-signal">{ganzhi.hour}时</span>
      </span>
      <span className="current-ganzhi-range">{hourZhi}时 {shichenRange(hourZhi)}</span>
    </p>
  )
}
