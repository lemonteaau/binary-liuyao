import { TRIGRAMS, TRIGRAM_KEYS } from '@/data/trigrams'
import type { LineValue } from '@/types'

/**
 * 数字起卦规则（About 页公开）：
 * - 三个数 A B C：上卦 = A mod 8，下卦 = B mod 8，动爻 = C mod 6
 * - 两个数 A B：上卦 = A mod 8，下卦 = B mod 8，动爻 = (A+B) mod 6
 * - 一个数 N：按位自左向右切成三组（余数从左到右依次多一位）后同三数规则
 * - 余 0：卦取坤（8），动爻取上爻（6）
 */
export function splitSingleNumber(digits: string): [number, number, number] | null {
  if (!/^\d+$/.test(digits) || digits.length < 3) return null
  const n = digits.length
  const base = Math.floor(n / 3)
  const rem = n % 3
  const sizes = [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base]
  let offset = 0
  const parts = sizes.map((size) => {
    const part = Number(digits.slice(offset, offset + size))
    offset += size
    return part
  })
  return parts as [number, number, number]
}

export interface ParsedNumberSeed {
  numbers: [number, number, number]
  upperRemainder: number // 1..8
  lowerRemainder: number
  movingLine: number // 0..5
}

function remainderOrBase(value: number, base: number): number {
  const remainder = value % base
  return remainder === 0 ? base : remainder
}

export function parseNumberSeed(input: string): ParsedNumberSeed | null {
  const tokens = input.trim().split(/[\s,，、]+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 3) return null
  if (!tokens.every((t) => /^\d+$/.test(t))) return null

  let nums: [number, number, number]
  if (tokens.length === 1) {
    const split = splitSingleNumber(tokens[0]!)
    if (!split) return null
    nums = split
  } else if (tokens.length === 2) {
    const [a, b] = tokens as [string, string]
    nums = [Number(a), Number(b), Number(a) + Number(b)]
  } else {
    nums = [Number(tokens[0]), Number(tokens[1]), Number(tokens[2])]
  }

  if (!nums.every(Number.isSafeInteger)) return null

  const upperRemainder = remainderOrBase(nums[0], 8)
  const lowerRemainder = remainderOrBase(nums[1], 8)
  const movingLine = remainderOrBase(nums[2], 6) - 1

  return { numbers: nums, upperRemainder, lowerRemainder, movingLine }
}

/** 余数 1..8 → 卦（乾1 兑2 离3 震4 巽5 坎6 艮7 坤8），0 视作 8 */
export function trigramKeyByRemainder(remainder: number): string {
  const idx = ((remainder - 1) % 8 + 8) % 8
  return TRIGRAM_KEYS[idx]!
}

/** 由上下卦与动爻构造六爻 rawLines；动爻按老阴/老阳标记 */
export function rawLinesFromTrigrams(
  upperKey: string,
  lowerKey: string,
  movingLine: number,
): [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] {
  const upperBits = TRIGRAMS[upperKey as keyof typeof TRIGRAMS].bits
  const lowerBits = TRIGRAMS[lowerKey as keyof typeof TRIGRAMS].bits
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const yang = i < 3 ? (lowerBits >> i) & 1 : (upperBits >> (i - 3)) & 1
    if (i === movingLine) return yang ? 9 : 6
    return yang ? 7 : 8
  }) as [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
}

/** 数字输入 → 六爻 */
export function rawLinesFromNumbers(input: string):
  | { ok: true; seed: ParsedNumberSeed; rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] }
  | { ok: false; error: 'INVALID_SEED' } {
  const seed = parseNumberSeed(input)
  if (!seed) return { ok: false, error: 'INVALID_SEED' }
  const upperKey = trigramKeyByRemainder(seed.upperRemainder)
  const lowerKey = trigramKeyByRemainder(seed.lowerRemainder)
  return { ok: true, seed, rawLines: rawLinesFromTrigrams(upperKey, lowerKey, seed.movingLine) }
}
