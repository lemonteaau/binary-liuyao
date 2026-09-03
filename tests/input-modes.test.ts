import { describe, expect, it } from 'vitest'
import {
  parseNumberSeed,
  rawLinesFromNumbers,
  splitSingleNumber,
} from '@/features/number/derive'
import { deriveTimeSeed } from '@/features/time/derive'
import { deriveHanziSeed } from '@/features/hanzi/derive'
import { generateChart } from '@/engine'
import { searchHexagrams } from '@/features/hexagram-search/search'
import { formatRawText } from '@/formatters/rawText'

describe('摇币起卦', () => {
  it('六轮铜钱结果可完整排盘并标记输入方式', () => {
    const chart = generateChart({
      inputMethod: 'coin',
      rawLines: [6, 7, 8, 9, 7, 8],
      when: new Date('2026-08-24T06:42:37Z'),
      timezone: 'UTC',
    })
    expect(chart.inputMethod).toBe('coin')
    expect(chart.lines.map((line) => line.value)).toEqual([6, 7, 8, 9, 7, 8])
    expect(formatRawText(chart, { includeAiInstruction: false })).toContain('起卦方式：摇币起卦')
  })
})

describe('数字起卦', () => {
  it('三数规则：8 8 8 → 坤坤、二爻动', () => {
    const r = rawLinesFromNumbers('8 8 8')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.seed.upperRemainder).toBe(8)
    expect(r.seed.lowerRemainder).toBe(8)
    expect(r.seed.movingLine).toBe(1)
  })

  it('种子 0 按余数 0 规则取坤、上爻', () => {
    const r = rawLinesFromNumbers('0 0 0')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.seed.upperRemainder).toBe(8)
    expect(r.seed.lowerRemainder).toBe(8)
    expect(r.seed.movingLine).toBe(5)
    expect(r.rawLines[5]).toBe(6)
  })

  it('PRD 示例：384927 → 拆分后推导合法状态', () => {
    const r = rawLinesFromNumbers('384927')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 384927 → [38, 49, 27]（余数从左到右依次多一位）
    expect(r.seed.numbers).toEqual([38, 49, 27])
    const chart = generateChart({
      inputMethod: 'number',
      rawLines: r.rawLines,
      when: new Date('2026-08-24T06:42:37Z'),
    })
    expect(chart.primary.record.chineseName).toBeTruthy()
    // 动爻 = C mod 6：((27-1)%6) = 2（三爻）
    expect(r.seed.movingLine).toBe(2)
    expect(chart.lines[2]!.mutating).toBe(true)
  })

  it('单数切分：余数从左到右依次多一位', () => {
    expect(splitSingleNumber('12345')).toEqual([12, 34, 5])
    expect(splitSingleNumber('123456')).toEqual([12, 34, 56])
    expect(splitSingleNumber('1234')).toEqual([12, 3, 4])
  })

  it('非法输入拒绝', () => {
    expect(rawLinesFromNumbers('abc').ok).toBe(false)
    expect(rawLinesFromNumbers('').ok).toBe(false)
    expect(rawLinesFromNumbers('12 abc').ok).toBe(false)
    expect(parseNumberSeed('1 2')).not.toBeNull() // 两数合法
  })
})

