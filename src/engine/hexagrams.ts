import { hexagramByBits } from '@/data/hexagrams'
import { TRIGRAMS, type TrigramKey } from '@/data/trigrams'
import type { Branch, HexStateInfo, PalaceRank } from '@/types'
import { najiaForHexagram } from './najia'

/**
 * 京房八宫：每宫自首卦起，按 一世→二世→三世→四世→五世→游魂→归魂 变爻。
 * 相对首卦的翻转掩码（bit i = 第 i+1 爻）：
 *   首卦 000000 / 一世 000001 / 二世 000011 / 三世 000111
 *   四世 001111 / 五世 011111 / 游魂 010111(四爻复原) / 归魂 010000(内卦复原)
 */
const RANK_NAMES: readonly PalaceRank[] = [
  '首卦', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂',
]

const RANK_MASKS: readonly number[] = [0b000000, 0b000001, 0b000011, 0b000111, 0b001111, 0b011111, 0b010111, 0b010000]

export interface PalacePlacement {
  palaceKey: TrigramKey
  /** 0..7 对应 RANK_NAMES */
  rank: number
}

const PLACEMENT = new Map<number, PalacePlacement>()
for (const key of Object.keys(TRIGRAMS) as TrigramKey[]) {
  const headBits = (TRIGRAMS[key].bits << 3) | TRIGRAMS[key].bits
  for (let r = 0; r < 8; r++) {
    PLACEMENT.set(headBits ^ RANK_MASKS[r]!, { palaceKey: key, rank: r })
  }
}

/** 宫位与卦别（64 卦恰好各属一宫一别） */
export function placementOf(bits: number): PalacePlacement {
  const p = PLACEMENT.get(bits)
  if (!p) throw new Error(`no palace placement for bits ${bits}`)
  return p
}

const CHONG_PAIR_OFFSET = 6 // 子午 丑未 寅申 卯酉 辰戌 巳亥

const LIUHE_PAIRS = new Set<string>(['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'])

function pairClashes(a: Branch, b: Branch): boolean {
  const ia = BRANCH_INDEX[a]!
  const ib = BRANCH_INDEX[b]!
  return Math.abs(ia - ib) === CHONG_PAIR_OFFSET
}

function pairCombines(a: Branch, b: Branch): boolean {
  return LIUHE_PAIRS.has(a + b) || LIUHE_PAIRS.has(b + a)
}

const BRANCH_INDEX: Record<Branch, number> = {
  子: 0, 丑: 1, 寅: 2, 卯: 3, 辰: 4, 巳: 5,
  午: 6, 未: 7, 申: 8, 酉: 9, 戌: 10, 亥: 11,
}

/** 由纳甲地支推导六冲/六合（初四、二五、三上 三对） */
function attributeOf(bits: number): '六冲' | '六合' | null {
  const record = hexagramByBits(bits)
  if (!record) return null
  const najia = najiaForHexagram(record)
  let chong = 0
  let he = 0
  for (let i = 0; i < 3; i++) {
    const a = najia[i]!.branch
    const b = najia[i + 3]!.branch
    if (pairClashes(a, b)) chong++
    if (pairCombines(a, b)) he++
  }
  if (chong === 3) return '六冲'
  if (he === 3) return '六合'
  return null
}

export function hexStateInfoOf(bits: number): HexStateInfo {
  const record = hexagramByBits(bits)
  if (!record) throw new Error(`no hexagram for bits ${bits}`)
  const { palaceKey, rank } = placementOf(bits)
  return {
    bits,
    binary: (bits & 0b111111).toString(2).padStart(6, '0'),
    record,
    palace: `${TRIGRAMS[palaceKey].name}宫`,
    palaceRank: RANK_NAMES[rank]!,
    attribute: attributeOf(bits),
  }
}

/** 世爻位置（0-based）。游魂卦即四世。归魂世在三爻。 */
export function shiPositionOf(rank: number): number {
  const shiByRank: Record<number, number> = { 0: 5, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 3, 7: 2 }
  return shiByRank[rank]!
}

export function shiYingOf(rank: number): { shi: number; ying: number } {
  const shi = shiPositionOf(rank)
  return { shi, ying: (shi + 3) % 6 }
}
