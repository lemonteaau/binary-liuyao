import { TRIGRAMS } from '@/data/trigrams'
import { rawLinesToMutationMask, rawLinesToPrimaryBits } from '@/engine/binary'
import type { ReadingRecord } from '@/store/reading'

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string')
}

function bits(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 64
}

function lineIndex(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 6
}

function najia(value: unknown): boolean {
  return object(value) && hasStrings(value, ['stem', 'branch', 'element'])
}

function hexState(value: unknown): boolean {
  if (!object(value) || !bits(value.bits) || !object(value.record)) return false
  const record = value.record
  return hasStrings(value, ['binary', 'palace', 'palaceRank'])
    && (value.attribute === null || typeof value.attribute === 'string')
    && hasStrings(record, ['chineseName', 'shortName'])
    && Number.isInteger(record.kingWenNumber)
    && Number(record.kingWenNumber) >= 1 && Number(record.kingWenNumber) <= 64
    && typeof record.upperKey === 'string' && Object.hasOwn(TRIGRAMS, record.upperKey)
    && typeof record.lowerKey === 'string' && Object.hasOwn(TRIGRAMS, record.lowerKey)
}

function hanziSeed(value: unknown): boolean {
  if (!object(value)) return false
  const parts = value.singleCharacterParts
  return hasStrings(value, ['text', 'upperText', 'lowerText'])
    && strings(value.characters)
    && Array.isArray(value.characterStrokes) && value.characterStrokes.every(Number.isFinite)
    && ['upperValue', 'lowerValue', 'movingValue', 'upperRemainder', 'lowerRemainder', 'movingLine']
      .every((key) => Number.isFinite(value[key]))
    && ['upperRemainder', 'lowerRemainder'].every((key) => Number.isInteger(value[key])
      && Number(value[key]) >= 1 && Number(value[key]) <= 8)
    && lineIndex(value.movingLine)
    && ['single-character', 'stroke-count', 'character-count'].includes(String(value.strategy))
    && (parts === undefined || (object(parts)
      && ['horizontal', 'vertical', 'other'].includes(String(parts.layout))))
}

/** localStorage 可被旧版本、扩展或用户改写，读取前检查所有渲染依赖的结构。 */
export function isReadingRecord(value: unknown): value is ReadingRecord {
  if (!object(value) || typeof value.id !== 'string' || !/^[0-9A-F]{6}$/.test(value.id)) return false
  if (!Array.isArray(value.rawLines) || value.rawLines.length !== 6
    || !value.rawLines.every((line) => [6, 7, 8, 9].includes(line))) return false
  const rawLines = value.rawLines
  if (value.source !== undefined && value.source !== 'share-link') return false
  if (value.counterEventId !== undefined && typeof value.counterEventId !== 'string') return false
  if (value.ordinal != null && (!Number.isSafeInteger(value.ordinal) || Number(value.ordinal) < 1)) return false
  if (value.hanziSeed !== undefined && !hanziSeed(value.hanziSeed)) return false

  const chart = value.chart
  if (!object(chart) || typeof chart.createdAt !== 'string'
    || !['entropy', 'coin', 'manual', 'hexagram', 'number', 'time', 'hanzi', 'link'].includes(String(chart.inputMethod))) return false
  const calendar = chart.calendar
  if (!object(calendar) || !hasStrings(calendar, ['timezone', 'utcOffset', 'gregorian', 'lunarText', 'hourZhi'])
    || !object(calendar.ganzhi) || !hasStrings(calendar.ganzhi, ['year', 'month', 'day', 'hour'])
    || !strings(calendar.xunKong) || calendar.xunKong.length !== 2) return false
  if (!hexState(chart.primary) || !hexState(chart.result) || !bits(chart.mutationMask)) return false
  const primary = chart.primary as Record<string, unknown>
  const result = chart.result as Record<string, unknown>
  if (primary.bits !== rawLinesToPrimaryBits(value.rawLines)
    || chart.mutationMask !== rawLinesToMutationMask(value.rawLines)
    || result.bits !== (Number(primary.bits) ^ chart.mutationMask)) return false
  if (!Array.isArray(chart.lines) || chart.lines.length !== 6
    || !chart.lines.every((line, index) => object(line)
      && line.index === index && line.value === rawLines[index]
      && typeof line.yang === 'boolean' && typeof line.mutating === 'boolean'
      && object(line.primary) && najia(line.primary.najia) && typeof line.primary.relation === 'string'
      && (line.primary.spirit === undefined || typeof line.primary.spirit === 'string')
      && [null, '世', '应'].includes(line.primary.shiYing as string | null)
      && object(line.result) && najia(line.result.najia) && typeof line.result.relation === 'string')) return false
  return Array.isArray(chart.fuShen) && chart.fuShen.every((entry) => object(entry)
      && lineIndex(entry.index) && typeof entry.relation === 'string' && najia(entry.najia))
    && object(chart.guaShen) && typeof chart.guaShen.branch === 'string' && typeof chart.guaShen.onHexagram === 'boolean'
    && Array.isArray(chart.shensha) && chart.shensha.every((entry) => object(entry)
      && hasStrings(entry, ['id', 'name']) && strings(entry.branches))
}
