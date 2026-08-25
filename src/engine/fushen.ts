import { hexagramByBits } from '@/data/hexagrams'
import type { Element, FuShenEntry, SixRelation } from '@/types'
import { najiaForHexagram } from './najia'
import { relationOf } from './six-relations'

/**
 * 伏神：本卦六亲不全时，从本宫首卦对应爻位取所缺六亲。
 * 同一六亲在首卦多处出现时取自下而上的第一个。
 */
export function fuShenOf(
  palaceHeadBits: number,
  palaceElement: Element,
  relationsOnLines: SixRelation[],
): FuShenEntry[] {
  const headRecord = hexagramByBits(palaceHeadBits)
  if (!headRecord) return []
  const headNajia = najiaForHexagram(headRecord)
  const missing = (['父母', '兄弟', '子孙', '妻财', '官鬼'] as SixRelation[])
    .filter((r) => !relationsOnLines.includes(r))

  const entries: FuShenEntry[] = []
  for (const rel of missing) {
    for (let i = 0; i < 6; i++) {
      const najiaHere = headNajia[i]!
      if (relationOf(najiaHere.element, palaceElement) === rel) {
        entries.push({ index: i, relation: rel, najia: najiaHere })
        break
      }
    }
  }
  return entries
}
