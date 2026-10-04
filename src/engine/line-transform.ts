import { generates, overcomes } from '@/data/trigrams'
import type { Branch, ChartLine, LineTransform } from '@/types'

/** 同五行地支前进一位：亥→子、寅→卯、巳→午、申→酉，土为丑→辰→未→戌→丑。 */
const ADVANCE: Partial<Record<Branch, Branch>> = {
  亥: '子', 寅: '卯', 巳: '午', 申: '酉',
  丑: '辰', 辰: '未', 未: '戌', 戌: '丑',
}

export const LINE_TRANSFORM_NOTES: Record<LineTransform, string> = {
  回头生: '变爻五行生本爻',
  回头克: '变爻五行克本爻',
  化进神: '同五行，地支前进一位',
  化退神: '同五行，地支后退一位',
}

/**
 * 动爻与其变爻的关系。只看变爻对本爻的作用（动爻不生克变爻），
 * 未列出的情形（本爻生克变爻、伏吟、同五行非进退等）返回 null。
 */
export function lineTransformOf(line: ChartLine): LineTransform | null {
  if (!line.mutating) return null
  const from = line.primary.najia
  const to = line.result.najia
  if (ADVANCE[from.branch] === to.branch) return '化进神'
  if (ADVANCE[to.branch] === from.branch) return '化退神'
  if (generates(to.element, from.element)) return '回头生'
  if (overcomes(to.element, from.element)) return '回头克'
  return null
}
