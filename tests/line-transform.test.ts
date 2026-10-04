import { describe, expect, it } from 'vitest'
import { generateChart, lineTransformOf } from '@/engine'
import { formatRawText } from '@/formatters/rawText'
import type { Branch, ChartLine, Element } from '@/types'

function mutatingLine(from: [Branch, Element], to: [Branch, Element]): ChartLine {
  return {
    index: 0,
    value: 9,
    yang: true,
    mutating: true,
    primary: { najia: { stem: '甲', branch: from[0], element: from[1] }, relation: '兄弟', shiYing: null },
    result: { najia: { stem: '甲', branch: to[0], element: to[1] }, relation: '兄弟' },
  }
}

describe('lineTransformOf 动爻与变爻的关系', () => {
  it('变爻生本爻为回头生，克本爻为回头克', () => {
    expect(lineTransformOf(mutatingLine(['寅', '木'], ['子', '水']))).toBe('回头生')
    expect(lineTransformOf(mutatingLine(['丑', '土'], ['寅', '木']))).toBe('回头克')
  })

  it('本爻生克变爻不标注', () => {
    expect(lineTransformOf(mutatingLine(['戌', '土'], ['子', '水']))).toBeNull()
    expect(lineTransformOf(mutatingLine(['午', '火'], ['申', '金']))).toBeNull()
    expect(lineTransformOf(mutatingLine(['子', '水'], ['寅', '木']))).toBeNull()
  })

  it('同五行地支进一位为化进神，退一位为化退神', () => {
    expect(lineTransformOf(mutatingLine(['亥', '水'], ['子', '水']))).toBe('化进神')
    expect(lineTransformOf(mutatingLine(['戌', '土'], ['丑', '土']))).toBe('化进神')
    expect(lineTransformOf(mutatingLine(['卯', '木'], ['寅', '木']))).toBe('化退神')
    expect(lineTransformOf(mutatingLine(['辰', '土'], ['丑', '土']))).toBe('化退神')
  })

  it('同五行但非进退（如辰化戌、子化子）不标注', () => {
    expect(lineTransformOf(mutatingLine(['辰', '土'], ['戌', '土']))).toBeNull()
    expect(lineTransformOf(mutatingLine(['子', '水'], ['子', '水']))).toBeNull()
  })

  it('静爻不标注', () => {
    expect(lineTransformOf({ ...mutatingLine(['丑', '土'], ['寅', '木']), mutating: false, value: 7 })).toBeNull()
  })

  it('复制文本在变爻后注明关系（反馈例：天火同人变水天需）', () => {
    // 同人：初爻至上爻 阳阴阳阳阳阳；动上爻、四爻、二爻
    const chart = generateChart({
      inputMethod: 'manual',
      rawLines: [7, 6, 7, 9, 7, 9],
      when: new Date('2026-10-04T15:30:00+08:00'),
      timezone: 'Asia/Shanghai',
    })
    expect(chart.primary.record.chineseName).toBe('天火同人')
    expect(chart.result.record.chineseName).toBe('水天需')
    const text = formatRawText(chart, { includeAiInstruction: false })
    expect(text).toContain('变 父母甲寅木（回头克）')
    expect(text).toContain('变 官鬼戊子水\n')
    expect(text).toMatch(/变 妻财戊申金\n/)
  })
})
