import { BRANCH_ELEMENTS, TRIGRAMS } from '@/data/trigrams'
import type { HexagramRecord, NajiaLine } from '@/types'

/**
 * 纳甲：取每爻的天干、地支、五行。
 * 内卦用内卦纳支与纳干，外卦用外卦纳支与纳干（乾甲壬 / 坤乙癸）。
 */
export function najiaForHexagram(record: HexagramRecord): [NajiaLine, NajiaLine, NajiaLine, NajiaLine, NajiaLine, NajiaLine] {
  const lower = TRIGRAMS[record.lowerKey]
  const upper = TRIGRAMS[record.upperKey]
  return [
    { stem: lower.stemInner, branch: lower.inner[0], element: BRANCH_ELEMENTS[lower.inner[0]] },
    { stem: lower.stemInner, branch: lower.inner[1], element: BRANCH_ELEMENTS[lower.inner[1]] },
    { stem: lower.stemInner, branch: lower.inner[2], element: BRANCH_ELEMENTS[lower.inner[2]] },
    { stem: upper.stemOuter, branch: upper.outer[0], element: BRANCH_ELEMENTS[upper.outer[0]] },
    { stem: upper.stemOuter, branch: upper.outer[1], element: BRANCH_ELEMENTS[upper.outer[1]] },
    { stem: upper.stemOuter, branch: upper.outer[2], element: BRANCH_ELEMENTS[upper.outer[2]] },
  ]
}
