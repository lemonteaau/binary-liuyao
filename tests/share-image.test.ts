import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import {
  buildShareImageModel,
  SHARE_IMAGE_SITE,
} from '@/lib/share-image'

describe('分享图数据模型', () => {
  const chart = generateChart({
    inputMethod: 'coin',
    rawLines: [6, 9, 8, 8, 7, 8],
    when: new Date('2026-08-24T14:42:37+08:00'),
    timezone: 'Asia/Shanghai',
  })

  it('包含完整历法、双卦、六爻、周易原文、神煞、会话与网站信息', () => {
    const model = buildShareImageModel(chart, { sessionId: 'ABC123', ordinal: 864 })

    expect(model.session).toBe('排盘 ABC123')
    expect(model.ordinal).toBe('全局第 864 次起卦')
    expect(model.subtitle).toBe(`摇币起卦 · ${chart.calendar.gregorian}`)
    expect(model.footer).toBe(SHARE_IMAGE_SITE)
    expect(model.hasMutation).toBe(true)
    expect(model.primary.name).toBe(chart.primary.record.chineseName)
    expect(model.primary.binary).toBe(chart.primary.binary)
    expect(model.result.name).toBe(chart.result.record.chineseName)
    expect(model.mutationMask).toBe('000011')

    expect(model.dates.map((entry) => entry.label)).toEqual(['公历', '农历', '时区'])
    expect(model.dates.find((entry) => entry.label === '时区')?.value).toContain('Asia/Shanghai')
    expect(model.pillars.map((entry) => entry.label)).toEqual(['年柱', '月柱', '日柱', '时柱', '旬空', '卦身'])
    expect(model.pillars.find((entry) => entry.label === '旬空')?.value).toBe('戌亥')

    expect(model.lines).toHaveLength(6)
    expect(model.lines.map((line) => line.name)).toEqual(['上爻', '五爻', '四爻', '三爻', '二爻', '初爻'])
    chart.lines.forEach((line) => {
      const exported = model.lines[5 - line.index]
      const najia = (value: typeof line.primary.najia) => `${value.stem}${value.branch}${value.element}`
      expect(exported?.primary).toMatchObject({ relation: line.primary.relation, najia: najia(line.primary.najia) })
      expect(exported?.result).toMatchObject({ relation: line.result.relation, najia: najia(line.result.najia) })
      expect(exported?.shiYing).toBe(line.primary.shiYing)
    })

    expect(model.classics.primary).toMatchObject({
      label: '本卦',
      name: '坎为水',
      statement: '习坎，有孚维心亨，行有尚。',
    })
    expect(model.classics.primary.lines).toHaveLength(6)
    expect(model.classics.primary.lines.map((line) => line.label)).toEqual([
      '上六', '九五', '六四', '六三', '九二', '初六',
    ])
    expect(model.classics.primary.lines.filter((line) => line.mutating)).toHaveLength(2)
    expect(model.classics.result).toMatchObject({
      label: '变卦',
      name: '水雷屯',
      statement: '元亨，利贞。勿用有攸往，利建侯。',
    })
    expect(model.classics.result?.lines).toHaveLength(6)
    expect(model.classics.result?.lines.some((line) => line.mutating)).toBe(false)

    const expectedShensha = chart.shensha.filter((entry) => entry.branches.length > 0)
    expect(model.shensha.map((entry) => entry.name)).toEqual(expectedShensha.map((entry) => entry.name))
  })

  it('与结果页一致：只给动爻写老阳老阴，标出旬空、翻转位与神煞所临爻位', () => {
    const model = buildShareImageModel(chart)
    const [top, fifth, , , second, first] = model.lines

    // 坎为水：日空戌亥，五爻官鬼戊戌落空；上爻静、二爻与初爻动
    expect(fifth?.primary.kong).toBe(true)
    expect(model.lines.filter((line) => line.primary.kong)).toHaveLength(1)
    expect(top?.moving).toBeNull()
    expect(top?.shiYing).toBe('世')
    expect(second?.moving).toBe('老阳 · 动')
    expect(second?.transform).toBe('回头克')
    expect(first?.moving).toBe('老阴 · 动')
    // 静爻变卦一侧不标旬空
    expect(fifth?.result.kong).toBe(false)

    expect(model.primary.flipped).toEqual([false, false, false, false, true, true])
    expect(model.result.flipped).toEqual(model.primary.flipped)
    expect(model.shensha.find((entry) => entry.name === '驿马')).toEqual({ name: '驿马', branches: '申', position: '四爻' })
    expect(model.shensha.find((entry) => entry.name === '桃花')?.position).toBeNull()
  })

  it('无变爻时不重复原文，并保留乾卦用九', () => {
    const quiet = generateChart({
      inputMethod: 'manual',
      rawLines: [7, 7, 7, 7, 7, 7],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })
    const model = buildShareImageModel(quiet)

    expect(model.hasMutation).toBe(false)
    expect(model.classics.result).toBeNull()
    expect(model.classics.primary.special).toEqual({
      label: '用九',
      text: '见群龙无首，吉。',
      mutating: false,
    })
  })
})
