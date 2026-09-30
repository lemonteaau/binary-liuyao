import { TRIGRAMS, TRIGRAM_KEYS } from '@/data/trigrams'
import type { LineValue } from '@/types'

/**
 * 数字起卦（About 页公开），规则与常见六爻排盘软件一致：
 * - 只报一个数：按位分成前后两半，位数为奇数时后半多一位；前半各位之和定上卦，
 *   后半各位之和定下卦，两者相加定动爻。只有一位数时，上卦、下卦、动爻都取这个数。
 * - 报两个数：第一个数定上卦，第二个数定下卦，两数之和定动爻。
 * - 报三个数：依次定上卦、下卦、动爻。
 * - 上下卦除以 8、动爻除以 6 取余；余 0 时卦取坤（8），动爻取上爻（6）。
 * 每个数单独输入，手机数字键盘即可完成。数字不限长度：用 BigInt 计算。
 */
export const NUMBER_SEED_FIELDS = 3

export type NumberSeedStrategy = 'one-number' | 'two-numbers' | 'three-numbers'

export type NumberSeedIssue =
  | { error: 'EMPTY' }
  | { error: 'NOT_DIGITS'; field: number }
  | { error: 'SKIPPED'; field: number }

export interface NumberSeedPart {
  /** 算式，如 3+8+4；直接取数时就是数本身 */
  formula: string
  value: bigint
}

export interface ParsedNumberSeed {
  strategy: NumberSeedStrategy
  upper: NumberSeedPart
  lower: NumberSeedPart
  moving: NumberSeedPart
  upperRemainder: number // 1..8
  lowerRemainder: number
  movingLine: number // 0..5
}

const NUMBER_SEPARATORS = /[\s,，、.。·\-/]+/

/** 清理单个输入：全角转半角、去掉空白；非纯数字返回 null */
export function normalizeNumberField(input: string): string | null {
  const digits = input.normalize('NFKC').replace(/\s+/g, '')
  return /^\d*$/.test(digits) ? digits : null
}

/** 粘贴 128 64 32 这类整串时拆成多个数，用来分到后面的输入框 */
export function splitPastedNumbers(input: string): string[] {
  return input.normalize('NFKC').split(NUMBER_SEPARATORS).filter(Boolean)
}

function remainderOrBase(value: bigint, base: number): number {
  const remainder = Number(value % BigInt(base))
  return remainder === 0 ? base : remainder
}

function numberPart(digits: string): NumberSeedPart {
  const value = BigInt(digits)
  return { formula: value.toString(), value }
}

function digitSumPart(digits: string): NumberSeedPart {
  const list = [...digits]
  return {
    formula: list.join('+'),
    value: list.reduce((total, digit) => total + BigInt(digit), BigInt(0)),
  }
}

function sumPart(a: NumberSeedPart, b: NumberSeedPart): NumberSeedPart {
  return { formula: `${a.value}+${b.value}`, value: a.value + b.value }
}

export function parseNumberSeed(inputs: readonly string[]):
  | { ok: true; seed: ParsedNumberSeed }
  | ({ ok: false } & NumberSeedIssue) {
  const fields: string[] = []
  for (let i = 0; i < NUMBER_SEED_FIELDS; i++) {
    const digits = normalizeNumberField(inputs[i] ?? '')
    if (digits === null) return { ok: false, error: 'NOT_DIGITS', field: i }
    fields.push(digits)
  }
  const count = fields.filter(Boolean).length
  if (count === 0) return { ok: false, error: 'EMPTY' }
  const skipped = fields.findIndex((digits, i) => !digits && fields.slice(i + 1).some(Boolean))
  if (skipped >= 0) return { ok: false, error: 'SKIPPED', field: skipped }

  let strategy: NumberSeedStrategy
  let upper: NumberSeedPart
  let lower: NumberSeedPart
  let moving: NumberSeedPart
  if (count === 1) {
    const digits = fields[0]!
    strategy = 'one-number'
    if (digits.length === 1) {
      upper = lower = moving = numberPart(digits)
    } else {
      const splitIndex = Math.floor(digits.length / 2)
      upper = digitSumPart(digits.slice(0, splitIndex))
      lower = digitSumPart(digits.slice(splitIndex))
      moving = sumPart(upper, lower)
    }
  } else if (count === 2) {
    strategy = 'two-numbers'
    upper = numberPart(fields[0]!)
    lower = numberPart(fields[1]!)
    moving = sumPart(upper, lower)
  } else {
    strategy = 'three-numbers'
    upper = numberPart(fields[0]!)
    lower = numberPart(fields[1]!)
    moving = numberPart(fields[2]!)
  }

  return {
    ok: true,
    seed: {
      strategy,
      upper,
      lower,
      moving,
      upperRemainder: remainderOrBase(upper.value, 8),
      lowerRemainder: remainderOrBase(lower.value, 8),
      movingLine: remainderOrBase(moving.value, 6) - 1,
    },
  }
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
export function rawLinesFromNumbers(inputs: readonly string[]):
  | { ok: true; seed: ParsedNumberSeed; rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] }
  | ({ ok: false } & NumberSeedIssue) {
  const parsed = parseNumberSeed(inputs)
  if (!parsed.ok) return parsed
  const { seed } = parsed
  const upperKey = trigramKeyByRemainder(seed.upperRemainder)
  const lowerKey = trigramKeyByRemainder(seed.lowerRemainder)
  return { ok: true, seed, rawLines: rawLinesFromTrigrams(upperKey, lowerKey, seed.movingLine) }
}
