import type { LineValue } from '@/types'

export const BIT_COUNT = 6

/** 老阴6 少阳7 少阴8 老阳9 */
export function lineIsYang(value: LineValue): boolean {
  return value === 7 || value === 9
}

export function lineIsMutating(value: LineValue): boolean {
  return value === 6 || value === 9
}

/**
 * 三枚铜钱模拟：每枚正面记 3、反面记 2，合计 6..9。
 * 使用 crypto.getRandomValues，概率天然为 1/8, 3/8, 3/8, 1/8。
 */
function randomBit(): 0 | 1 {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  // 避免模偏差：取一个字节的低 3 位做奇偶即可（单 bit 无偏）
  return (buf[0]! & 1) as 0 | 1
}

/** 单爻三掷，返回传统爻值 6/7/8/9 */
export function tossLineValue(): LineValue {
  const heads = randomBit() + randomBit() + randomBit()
  return (6 + heads) as LineValue
}

/** 完整六爻三掷 */
export function tossRawLines(): [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue] {
  return [
    tossLineValue(), tossLineValue(), tossLineValue(),
    tossLineValue(), tossLineValue(), tossLineValue(),
  ]
}

/** raw lines → primary bits (bit i = 第 i+1 爻) */
export function rawLinesToPrimaryBits(lines: readonly LineValue[]): number {
  let bits = 0
  for (let i = 0; i < BIT_COUNT; i++) {
    if (lineIsYang(lines[i]!)) bits |= 1 << i
  }
  return bits
}

/** raw lines → mutation mask (动爻 = 1) */
export function rawLinesToMutationMask(lines: readonly LineValue[]): number {
  let mask = 0
  for (let i = 0; i < BIT_COUNT; i++) {
    if (lineIsMutating(lines[i]!)) mask |= 1 << i
  }
  return mask
}

export function resultBitsOf(primaryBits: number, mutationMask: number): number {
  return primaryBits ^ mutationMask
}

/** 显示串：MSB 在前，即 "L6 L5 L4 L3 L2 L1" */
export function bitsToString(bits: number): string {
  return (bits & 0b111111).toString(2).padStart(BIT_COUNT, '0')
}

/** "L6L5L4L3L2L1" 显示串 → bits */
export function stringToBits(s: string): number | null {
  if (!/^[01]{6}$/.test(s)) return null
  let bits = 0
  for (let i = 0; i < 6; i++) {
    if (s[5 - i] === '1') bits |= 1 << i
  }
  return bits
}
