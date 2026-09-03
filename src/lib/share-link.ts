import { bitsToString, stringToBits } from '@/engine/binary'
import type { ChartData, InputMethod } from '@/types'

const INPUT_METHODS: readonly InputMethod[] = [
  'entropy',
  'coin',
  'manual',
  'hexagram',
  'number',
  'time',
  'hanzi',
  'link',
]

export interface ShareLinkData {
  primary: number
  mask: number
  when?: Date
  timezone?: string
  inputMethod?: InputMethod
  readingId?: string
  ordinal?: number
}

export interface ShareLinkMetadata {
  readingId?: string
  ordinal?: number | null
}

/** Build a hash-route URL that can reproduce the original chart exactly. */
export function buildShareUrl(
  chart: ChartData,
  baseUrl: string,
  metadata: ShareLinkMetadata = {},
): string {
  const params = new URLSearchParams({
    v: '2',
    s: bitsToString(chart.primary.bits),
    m: bitsToString(chart.mutationMask),
    t: String(chartTimestamp(chart)),
    z: chart.calendar.timezone,
    i: chart.inputMethod,
  })

  if (metadata.readingId && isReadingId(metadata.readingId)) {
    params.set('r', metadata.readingId)
  }
  if (metadata.ordinal != null && Number.isSafeInteger(metadata.ordinal) && metadata.ordinal > 0) {
    params.set('o', String(metadata.ordinal))
  }

  return `${baseUrl}#/result?${params.toString()}`
}

export function parseShareLink(params: URLSearchParams): ShareLinkData | null {
  const primary = parseBits(params.get('s'))
  const mask = parseBits(params.get('m'))
  if (primary === null || mask === null) return null

  const when = parseTimestamp(params.get('t'))
  const timezone = parseTimezone(params.get('z'))
  const inputMethod = parseInputMethod(params.get('i'))
  const readingId = parseReadingId(params.get('r'))
  const ordinal = parseOrdinal(params.get('o'))

  return {
    primary,
    mask,
    ...(when ? { when } : {}),
    ...(timezone ? { timezone } : {}),
    ...(inputMethod ? { inputMethod } : {}),
    ...(readingId ? { readingId } : {}),
    ...(ordinal ? { ordinal } : {}),
  }
}

function chartTimestamp(chart: ChartData): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(chart.calendar.gregorian)
  const offset = /^UTC([+-])(\d{2}):(\d{2})$/.exec(chart.calendar.utcOffset)
  if (!match || !offset) return Math.floor(Date.now() / 1000)

  const [, year, month, day, hour, minute, second] = match
  const [, sign, offsetHours, offsetMinutes] = offset
  const wallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  const timestamp = wallTime - (sign === '+' ? offsetMs : -offsetMs)
  return Math.floor(timestamp / 1000)
}

function parseBits(value: string | null): number | null {
  if (!value) return null
  return stringToBits(value.toUpperCase())
}

function parseTimestamp(value: string | null): Date | undefined {
  if (!value || !/^-?\d{1,13}$/.test(value)) return undefined
  const date = new Date(Number(value) * 1000)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function parseTimezone(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return value
  } catch {
    return undefined
  }
}

function parseInputMethod(value: string | null): InputMethod | undefined {
  return INPUT_METHODS.includes(value as InputMethod) ? value as InputMethod : undefined
}

function isReadingId(value: string): boolean {
  return /^[0-9A-F]{6}$/.test(value)
}

function parseReadingId(value: string | null): string | undefined {
  if (!value) return undefined
  const normalized = value.toUpperCase()
  return isReadingId(normalized) ? normalized : undefined
}

function parseOrdinal(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const ordinal = Number(value)
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : undefined
}
