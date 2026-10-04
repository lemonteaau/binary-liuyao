import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import { isXunKong, shenshaPosition } from '@/lib/reading-marks'

describe('神煞所临之处', () => {
  // 火山旅之天风姤：二爻、五爻动；初爻伏父母己卯木，三爻伏官鬼己亥水
  const chart = generateChart({
    inputMethod: 'coin',
    rawLines: [8, 6, 7, 7, 6, 7],
    when: new Date('2025-10-05T12:53:20+08:00'),
    timezone: 'Asia/Shanghai',
  })
  const position = (name: string) => {
    const entry = chart.shensha.find((item) => item.name === name)
    if (!entry) throw new Error(`missing ${name}`)
    return shenshaPosition(entry, chart)
  }

  it('依次列出本卦爻位、伏神与动爻化出的变爻', () => {
    expect(position('贵人')).toBe('四爻 · 三爻伏神 · 二爻变')
    expect(position('劫煞')).toBe('三爻 · 五爻变')
  })

  it('只落在伏神上时也标出', () => {
    expect(position('将星')).toBe('初爻伏神')
  })

  it('卦中都没有时返回 null', () => {
    expect(position('桃花')).toBeNull()
  })

  it('静爻化出的地支不计入', () => {
    // 初爻静：本爻辰、变卦一侧丑，天喜丑不应因静爻的变卦一侧被标出
    expect(position('天喜')).toBeNull()
  })

  it('旬空按日旬判断', () => {
    expect(chart.calendar.xunKong).toEqual(['寅', '卯'])
    expect(isXunKong(chart, '卯')).toBe(true)
    expect(isXunKong(chart, '辰')).toBe(false)
  })
})
