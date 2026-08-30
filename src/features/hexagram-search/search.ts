import { HEXAGRAMS } from '@/data/hexagrams'
import type { HexagramRecord, LineValue } from '@/types'

/**
 * 按卦名选择本卦（SELECT PRIMARY HEXAGRAM）：
 * 支持中文名包含匹配、核心卦名匹配、文王序号精确匹配。
 */
export function searchHexagrams(query: string): HexagramRecord[] {
  const q = query.trim()
  if (q === '') return HEXAGRAMS
  if (/^\d{1,2}$/.test(q)) {
    const byNumber = HEXAGRAMS.find((h) => h.kingWenNumber === Number(q))
    if (byNumber) return [byNumber]
  }
  return HEXAGRAMS.filter(
    (h) => h.chineseName.includes(q) || h.shortName.includes(q),
  )
}

/** 由卦记录构造无动爻 rawLines */
export function rawLinesFromRecord(record: HexagramRecord):
  [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] {
  return [0, 1, 2, 3, 4, 5].map((i) => ((record.bits >> i) & 1 ? 7 : 8)) as [
    LineValue, LineValue, LineValue, LineValue, LineValue, LineValue,
  ]
}
