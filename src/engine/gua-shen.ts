import { BRANCHES } from '@/data/trigrams'
import type { Branch } from '@/types'

/**
 * 卦身：阳世从子起、阴世从午起，数至世爻（世在初爻即起始支本身）。
 */
export function guaShenOf(shiPosition: number, shiYang: boolean): Branch {
  const start = shiYang ? 0 : 6 // 子 / 午
  return BRANCHES[(start + shiPosition) % 12]!
}