describe('时间起卦', () => {
  it('黄金样本时刻可推导且能完整排盘', () => {
    const date = new Date('2026-08-24T14:42:37+08:00')
    const { seed, rawLines } = deriveTimeSeed(date, 'Asia/Shanghai')
    // 农历七月十二：年支午=7，月7，日12 → 上卦和 26；未时=8 → 总和 34
    expect(seed.yearBranchNumber).toBe(7)
    expect(seed.lunarMonth).toBe(7)
    expect(seed.lunarDay).toBe(12)
    expect(seed.hourBranchNumber).toBe(8)
    expect(seed.upperSum).toBe(26)
    expect(seed.totalSum).toBe(34)
    // 上卦 26%8=2→兑? (26-1)%8+1=2 兑；下卦 34: (34-1)%8+1=2 兑；动爻 (34-1)%6=3 四爻
    const chart = generateChart({
      inputMethod: 'time',
      rawLines,
      when: date,
      timezone: 'Asia/Shanghai',
    })
    // 兑上兑下 = 兑为泽
    expect(chart.primary.record.chineseName).toBe('兑为泽')
    expect(chart.lines[3]!.mutating).toBe(true)
  })

  it('闰月按本月数处理（2025 闰六月 → 月数 6）', () => {
    const { seed } = deriveTimeSeed(new Date('2025-07-25T12:00:00+08:00'), 'Asia/Shanghai')
    expect(seed.lunarMonth).toBe(6)
  })
})

describe('汉字起卦', () => {
  it('单字按实际字形方向拆分左右或上下部分', () => {
    const horizontal = deriveHanziSeed('部')
    expect(horizontal.ok).toBe(true)
    if (!horizontal.ok) return
    expect(horizontal.seed).toMatchObject({
      strategy: 'single-character',
      upperValue: 8,
      lowerValue: 2,
      movingValue: 10,
      movingLine: 3,
      singleCharacterParts: { layout: 'horizontal' },
    })

    const vertical = deriveHanziSeed('想')
    expect(vertical.ok).toBe(true)
    if (!vertical.ok) return
    expect(vertical.seed).toMatchObject({
      upperValue: 9,
      lowerValue: 4,
      movingValue: 13,
      movingLine: 0,
      singleCharacterParts: { layout: 'vertical' },
    })
  })

  it('2–10 字按前少后多的规则分组并计算笔画', () => {
    const result = deriveHanziSeed('天地人')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.seed).toMatchObject({
      strategy: 'stroke-count',
      upperText: '天',
      lowerText: '地人',
      characterStrokes: [4, 6, 2],
      upperValue: 4,
      lowerValue: 8,
      movingValue: 12,
      upperRemainder: 4,
      lowerRemainder: 8,
      movingLine: 5,
    })
  })

  it('11 字及以上改用字数，不依赖笔画资料', () => {
    const result = deriveHanziSeed('一二三四五六七八九十人')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.seed).toMatchObject({
      strategy: 'character-count',
      upperText: '一二三四五',
      lowerText: '六七八九十人',
      characterStrokes: [],
      upperValue: 5,
      lowerValue: 6,
      movingValue: 11,
      movingLine: 4,
    })
  })

  it('兼容空格、繁体字和扩展区汉字，拒绝其他字符', () => {
    expect(deriveHanziSeed('工作 顺利').ok).toBe(true)
    expect(deriveHanziSeed('漢字').ok).toBe(true)
    expect(deriveHanziSeed('𠮷').ok).toBe(true)
    expect(deriveHanziSeed('工作！').ok).toBe(false)
    expect(deriveHanziSeed('').ok).toBe(false)
  })

  it('生成排盘时保留汉字起卦方式', () => {
    const result = deriveHanziSeed('明')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const chart = generateChart({
      inputMethod: 'hanzi',
      rawLines: result.rawLines,
      when: new Date('2026-08-24T06:42:37Z'),
      timezone: 'UTC',
    })
    expect(formatRawText(chart, { includeAiInstruction: false })).toContain('起卦方式：汉字起卦')
  })
})

describe('卦名起卦', () => {
  it('包含匹配 + 序号匹配 + 空查询返回全部', () => {
    expect(searchHexagrams('坎').map((h) => h.chineseName)).toContain('坎为水')
    expect(searchHexagrams('屯')[0]!.kingWenNumber).toBe(3)
    expect(searchHexagrams('29')[0]!.chineseName).toBe('坎为水')
    expect(searchHexagrams('中孚')[0]!.kingWenNumber).toBe(61)
    expect(searchHexagrams('')).toHaveLength(64)
    expect(searchHexagrams('不存在的东西')).toHaveLength(0)
  })
})
