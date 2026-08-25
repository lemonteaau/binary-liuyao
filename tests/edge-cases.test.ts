import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import { buildCalendar } from '@/calendar/solar-lunar'
import type { LineValue } from '@/types'

function chart(
  lines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue],
  iso: string,
  timezone = 'Asia/Shanghai',
) {
  return generateChart({
    inputMethod: 'manual',
    rawLines: lines,
    when: new Date(iso),
    timezone,
  })
}

describe('边界样本', () => {
  it('全阴无动 → 坤为地 六冲 结果不变', () => {
    const c = chart([8, 8, 8, 8, 8, 8], '2026-08-24T12:00:00+08:00')
    expect(c.primary.record.chineseName).toBe('坤为地')
    expect(c.primary.binary).toBe('000000')
    expect(c.mutationMask).toBe(0)
    expect(c.result.bits).toBe(c.primary.bits)
    expect(c.primary.attribute).toBe('六冲')
  })

  it('全阳全动 → 乾为地? 不，乾为天 变 坤为地', () => {
    const c = chart([9, 9, 9, 9, 9, 9], '2026-08-24T12:00:00+08:00')
    expect(c.primary.record.chineseName).toBe('乾为天')
    expect(c.primary.attribute).toBe('六冲')
    expect(c.result.record.chineseName).toBe('坤为地')
    // 乾宫首卦世在上爻
    expect(c.lines[5]!.primary.shiYing).toBe('世')
    expect(c.lines[2]!.primary.shiYing).toBe('应')
  })

  it('单爻动：泽火革 四爻老阳独发 → 水火既济', () => {
    // 革 = 兑上离下，坎宫四世；L4 独发只变外卦 兑→坎
    const c = chart([7, 8, 7, 9, 7, 8], '2026-08-24T12:00:00+08:00')
    expect(c.primary.record.chineseName).toBe('泽火革')
    expect(c.mutationMask.toString(2).padStart(6, '0')).toBe('001000')
    expect(c.result.record.chineseName).toBe('水火既济')
    expect(c.primary.palace).toBe('坎宫')
    expect(c.primary.palaceRank).toBe('四世')
    expect(c.lines[3]!.primary.shiYing).toBe('世') // 四世世在四爻
  })

  it('伏神：天风姤（乾宫一世）缺妻财，伏妻财甲寅木于二爻位', () => {
    // 经典案例：姤卦六亲缺妻财，取乾宫首卦二爻甲寅木为伏神
    // 姤 = 乾上巽下：仅初爻阴
    const c = chart([8, 7, 7, 7, 7, 7], '2026-08-24T12:00:00+08:00')
    expect(c.primary.record.chineseName).toBe('天风姤')
    expect(c.primary.palace).toBe('乾宫')
    expect(c.primary.palaceRank).toBe('一世')
    expect(c.fuShen).toHaveLength(1)
    const fu = c.fuShen[0]!
    expect(fu.relation).toBe('妻财')
    expect(`${fu.najia.stem}${fu.najia.branch}${fu.najia.element}`).toBe('甲寅木')
    expect(fu.index).toBe(1)
  })

  it('晚子时（23:30）日柱按次日（sect=1）且时柱入子', () => {
    const cal = buildCalendar(new Date('2026-08-24T23:30:00+08:00'), 'Asia/Shanghai')
    expect(cal.ganzhi.day).toBe('辛未') // 次日日柱
    expect(cal.ganzhi.hour.endsWith('子')).toBe(true)
    expect(cal.hourZhi).toBe('子')
  })

  it('DST 时区 Australia/Adelaide 夏令时 UTC+10:30', () => {
    const cal = buildCalendar(new Date('2026-01-15T01:30:00Z'), 'Australia/Adelaide')
    expect(cal.gregorian).toBe('2026-01-15 12:00:00')
    expect(cal.utcOffset).toBe('UTC+10:30')
  })

  it('DST 切换后 Adelaide 标准时 UTC+09:30', () => {
    const cal = buildCalendar(new Date('2026-06-15T01:30:00Z'), 'Australia/Adelaide')
    expect(cal.utcOffset).toBe('UTC+09:30')
  })

  it('闰月显示「闰六」', () => {
    const cal = buildCalendar(new Date('2025-07-25T12:00:00+08:00'), 'Asia/Shanghai')
    expect(cal.lunarText).toContain('闰六')
  })

  it('农历新年边界：2026-02-17 为正月初一', () => {
    const cal = buildCalendar(new Date('2026-02-17T12:00:00+08:00'), 'Asia/Shanghai')
    expect(cal.lunarText).toContain('正月')
    expect(cal.lunarText).toContain('初一')
  })

  it('跨年立春界：立春前后年柱切换', () => {
    const before = buildCalendar(new Date('2026-02-01T12:00:00+08:00'), 'Asia/Shanghai')
    const after = buildCalendar(new Date('2026-03-01T12:00:00+08:00'), 'Asia/Shanghai')
    expect(before.ganzhi.year).toBe('乙巳')
    expect(after.ganzhi.year).toBe('丙午')
  })

  it('跨月跨日：干支逐月逐日推进', () => {
    const d1 = buildCalendar(new Date('2026-07-01T12:00:00+08:00'), 'Asia/Shanghai')
    const d2 = buildCalendar(new Date('2026-08-24T14:42:37+08:00'), 'Asia/Shanghai')
    expect(d1.ganzhi.month).not.toBe(d2.ganzhi.month)
    expect(d1.gregorian.slice(0, 10)).toBe('2026-07-01')
  })
})
