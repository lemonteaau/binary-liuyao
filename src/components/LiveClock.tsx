import { useEffect, useState } from 'react'

interface LiveClockProps {
  timezone: string
  className?: string
}

interface FormatterCache {
  timezone: string
  formatter: Intl.DateTimeFormat | null
}

let timestampFormatterCache: FormatterCache | null = null

function cachedFormatter(
  cache: FormatterCache | null,
  timezone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): FormatterCache {
  if (cache?.timezone === timezone) return cache
  try {
    return {
      timezone,
      formatter: new Intl.DateTimeFormat(locale, options),
    }
  } catch {
    return { timezone, formatter: null }
  }
}

function formatTimestampIn(tz: string, date = new Date()): string {
  timestampFormatterCache = cachedFormatter(timestampFormatterCache, tz, 'en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  try {
    const parts = timestampFormatterCache.formatter?.formatToParts(date)
    if (!parts) throw new RangeError('invalid timezone')
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 19)
  }
}

/** frozenAt 给定时不再走动，停在那一刻 */
export function LiveTimestamp({ timezone, className, frozenAt }: LiveClockProps & { frozenAt?: Date }) {
  const now = useVisibleClock(timezone, formatTimestampIn)

  return (
    <span className={className} data-nosnippet="">
      {frozenAt ? formatTimestampIn(timezone, frozenAt) : now}
    </span>
  )
}

function useVisibleClock(timezone: string, format: (timezone: string) => string): string {
  const [now, setNow] = useState(() => typeof window === 'undefined' ? '—' : format(timezone))

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const sync = () => {
      clearInterval(timer)
      if (document.visibilityState === 'hidden') return
      setNow(format(timezone))
      timer = setInterval(() => setNow(format(timezone)), 1000)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [timezone, format])

  return now
}
