import { DEFAULT_TIMEZONE, canonicalTimezone, utcOffsetString } from '@/calendar/solar-lunar'
import { getTimezoneZhName } from '@/lib/timezone-display'

export interface TimezoneEntry {
  /** 'auto' 或 IANA 时区名 */
  value: string
  title: string
  detail: string
  /** 已归一化的检索文本 */
  search: string
  /** 相对 UTC 的分钟数，按偏移搜索用 */
  offsetMinutes: number | null
}

export interface TimezoneCatalog {
  auto: TimezoneEntry
  pinned: TimezoneEntry[]
  /** 全部时区，不含常用里已有的 */
  rest: TimezoneEntry[]
}

interface PinnedTimezone {
  timezone: string
  city: string
  /** 替代默认的“中文时区名 · 偏移” */
  note?: string
  /** 额外的搜索词 */
  aliases?: string[]
}

/** 置顶的常用时区：国内用户为主，其次是海外华人常在的城市 */
export const PINNED_TIMEZONES: ReadonlyArray<PinnedTimezone> = [
  {
    timezone: 'Asia/Shanghai',
    city: '北京',
    note: '中国大陆及港澳台通用 · UTC+08:00',
    aliases: ['中国', '上海', '香港', '澳门', '台北', '台湾', 'hongkong', 'macau', 'taipei'],
  },
  { timezone: 'Asia/Singapore', city: '新加坡' },
  { timezone: 'Asia/Tokyo', city: '东京' },
  { timezone: 'Australia/Sydney', city: '悉尼' },
  { timezone: 'Europe/London', city: '伦敦' },
  { timezone: 'America/New_York', city: '纽约' },
  { timezone: 'America/Los_Angeles', city: '洛杉矶' },
  { timezone: 'America/Vancouver', city: '温哥华' },
]

const offsetFormatters = new Map<string, Intl.DateTimeFormat | null>()

/** UTC+08:00；整套目录要算几百个时区，按时区缓存格式器 */
export function timezoneOffset(timezone: string, date = new Date()): string {
  let formatter = offsetFormatters.get(timezone)
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    } catch {
      formatter = null
    }
    offsetFormatters.set(timezone, formatter)
  }
  const raw = formatter?.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value
  if (raw === 'GMT') return 'UTC+00:00'
  if (raw?.startsWith('GMT')) return `UTC${raw.slice(3)}`
  return utcOffsetString(date, timezone)
}

export function normalizeTimezoneQuery(text: string): string {
  return text.toLowerCase().replace(/[\s_/·—-]+/g, '')
}

function offsetMinutesOf(offset: string): number | null {
  const match = offset.match(/^UTC([+-])(\d{2}):(\d{2})$/)
  if (!match) return null
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/** +8、UTC+8、gmt-5、+0530 这类输入按偏移精确匹配，免得 +8 也搜出 +08:45 */
function parseOffsetQuery(query: string): number | null {
  const match = query.trim().toLowerCase().match(/^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) return null
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0)
  return match[1] === '-' ? -minutes : minutes
}

export function matchesTimezoneQuery(entry: TimezoneEntry, query: string): boolean {
  const offset = parseOffsetQuery(query)
  if (offset !== null) return entry.offsetMinutes === offset
  const needle = normalizeTimezoneQuery(query)
  return !needle || entry.search.includes(needle)
}

function zoneEntry(timezone: string, date: Date, pinned?: PinnedTimezone): TimezoneEntry {
  const zh = getTimezoneZhName(timezone, date)
  const offset = timezoneOffset(timezone, date)
  // 全部时区里同一个中文名会出现很多次（格林尼治标准时间等），按 IANA 名列出更好找
  const title = pinned ? `${pinned.city}时间` : timezone.replaceAll('_', ' ')
  const detail = pinned?.note ?? (zh && zh !== timezone ? `${zh} · ${offset}` : offset)
  return {
    value: timezone,
    title,
    detail,
    search: normalizeTimezoneQuery(
      [pinned?.city, ...(pinned?.aliases ?? []), zh, timezone, offset].filter(Boolean).join(' '),
    ),
    offsetMinutes: offsetMinutesOf(offset),
  }
}

export function autoEntry(detected: string, fellBack: boolean, date = new Date()): TimezoneEntry {
  const zh = getTimezoneZhName(detected, date) ?? detected
  const offset = timezoneOffset(detected, date)
  return {
    value: 'auto',
    title: '自动',
    detail: fellBack
      ? '浏览器未提供时区，按北京时间'
      : `${zh} · ${offset}`,
    search: normalizeTimezoneQuery(`自动 auto ${zh} ${detected}`),
    offsetMinutes: offsetMinutesOf(offset),
  }
}

const pinnedByTimezone = new Map(PINNED_TIMEZONES.map((pinned) => [pinned.timezone, pinned]))

/** 选中项和按钮上的文字只需要一条，不必建整套目录 */
export function timezoneEntry(
  value: string,
  detected: string,
  fellBack: boolean,
  date = new Date(),
): TimezoneEntry {
  if (value === 'auto') return autoEntry(detected, fellBack, date)
  return zoneEntry(value, date, pinnedByTimezone.get(value))
}

function supportedTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

let cached: { key: string; catalog: TimezoneCatalog } | null = null

/** 打开选择器时才建；同一会话里复用 */
export function buildTimezoneCatalog(
  detected: string,
  fellBack: boolean,
  current: string,
  date = new Date(),
): TimezoneCatalog {
  const key = `${detected}|${fellBack}|${current}`
  if (cached?.key === key) return cached.catalog

  const pinned = PINNED_TIMEZONES.map((entry) => zoneEntry(entry.timezone, date, entry))
  const restZones = new Set([
    'UTC',
    DEFAULT_TIMEZONE,
    detected,
    ...supportedTimezones(),
    ...(current === 'auto' ? [] : [current]),
  ])
  for (const { timezone } of PINNED_TIMEZONES) restZones.delete(timezone)
  // 与北京时间相同的时区已并入“北京时间”
  const rest = [...restZones]
    .filter((timezone) => canonicalTimezone(timezone) === timezone)
    .sort()
    .map((timezone) => zoneEntry(timezone, date))

  const catalog = { auto: autoEntry(detected, fellBack, date), pinned, rest }
  cached = { key, catalog }
  return catalog
}
