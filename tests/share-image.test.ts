import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import {
  buildShareImageModel,
  SHARE_IMAGE_SITE,
} from '@/lib/share-image'

describe('分享图数据模型', () => {
  it('包含完整历法、双卦、六爻、神煞、会话与网站信息', () => {
    const chart = generateChart({
      inputMethod: 'coin',
      rawLines: [6, 9, 8, 8, 7, 8],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })
    const model = buildShareImageModel(chart, { sessionId: 'ABC123', ordinal: 864 })

    expect(model.session).toBe('排盘 ABC123')
    expect(model.ordinal).toBe('全局第 864 次起卦')
    expect(model.footer).toBe(SHARE_IMAGE_SITE)
    expect(model.primary.name).toBe(chart.primary.record.chineseName)
    expect(model.primary.binary).toBe(chart.primary.binary)
    expect(model.result.name).toBe(chart.result.record.chineseName)
    expect(model.mutationMask).toBe('000011')

    expect(model.metadata.map((entry) => entry.label)).toEqual([
      '起卦方式',
      '公历',
      '农历',
      '时区',
      '干支',
      '旬空',
      '卦身',
    ])
    expect(model.metadata.find((entry) => entry.label === '时区')?.value)
      .toContain('Asia/Shanghai')

    expect(model.lines).toHaveLength(6)
    expect(model.lines.map((line) => line.name)).toEqual(['六爻', '五爻', '四爻', '三爻', '二爻', '初爻'])
    chart.lines.forEach((line) => {
      const exported = model.lines[5 - line.index]
      expect(exported?.primary).toContain(line.primary.relation)
      expect(exported?.primary).toContain(`${line.primary.najia.stem}${line.primary.najia.branch}${line.primary.najia.element}`)
      expect(exported?.result).toContain(line.result.relation)
      expect(exported?.result).toContain(`${line.result.najia.stem}${line.result.najia.branch}${line.result.najia.element}`)
    })

    const expectedShensha = chart.shensha.filter((entry) => entry.branches.length > 0)
    expect(model.shensha).toHaveLength(expectedShensha.length)
    expectedShensha.forEach((entry) => {
      expect(model.shensha).toContain(`${entry.name} · ${entry.branches.join('')}`)
    })
  })
})
