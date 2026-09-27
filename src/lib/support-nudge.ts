import { trackEvent } from '@/lib/analytics'
import { parseGregorianToDate } from '@/lib/timezone-display'
import type { ReadingRecord } from '@/store/reading'

/**
 * 打赏提示只在用户有收获的时刻出现一行文字，并统一限频：
 * 任意两条提示至少间隔 GLOBAL_GAP_MS，同一种提示至少间隔 SAME_KIND_GAP_MS，
 * 用户点过任何“支持作者”入口后 SUPPORTED_SILENCE_MS 内不再出现。
 */
export type SupportNudgeKind = 'outcome' | 'milestone' | 'ordinal' | 'ai-guide' | 'export'

export const SUPPORT_NUDGE_STORAGE_KEY = 'hex64.support-nudge.v1'
const DAY_MS = 24 * 60 * 60 * 1000
export const GLOBAL_GAP_MS = 14 * DAY_MS
export const SAME_KIND_GAP_MS = 120 * DAY_MS
export const SUPPORTED_SILENCE_MS = 180 * DAY_MS
/** 同一次展示在此时间内重新渲染（如 StrictMode、切回页面）仍保持可见 */
const OCCURRENCE_TTL_MS = 30 * 60 * 1000
export const READING_MILESTONES = [10, 50, 100, 300] as const

/** 各提示要求的最少本地排盘数，避免打扰初次使用的人 */
const MIN_READINGS: Record<SupportNudgeKind, number> = {
  outcome: 0,
  milestone: 0,
  export: 0,
  'ai-guide': 3,
  ordinal: 5,
}

export interface SupportNudgeState {
  readings: number
  lastShownAt?: number
  lastOccurrence?: string
  shownAt: Partial<Record<SupportNudgeKind, number>>
  supportedAt?: number
  milestone?: { readingId: string; count: number }
}

export function loadSupportNudgeState(): SupportNudgeState {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPPORT_NUDGE_STORAGE_KEY) ?? '{}') as Partial<SupportNudgeState>
    const shownAt = parsed.shownAt && typeof parsed.shownAt === 'object' ? parsed.shownAt : {}
    return {
      readings: count(parsed.readings),
      lastShownAt: time(parsed.lastShownAt),
      lastOccurrence: typeof parsed.lastOccurrence === 'string' ? parsed.lastOccurrence : undefined,
      shownAt: Object.fromEntries(
        Object.entries(shownAt).filter(([, value]) => time(value) !== undefined),
      ),
      supportedAt: time(parsed.supportedAt),
      milestone: parsed.milestone && typeof parsed.milestone.readingId === 'string'
        ? { readingId: parsed.milestone.readingId, count: count(parsed.milestone.count) }
        : undefined,
    }
  } catch {
    return { readings: 0, shownAt: {} }
  }
}

function saveSupportNudgeState(state: SupportNudgeState): void {
  try {
    localStorage.setItem(SUPPORT_NUDGE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 存储不可用时 claim 不会成功，也就不会显示提示 */
  }
}

/** 新排盘完成时累计次数；恰好达到里程碑时记住这一卦。 */
export function recordSupportNudgeReading(readingId: string): void {
  const state = loadSupportNudgeState()
  const readings = state.readings + 1
  const milestone = (READING_MILESTONES as readonly number[]).includes(readings)
    ? { readingId, count: readings }
    : state.milestone
  saveSupportNudgeState({ ...state, readings, milestone })
}

/** 老用户已有的本地历史计入次数，但不会补发已错过的里程碑。 */
export function syncSupportNudgeReadings(localReadings: number): void {
  const state = loadSupportNudgeState()
  if (localReadings > state.readings) saveSupportNudgeState({ ...state, readings: localReadings })
}

const FRESH_READING_MS = 30 * 60 * 1000

/** 刚在本机完成的新排盘；从分享链接或较早的历史记录打开的不算。 */
export function isFreshReading(record: ReadingRecord, now = Date.now()): boolean {
  if (record.source === 'share-link' || record.chart.inputMethod === 'link') return false
  const created = parseGregorianToDate(record.chart.createdAt, record.chart.calendar.utcOffset).getTime()
  return now - created < FRESH_READING_MS
}

export function milestoneForReading(readingId: string): number | null {
  const { milestone } = loadSupportNudgeState()
  return milestone?.readingId === readingId ? milestone.count : null
}

/**
 * 请求在某个时刻显示一条提示。occurrence 标识这一次时刻（例如某一卦），
 * 对同一 occurrence 重复调用返回相同结果，不会重复计数。
 */
export function claimSupportNudge(
  kind: SupportNudgeKind,
  occurrence: string,
  now = Date.now(),
): boolean {
  const state = loadSupportNudgeState()
  const key = `${kind}:${occurrence}`
  if (state.lastOccurrence === key && state.lastShownAt !== undefined
    && now - state.lastShownAt < OCCURRENCE_TTL_MS) return true

  if (state.supportedAt !== undefined && now - state.supportedAt < SUPPORTED_SILENCE_MS) return false
  if (state.lastShownAt !== undefined && now - state.lastShownAt < GLOBAL_GAP_MS) return false
  const lastOfKind = state.shownAt[kind]
  if (lastOfKind !== undefined && now - lastOfKind < SAME_KIND_GAP_MS) return false
  if (state.readings < MIN_READINGS[kind]) return false

  saveSupportNudgeState({
    ...state,
    lastShownAt: now,
    lastOccurrence: key,
    shownAt: { ...state.shownAt, [kind]: now },
  })
  // 存储不可写时放弃，避免每次渲染都被当作一次新的展示
  if (loadSupportNudgeState().lastOccurrence !== key) return false
  trackEvent('展示打赏提示', { 入口: kind })
  return true
}

/** 所有“支持作者”入口的点击都走这里：记录来源，并让提示进入静默期。 */
export function recordSupportClick(entry: string): void {
  trackEvent('点击支持作者', { 入口: entry })
  markSupportIntent()
}

/** 用户已表现出打赏意向（进入支持页或点开打赏方式），提示进入静默期。 */
export function markSupportIntent(): void {
  const state = loadSupportNudgeState()
  saveSupportNudgeState({ ...state, supportedAt: Date.now() })
}

function count(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0
}

function time(value: unknown): number | undefined {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined
}
