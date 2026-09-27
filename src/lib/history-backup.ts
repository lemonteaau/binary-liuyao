import { isReadingRecord } from '@/lib/reading-storage'
import { parseGregorianToDate } from '@/lib/timezone-display'
import type { ReadingRecord } from '@/store/reading'

const BACKUP_FORMAT = 'hex64-history'
const BACKUP_VERSION = 1

export interface HistoryBackupParseResult {
  records: ReadingRecord[]
  skipped: number
}

export function serializeHistoryBackup(records: ReadingRecord[], now = new Date()): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    records,
  }, null, 2)
}

/** 备份文件来自用户磁盘，逐条走与 localStorage 相同的完整校验。 */
export function parseHistoryBackup(text: string): HistoryBackupParseResult | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object'
      && (parsed as Record<string, unknown>).format === BACKUP_FORMAT
      && Array.isArray((parsed as Record<string, unknown>).records)
      ? (parsed as { records: unknown[] }).records
      : null
  if (!list) return null

  const records = list.filter(isReadingRecord)
  return { records, skipped: list.length - records.length }
}

/** 同一 ID 以本地记录为准，仅补上本地缺失的占事与应验备注；结果按起卦时间倒序。 */
export function mergeHistory(
  local: ReadingRecord[],
  imported: ReadingRecord[],
  limit: number,
): { records: ReadingRecord[]; added: number } {
  const byId = new Map(local.map((record) => [record.id, record]))
  let added = 0
  for (const record of imported) {
    const existing = byId.get(record.id)
    if (!existing) {
      byId.set(record.id, record)
      added++
      continue
    }
    byId.set(record.id, {
      ...existing,
      question: existing.question || record.question,
      outcome: existing.outcome || record.outcome,
    })
  }
  const records = [...byId.values()]
    .sort((a, b) => readingTime(b) - readingTime(a))
    .slice(0, limit)
  return { records, added }
}

function readingTime(record: ReadingRecord): number {
  return parseGregorianToDate(record.chart.createdAt, record.chart.calendar.utcOffset).getTime()
}

export function historyBackupFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `hex64-history-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`
}
