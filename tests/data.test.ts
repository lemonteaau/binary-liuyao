import { describe, expect, it } from 'vitest'
import { PURE_BITS, HEXAGRAMS, hexagramByBits, hexagramByKingWen } from '@/data/hexagrams'
import { BRANCHES, BRANCH_ELEMENTS, TRIGRAMS, TRIGRAM_KEYS } from '@/data/trigrams'

describe('八卦数据', () => {
  it('八个卦 key 与 bits 一一对应（LSB = 初爻）', () => {
    const bitsSet = new Set(TRIGRAM_KEYS.map((k) => TRIGRAMS[k].bits))
    expect(bitsSet.size).toBe(8)
    // 乾 兑 离 震 巽 坎 艮 坤 → 111 011 101 001 110 010 100 000
    expect(TRIGRAM_KEYS.map((k) => TRIGRAMS[k].bits)).toEqual([7, 3, 5, 1, 6, 2, 4, 0])
  })

  it('地支五行表覆盖十二支', () => {
    expect(BRANCHES).toHaveLength(12)
    for (const b of BRANCHES) expect(BRANCH_ELEMENTS[b]).toBeDefined()
  })

  it('纳甲抽查：乾内甲子寅辰、外壬午申戌', () => {
    const q = TRIGRAMS.qian
    expect(q.inner).toEqual(['子', '寅', '辰'])
    expect(q.outer).toEqual(['午', '申', '戌'])
    expect(q.stemInner).toBe('甲')
    expect(q.stemOuter).toBe('壬')
  })

  it('纳甲抽查：坤内乙未巳卯、外癸丑亥酉', () => {
    const k = TRIGRAMS.kun
    expect(k.inner).toEqual(['未', '巳', '卯'])
    expect(k.outer).toEqual(['丑', '亥', '酉'])
    expect(k.stemOuter).toBe('癸')
  })

  it('纳甲抽查：震与乾同支（庚）', () => {
    expect(TRIGRAMS.zhen.inner).toEqual(['子', '寅', '辰'])
    expect(TRIGRAMS.zhen.stemInner).toBe('庚')
  })
})

describe('六十四卦表', () => {
  it('文王卦序号恰为 1..64 的排列', () => {
    const nums = HEXAGRAMS.map((h) => h.kingWenNumber).sort((a, b) => a - b)
    expect(nums).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
  })

  it('binary bits 无重复（64 个不同卦象）', () => {
    const bitsSet = new Set(HEXAGRAMS.map((h) => h.bits))
    expect(bitsSet.size).toBe(64)
  })

  it('卦名无重复', () => {
    const names = new Set(HEXAGRAMS.map((h) => h.chineseName))
    expect(names.size).toBe(64)
  })

  it('bits ↔ 记录 双向查找', () => {
    const kan = hexagramByKingWen(29)!
    expect(kan.chineseName).toBe('坎为水')
    expect(hexagramByBits(kan.bits)).toBe(kan)
  })

  it('八纯卦 bits 正确', () => {
    for (const k of TRIGRAM_KEYS) {
      const t = TRIGRAMS[k]
      expect(PURE_BITS[k]).toBe((t.bits << 3) | t.bits)
    }
    // 坎为水 = 010010（显示串 MSB 在前 = L6L5L4L3L2L1）
    expect(hexagramByBits(PURE_BITS.kan)!.chineseName).toBe('坎为水')
    expect((PURE_BITS.kan & 63).toString(2).padStart(6, '0')).toBe('010010')
  })
})
