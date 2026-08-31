import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import { formatRawText } from '@/formatters/rawText'

/**
 * 黄金样本 #1 —— PRD §14 完整排盘。
 * 2026-08-24 未时（Asia/Shanghai），坎为水 变 水雷屯（L1× 老阴、L2○ 老阳）。
 * rawLines 自初爻向上：L1=6 L2=9 L3=8 L4=8 L5=7 L6=8
 */
function goldenChart() {
  return generateChart({
    inputMethod: 'entropy',
    rawLines: [6, 9, 8, 8, 7, 8],
    when: new Date('2026-08-24T14:42:37+08:00'),
    timezone: 'Asia/Shanghai',
  })
}

describe('黄金样本 #1：坎为水 → 水雷屯（PRD §14）', () => {
  const chart = goldenChart()

  it('二进制模型一致', () => {
    // 显示串自上而下 L6..L1：0 1 0 0 1 0 → "010010"
    expect(chart.primary.binary).toBe('010010')
    expect(chart.mutationMask.toString(2).padStart(6, '0')).toBe('000011')
    expect(chart.result.binary).toBe('010001')
    expect(chart.primary.bits ^ chart.mutationMask).toBe(chart.result.bits)
  })

  it('本卦变卦与宫位', () => {
    expect(chart.primary.record.kingWenNumber).toBe(29)
    expect(chart.primary.record.chineseName).toBe('坎为水')
    expect(chart.primary.palace).toBe('坎宫')
    expect(chart.primary.attribute).toBe('六冲')
    expect(chart.primary.palaceRank).toBe('首卦')

    expect(chart.result.record.kingWenNumber).toBe(3)
    expect(chart.result.record.chineseName).toBe('水雷屯')
    // 坎宫序：节一世、屯二世
    expect(chart.result.palaceRank).toBe('二世')
  })

  it('历法与旬空', () => {
    expect(chart.calendar.gregorian).toBe('2026-08-24 14:42:37')
    expect(chart.calendar.lunarText).toBe('二〇二六年 七月十二')
    expect(chart.calendar.ganzhi.year).toBe('丙午')
    expect(chart.calendar.ganzhi.month).toBe('丙申')
    expect(chart.calendar.ganzhi.day).toBe('庚午')
    expect(chart.calendar.ganzhi.hour).toBe('癸未') // 未时
    expect(chart.calendar.xunKong).toEqual(['戌', '亥'])
    expect(chart.calendar.hourZhi).toBe('未')
  })

  it('纳甲六亲六神世应逐爻正确', () => {
    const expected = [
      // [六神, 六亲+干支+五行, 世应, 动]
      ['白虎', '子孙戊寅木', null, true],
      ['玄武', '官鬼戊辰土', null, true],
      ['青龙', '妻财戊午火', '应', false],
      ['朱雀', '父母戊申金', null, false],
      ['勾陈', '官鬼戊戌土', null, false],
      ['腾蛇', '兄弟戊子水', '世', false],
    ] as const
    for (let i = 0; i < 6; i++) {
      const line = chart.lines[i]!
      const [spirit, cell, shiYing] = expected[i]!
      expect(line.primary.spirit).toBe(spirit)
      expect(`${line.primary.relation}${line.primary.najia.stem}${line.primary.najia.branch}${line.primary.najia.element}`).toBe(cell)
      expect(line.primary.shiYing).toBe(shiYing)
    }
    // 动爻标记：L1 阴动 ×，L2 阳动 ○
    expect(chart.lines[0]!.mutating).toBe(true)
    expect(chart.lines[0]!.yang).toBe(false)
    expect(chart.lines[1]!.mutating).toBe(true)
    expect(chart.lines[1]!.yang).toBe(true)
  })

  it('变卦各爻纳甲六亲', () => {
    const expected = [
      '兄弟庚子水', // 屯内卦震：子
      '子孙庚寅木',
      '官鬼庚辰土',
      '父母戊申金',
      '官鬼戊戌土',
      '兄弟戊子水',
    ]
    for (let i = 0; i < 6; i++) {
      const line = chart.lines[i]!.result
      const cell = `${line.relation}${line.najia.stem}${line.najia.branch}${line.najia.element}`
      expect(cell).toBe(expected[i])
    }
  })

  it('卦身亥且不上卦', () => {
    expect(chart.guaShen.branch).toBe('亥')
    expect(chart.guaShen.onHexagram).toBe(false)
  })

  it('神煞十三项全部命中（PRD 样本锁定流派）', () => {
    const map = new Map(chart.shensha.map((s) => [s.name, s.branches]))
    expect(map.get('驿马')).toEqual(['申'])
    expect(map.get('桃花')).toEqual(['卯'])
    expect(map.get('日禄')).toEqual(['申'])
    expect(map.get('贵人')).toEqual(['寅', '午']) // 庚辛逢虎马
    expect(map.get('天喜')).toEqual(['丑'])
    expect(map.get('天医')).toEqual(['巳']) // 日支退一位
    expect(map.get('灾煞')).toEqual(['子'])
    expect(map.get('劫煞')).toEqual(['亥'])
    expect(map.get('谋星')).toEqual(['辰'])
    expect(map.get('华盖')).toEqual(['戌'])
    expect(map.get('将星')).toEqual(['午'])
    expect(map.get('文昌')).toEqual(['亥'])
    expect(map.get('羊刃')).toEqual(['酉'])
  })
})

