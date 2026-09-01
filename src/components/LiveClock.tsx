import { useEffect, useState } from 'react'

interface LiveClockProps {
  timezone: string
  className?: string
}

interface FormatterCache {
  timezone: string
  formatter: Intl.DateTimeFormat | null
}

let clockFormatterCache: FormatterCache | null = null
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

function formatIn(tz: string): string {
  clockFormatterCache = cachedFormatter(clockFormatterCache, tz, 'en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return clockFormatterCache.formatter?.format(new Date())
    ?? new Date().toLocaleTimeString()
}

function formatTimestampIn(tz: string): string {
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
    const parts = timestampFormatterCache.formatter?.formatToParts(new Date())
    if (!parts) throw new RangeError('invalid timezone')
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
  } catch {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }
}

export function LiveClock({ timezone, className }: LiveClockProps) {
  const [now, setNow] = useState(() => formatIn(timezone))

  useEffect(() => {
    const t = setInterval(() => setNow(formatIn(timezone)), 1000)
    return () => clearInterval(t)
  }, [timezone])

  return <span className={className}>{now}</span>
}

export function LiveTimestamp({ timezone, className }: LiveClockProps) {
  const [now, setNow] = useState(() => formatTimestampIn(timezone))

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTimestampIn(timezone)), 1000)
    return () => clearInterval(timer)
  }, [timezone])

  return <span className={className}>{now}</span>
}
