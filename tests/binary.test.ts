import { describe, expect, it } from 'vitest'
import {
  bitsToString,
  rawLinesToMutationMask,
  rawLinesToPrimaryBits,
  resultBitsOf,
  stringToBits,
  tossLineValue,
  tossRawLines,
} from '@/engine/binary'
import type { LineValue } from '@/types'

describe('二进制模型', () => {
  it('PRD 示例：primary 010010 XOR mask 001010 = 011000', () => {
    // 显示串 MSB 在前；010010 → L6..L1 = 0,1,0,0,1,0 → bits int 0b010010 = 18
    const primary = stringToBits('010010')!
    const mask = stringToBits('001010')!
    expect(bitsToString(resultBitsOf(primary, mask))).toBe('011000')
  })

  it('显示串与 bits 往返一致', () => {
    for (let v = 0; v < 64; v++) {
      expect(stringToBits(bitsToString(v))).toBe(v)
    }
  })

  it('rawLines 映射：老阴6→阴动 少阳7→阳静 少阴8→阴静 老阳9→阳动', () => {
    const lines: LineValue[] = [6, 7, 8, 9, 7, 8]
    // L1 阴动 L2 阳静 L3 阴静 L4 阳动 L5 阳 L6 阴
    // bits: L1=0 L2=1 L3=0 | L4=1 L5=1 L6=0 → 显示串(L6..L1) "011010"
    expect(rawLinesToPrimaryBits(lines)).toBe(stringToBits('011010'))
    // mask: 动爻 = L1、L4 → 显示串 "001001"
    expect(rawLinesToMutationMask(lines)).toBe(stringToBits('001001'))
    const primary = rawLinesToPrimaryBits(lines)
    expect(bitsToString(resultBitsOf(primary, rawLinesToMutationMask(lines)))).toBe('010011')
  })

  it('静爻在结果中保持不变', () => {
    const lines: LineValue[] = [7, 7, 7, 7, 7, 7]
    const mask = rawLinesToMutationMask(lines)
    expect(mask).toBe(0)
    expect(resultBitsOf(rawLinesToPrimaryBits(lines), mask))
      .toBe(rawLinesToPrimaryBits(lines))
  })
})

describe('加密熵源', () => {
  it('单爻值域 ∈ {6,7,8,9}', () => {
    for (let i = 0; i < 200; i++) {
      expect([6, 7, 8, 9]).toContain(tossLineValue())
    }
  })

  it('三钱概率分布近似 1/8 : 3/8 : 3/8 : 1/8（统计抽样）', () => {
    const N = 24000
    const counts: Record<number, number> = { 6: 0, 7: 0, 8: 0, 9: 0 }
    for (let i = 0; i < N; i++) {
      const v = tossLineValue()
      counts[v] = (counts[v] ?? 0) + 1
    }
    // 期望：6≈N/8, 7≈3N/8, 8≈3N/8, 9≈N/8。宽松界 ±35%
    expect(counts[6]!).toBeGreaterThan(N * 0.08)
    expect(counts[6]!).toBeLessThan(N * 0.17)
    expect(counts[9]!).toBeGreaterThan(N * 0.08)
    expect(counts[9]!).toBeLessThan(N * 0.17)
    expect(counts[7]!).toBeGreaterThan(N * 0.28)
    expect(counts[7]!).toBeLessThan(N * 0.45)
    expect(counts[8]!).toBeGreaterThan(N * 0.28)
    expect(counts[8]!).toBeLessThan(N * 0.45)
  })

  it('六爻批量生成结构正确', () => {
    const lines = tossRawLines()
    expect(lines).toHaveLength(6)
    for (const v of lines) expect([6, 7, 8, 9]).toContain(v)
  })
})
