const cachedLongFormatter: Map<string, Intl.DateTimeFormat> = new Map()

function getLongFormatter(timezone: string): Intl.DateTimeFormat | null {
  const cached = cachedLongFormatter.get(timezone)
  if (cached) return cached
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      timeZoneName: 'long',
    })
    cachedLongFormatter.set(timezone, formatter)
    return formatter
  } catch {
    return null
  }
}

/**
 * 获取时区的中文长名称，例如 Asia/Shanghai -> 中国标准时间
 * 失败或不支持时返回 null
 */
export function getTimezoneZhName(timezone: string, date: Date = new Date()): string | null {
  const formatter = getLongFormatter(timezone)
  if (!formatter) return null
  try {
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    if (tzPart?.value) return tzPart.value
    return null
  } catch {
    return null
  }
}

/**
 * 用于下拉/标题等场景：中文名 + IANA
 * 例: Asia/Shanghai -> 中国标准时间 (Asia/Shanghai)
 * 若无法取得中文名则直接返回 IANA
 */
export function formatTimezone(timezone: string, date: Date = new Date()): string {
  const zh = getTimezoneZhName(timezone, date)
  if (!zh || zh === timezone) return timezone
  // 避免重复，例如 zh 已包含 timezone 文本时
  if (zh.includes(timezone)) return zh
  return `${zh} (${timezone})`
}

/**
 * 用于排盘元数据：中文名 + 偏移 + IANA
 * 例: Asia/Shanghai +08:00 -> 中国标准时间 +08:00 (Asia/Shanghai)
 * 保持原有 offset 展示，同时补充中文
 */
export function formatTimezoneWithOffset(
  timezone: string,
  offset: string,
  date: Date = new Date(),
): string {
  const zh = getTimezoneZhName(timezone, date)
  if (!zh || zh === timezone) return `${timezone} ${offset}`
  if (zh.includes(timezone)) return `${zh} ${offset}`
  return `${zh} ${offset} (${timezone})`
}

/**
 * 用于 <select> 选项：中文 — IANA
 * 与 formatTimezone 区别在于使用长破折号分隔，更适合列表阅读
 */
export function timezoneOptionLabel(timezone: string, date: Date = new Date()): string {
  const zh = getTimezoneZhName(timezone, date)
  if (!zh || zh === timezone) return timezone
  if (zh.includes(timezone)) return zh
  return `${zh} — ${timezone}`
}

/**
 * 尝试从 gregorian 字符串解析日期，用于让夏令时名称与排盘当时一致
 * 使用排盘保存的 UTC 偏移，避免查看者时区影响夏令时名称。
 * 解析失败则回退到 now；省略偏移时兼容原来的本地时间解析。
 */
export function parseGregorianToDate(gregorian: string, utcOffset?: string): Date {
  const offset = utcOffset?.match(/^UTC([+-]\d{2}:\d{2})$/)?.[1] ?? ''
  const iso = gregorian.replace(' ', 'T') + offset
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date() : d
}