describe('RAW TEXT 格式（黄金快照）', () => {
  it('完整排盘文本与 PRD §14 结构一致', () => {
    const text = formatRawText(goldenChart(), { includeAiInstruction: false })
    expect(text).toMatchSnapshot()
    // 关键行存在性断言（防快照失真）
    expect(text).toContain('起卦方式：电脑起卦')
    expect(text).toContain('公历时间：2026年08月24日 14时42分')
    expect(text).toContain('农历时间：二〇二六年 七月十二日 未时')
    expect(text).toContain('干支：丙午年 丙申月 庚午日 癸未时')
    expect(text).toContain('日空：戌亥')
    expect(text).toContain('驿马—申')
    expect(text).toContain('贵人—寅午')
    expect(text).toContain('卦身：亥')
    expect(text).toContain('本卦：坎为水（坎宫六冲）')
    expect(text).toContain('变卦：水雷屯（坎宫）')
    expect(text).toContain('卦爻：')
    expect(text).not.toContain('自上爻至初爻')
    expect(text).toContain('上爻：腾蛇 兄弟戊子水 世 少阴')
    expect(text).toContain('五爻：勾陈 官鬼戊戌土 少阳')
    expect(text).toContain('三爻：青龙 妻财戊午火 应 少阴')
    expect(text).toContain('二爻：玄武 官鬼戊辰土 老阳动 变 子孙庚寅木')
    expect(text).toContain('初爻：白虎 子孙戊寅木 老阴动 变 兄弟庚子水')
    // 复制文本面向 AI/人类阅读，不应出现二进制
    expect(text).not.toContain('Binary')
    expect(text).not.toMatch(/^[01]{6}$/m)
    expect(text).not.toContain('请根据以上六爻排盘进行分析。')
  })

  it('AI 指令开关生效', () => {
    const text = formatRawText(goldenChart(), {
      includeAiInstruction: true,
      aiInstructionPrompt: '先给结论，再说明依据。',
    })
    expect(text.trimEnd().endsWith('先给结论，再说明依据。')).toBe(true)
  })

  it('AI 指令为空时不附加空白段落', () => {
    const withoutInstruction = formatRawText(goldenChart(), { includeAiInstruction: false })
    const withEmptyInstruction = formatRawText(goldenChart(), {
      includeAiInstruction: true,
      aiInstructionPrompt: '   ',
    })
    expect(withEmptyInstruction).toBe(withoutInstruction)
  })
})
