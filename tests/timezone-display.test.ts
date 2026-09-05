import { describe, expect, it } from 'vitest'
import { formatTimezoneWithOffset, parseGregorianToDate } from '@/lib/timezone-display'

describe('历史排盘的时区名称', () => {
  it('根据记录中的偏移解析绝对时刻，不使用查看者本地时区', () => {
    expect(parseGregorianToDate('2026-08-24 15:42:37', 'UTC+08:00').toISOString())
      .toBe('2026-08-24T07:42:37.000Z')
  })

  it('在纽约夏令时结束的重复 01:30 区分夏令时与标准时', () => {
    const summer = parseGregorianToDate('2026-11-01 01:30:00', 'UTC-04:00')
    const winter = parseGregorianToDate('2026-11-01 01:30:00', 'UTC-05:00')
    expect(winter.getTime() - summer.getTime()).toBe(3600_000)
    expect(formatTimezoneWithOffset('America/New_York', 'UTC-04:00', summer)).toContain('夏令')
    expect(formatTimezoneWithOffset('America/New_York', 'UTC-05:00', winter)).toContain('标准')
  })
})
