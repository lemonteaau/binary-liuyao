import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import { deriveHanziSeed } from '@/features/hanzi/derive'
import { isReadingRecord } from '@/lib/reading-storage'
import type { ReadingRecord } from '@/store/reading'

function record(): ReadingRecord {
  const rawLines = [6, 9, 8, 8, 7, 8] as ReadingRecord['rawLines']
  return {
    id: 'A1B2C3',
    rawLines,
    chart: generateChart({ inputMethod: 'manual', rawLines }),
  }
}

describe('本地排盘记录校验', () => {
  it('保留旧版记录和分享来源及待登记状态，不重新计算排盘', () => {
    const original = record()
    for (const metadata of [{}, { source: 'share-link', ordinal: 864 }, { ordinal: null, counterEventId: crypto.randomUUID() }]) {
      const stored = JSON.parse(JSON.stringify({ ...original, ...metadata }))
      expect(isReadingRecord(stored)).toBe(true)
      expect(stored.chart).toEqual(original.chart)
    }
  })

  it('保留三种汉字推演明细', () => {
    for (const text of ['明', '工作顺利', '天地玄黄宇宙洪荒日月盈昃']) {
      const derived = deriveHanziSeed(text)
      if (!derived.ok) throw new Error('fixture failed')
      const reading = {
        id: 'A1B2C3', rawLines: derived.rawLines, hanziSeed: derived.seed,
        chart: generateChart({ inputMethod: 'hanzi', rawLines: derived.rawLines }),
      }
      expect(isReadingRecord(JSON.parse(JSON.stringify(reading)))).toBe(true)
    }
  })

  it.each([null, {}, [], 'invalid', { chart: {} }, { rawLines: [7] }])('拒绝不完整记录 %j', (value) => {
    expect(isReadingRecord(value)).toBe(false)
  })

  it('拒绝会导致结果页白屏的嵌套数据损坏', () => {
    const original = record()
    for (const chart of [
      { ...original.chart, calendar: { ...original.chart.calendar, xunKong: null } },
      { ...original.chart, primary: { ...original.chart.primary, record: { upperKey: 'oops' } } },
      { ...original.chart, lines: [null, ...original.chart.lines.slice(1)] },
      { ...original.chart, shensha: [{ name: '贵人', branches: null }] },
    ]) expect(isReadingRecord({ ...original, chart })).toBe(false)
    expect(isReadingRecord({ ...original, hanziSeed: { strategy: 'stroke-count' } })).toBe(false)
  })

  it('拒绝原始爻值与排盘不一致的记录', () => {
    expect(isReadingRecord({ ...record(), rawLines: [7, 7, 7, 7, 7, 7] })).toBe(false)
  })
})
