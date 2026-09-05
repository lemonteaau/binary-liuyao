import { Solar } from 'lunar-typescript'
import { BRANCHES } from '@/data/trigrams'
import type { Branch, CalendarData } from '@/types'

export const DEFAULT_TIMEZONE = 'UTC'

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// 排盘会连续读取同一时区（墙上时间、UTC 偏移）；复用最近的格式器。
let zonedFormatterCache: { timezone: string; formatter: Intl.DateTimeFormat } | undefined

/** 将绝对时间换算到指定 IANA 时区的墙上时间分量 */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  let dtf: Intl.DateTimeFormat
  try {
    dtf = zonedFormatterCache?.timezone === timeZone
      ? zonedFormatterCache.formatter
      : new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    zonedFormatterCache = { timezone: timeZone, formatter: dtf }
  } catch {
    // 非法时区回退 UTC
    return zonedParts(date, DEFAULT_TIMEZONE)
  }
  const map: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function utcOffsetString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

function parseXunKong(raw: string): [Branch, Branch] | null {
  const chars = [...raw.trim()]
  if (chars.length !== 2) return null
  const [a, b] = chars as [Branch, Branch]
  if (!BRANCHES.includes(a) || !BRANCHES.includes(b)) return null
  return [a, b]
}

/**
 * 排盘历法（版本 CAL-1）：
 * - 四柱以节气为界（lunar-typescript EightChar）
 * - 晚子时（23:00+）日柱按次日（sect=1，主流排盘流派）
 * - 农历显示用 Lunar 本体
 */
export function buildCalendar(date: Date, timezone: string): CalendarData {
  const p = zonedParts(date, timezone)
  const solar = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second)
  const lunar = solar.getLunar()
  const eightChar = lunar.getEightChar()
  eightChar.setSect(1)

  const xunKong = parseXunKong(lunar.getDayXunKong()) ?? ['子', '丑']

  const pad = (n: number, w = 2) => String(n).padStart(w, '0')

  return {
    timezone,
    utcOffset: utcOffsetString(date, timezone),
    gregorian: `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`,
    lunarText: `${lunar.getYearInChinese()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    ganzhi: {
      year: eightChar.getYear(),
      month: eightChar.getMonth(),
      day: eightChar.getDay(),
      hour: eightChar.getTime(),
    },
    hourZhi: BRANCHES[Math.floor(((p.hour + 1) % 24) / 2)]!,
    xunKong,
  }
}
