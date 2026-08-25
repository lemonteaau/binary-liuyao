import { Solar } from 'lunar-typescript'
import { BRANCHES } from '@/data/trigrams'
import { zonedParts } from '@/calendar/solar-lunar'
import { rawLinesFromTrigrams, trigramKeyByRemainder } from '@/features/number/derive'
import type { Branch, LineValue } from '@/types'

export interface TimeSeedInfo {
  yearBranchNumber: number // 1..12（子1）
  lunarMonth: number
  lunarDay: number
  hourBranchNumber: number
  upperSum: number
  totalSum: number
}

/**
 * 时间起卦（梅花式，About 页公开）：
 * 上卦 = (年支数 + 农历月 + 农历日) mod 8
 * 下卦 = (上卦和 + 时支数) mod 8
 * 动爻 = (上卦和 + 时支数) mod 6
 * 余 0：卦取坤，动爻取上爻。农历月取绝对值（闰月按本月数）。
 */
export function deriveTimeSeed(date: Date, timezone: string): {
  seed: TimeSeedInfo
  rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
} {
  const p = zonedParts(date, timezone)
  const solar = Solar.fromYmdHms(p.year, p.month, p.day, p.hour, p.minute, p.second)
  const lunar = solar.getLunar()

  const yearGanzhi = lunar.getYearInGanZhi()
  // 注意：梅花时间卦用农历年支（正月初一换年），非节气年柱
  const yearBranch = yearGanzhi[1] as Branch
  const yearBranchNumber = BRANCHES.indexOf(yearBranch) + 1

  const lunarMonth = Math.abs(lunar.getMonth())
  const lunarDay = lunar.getDay()
  const hourBranchNumber = BRANCHES.indexOf(
    BRANCHES[Math.floor(((p.hour + 1) % 24) / 2)]!,
  ) + 1

  const upperSum = yearBranchNumber + lunarMonth + lunarDay
  const totalSum = upperSum + hourBranchNumber

  const upperRemainder = ((upperSum - 1) % 8) + 1
  const lowerRemainder = ((totalSum - 1) % 8) + 1
  const movingLine = (totalSum - 1) % 6

  return {
    seed: {
      yearBranchNumber,
      lunarMonth,
      lunarDay,
      hourBranchNumber,
      upperSum,
      totalSum,
    },
    rawLines: rawLinesFromTrigrams(
      trigramKeyByRemainder(upperRemainder),
      trigramKeyByRemainder(lowerRemainder),
      movingLine,
    ),
  }
}
