import type { SixSpirit, Stem } from '@/types'

/** 自初爻向上：青龙 → 朱雀 → 勾陈 → 腾蛇 → 白虎 → 玄武 */
const ORDER: readonly SixSpirit[] = ['青龙', '朱雀', '勾陈', '腾蛇', '白虎', '玄武']

const START_INDEX: Record<Stem, number> = {
  甲: 0, 乙: 0,
  丙: 1, 丁: 1,
  戊: 2,
  己: 3,
  庚: 4, 辛: 4,
  壬: 5, 癸: 5,
}

/** 按日干排六神，返回 L1..L6（index 0 = 初爻） */
export function sixSpiritsOf(dayStem: Stem): [SixSpirit, SixSpirit, SixSpirit, SixSpirit, SixSpirit, SixSpirit] {
  const start = START_INDEX[dayStem]
  return [0, 1, 2, 3, 4, 5].map((i) => ORDER[(start + i) % 6]) as [
    SixSpirit, SixSpirit, SixSpirit, SixSpirit, SixSpirit, SixSpirit,
  ]
}
