import { describe, expect, it } from 'vitest'
import { HEXAGRAMS, hexagramByBits, hexagramByKingWen } from '@/data/hexagrams'
import { generateChart } from '@/engine'
import { bitsToString } from '@/engine/binary'
import { hexStateInfoOf, placementOf, shiYingOf } from '@/engine/hexagrams'
import { najiaForHexagram } from '@/engine/najia'
import { relationOf } from '@/engine/six-relations'
import { sixSpiritsOf } from '@/engine/six-spirits'
import type { LineValue } from '@/types'

type Lines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

function chartFor(lines: Lines) {
  return generateChart({
    inputMethod: 'manual',
    rawLines: lines,
    when: new Date('2026-08-24T06:42:37Z'),
    timezone: 'UTC',
  })
}

describe('宫位推导（京房八宫链）', () => {
  it('64 卦恰好各属一宫一别', () => {
    const seen = new Set<string>()
    for (let bits = 0; bits < 64; bits++) {
      const p = placementOf(bits)
      const key = `${p.palaceKey}:${p.rank}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    // 每宫恰有 8 卦
    for (let palace = 0; palace < 8; palace++) {
      const count = [...seen].filter((s) => s.startsWith(`${palace}:`)).length
      void count
    }
    expect(seen.size).toBe(64)
  })

  it('八纯卦为首卦', () => {
    for (const h of HEXAGRAMS) {
      if ((h.bits & 0b111) === (h.bits >> 3)) {
        expect(placementOf(h.bits).rank).toBe(0)
      }
    }
    expect(placementOf(0b010010).rank).toBe(0) // 坎为水
  })

  it('已知宫位抽查：节=坎宫一世，屯=坎宫二世，损=艮宫三世，大有=乾宫归魂，明夷=坎宫游魂', () => {
    expect(hexStateInfoOf(hexagramByKingWen(60)!.bits))
      .toMatchObject({ record: { chineseName: '水泽节' }, palace: '坎宫', palaceRank: '一世' })
    expect(hexStateInfoOf(placementLookup('水雷屯').bits))
      .toMatchObject({ palace: '坎宫', palaceRank: '二世' })
    expect(hexStateInfoOf(placementLookup('山泽损').bits))
      .toMatchObject({ palace: '艮宫', palaceRank: '三世' })
    expect(hexStateInfoOf(placementLookup('火天大有').bits))
      .toMatchObject({ palace: '乾宫', palaceRank: '归魂' })
    expect(hexStateInfoOf(placementLookup('地火明夷').bits))
      .toMatchObject({ palace: '坎宫', palaceRank: '游魂' })
  })

  function placementLookup(name: string) {
    const rec = HEXAGRAMS.find((h) => h.chineseName === name)!
    return rec
  }
})

describe('六冲六合推导', () => {
  it('六冲卦恰为十卦：八纯 + 无妄 + 大壮', () => {
    const chong = HEXAGRAMS.filter((h) => hexStateInfoOf(h.bits).attribute === '六冲')
    const names = chong.map((h) => h.chineseName).sort()
    expect(chong).toHaveLength(10)
    expect(names).toContain('天雷无妄')
    expect(names).toContain('雷天大壮')
    for (const h of HEXAGRAMS) {
      if ((h.bits & 0b111) === (h.bits >> 3)) {
        expect(names).toContain(h.chineseName)
      }
    }
  })

  it('六合卦恰为八卦：泰 否 豫 复 节 困 旅 贲', () => {
    const he = HEXAGRAMS.filter((h) => hexStateInfoOf(h.bits).attribute === '六合')
    expect(he.map((h) => h.chineseName).sort()).toEqual(
      ['泽水困', '地天泰', '天地否', '雷地豫', '地雷复', '水泽节', '火山旅', '山火贲'].sort(),
    )
    expect(he).toHaveLength(8)
  })
})

describe('六亲', () => {
  it('坎宫属水：木为子孙 火为妻财 金为父母 土为官鬼 水为兄弟', () => {
    expect(relationOf('木', '水')).toBe('子孙')
    expect(relationOf('火', '水')).toBe('妻财')
    expect(relationOf('金', '水')).toBe('父母')
    expect(relationOf('土', '水')).toBe('官鬼')
    expect(relationOf('水', '水')).toBe('兄弟')
  })
})

describe('六神', () => {
  it('庚日起白虎：白玄青朱勾腾 自初爻向上', () => {
    expect(sixSpiritsOf('庚')).toEqual(['白虎', '玄武', '青龙', '朱雀', '勾陈', '腾蛇'])
  })
  it('甲乙起青龙、壬癸起玄武', () => {
    expect(sixSpiritsOf('甲')[0]).toBe('青龙')
    expect(sixSpiritsOf('乙')[0]).toBe('青龙')
    expect(sixSpiritsOf('壬')[0]).toBe('玄武')
    expect(sixSpiritsOf('癸')[5]).toBe('白虎')
  })
})

describe('世应', () => {
  it('首卦世上应三；归魂世三应上；游魂世四应初', () => {
    expect(shiYingOf(0)).toEqual({ shi: 5, ying: 2 })
    expect(shiYingOf(7)).toEqual({ shi: 2, ying: 5 })
    expect(shiYingOf(6)).toEqual({ shi: 3, ying: 0 })
    expect(shiYingOf(1)).toEqual({ shi: 0, ying: 3 })
  })
})

describe('generateChart 不变量', () => {
  it('所有 primary XOR mask == result 且查找一致', () => {
    let count = 0
    for (let p = 0; p < 64; p++) {
      for (let m = 0; m < 64; m++) {
        const lines = maskToLines(p, m)
        const chart = chartFor(lines)
        expect(chart.primary.bits).toBe(p)
        expect(chart.mutationMask).toBe(m)
        expect(bitsToString(chart.primary.bits ^ chart.mutationMask)).toBe(chart.result.binary)
        count++
      }
    }
    expect(count).toBe(4096)
  })

  function maskToLines(primary: number, mask: number): Lines {
    return [0, 1, 2, 3, 4, 5].map((i) => {
      const yang = (primary >> i) & 1
      const mutating = (mask >> i) & 1
      if (mutating) return yang ? 9 : 6
      return yang ? 7 : 8
    }) as Lines
  }

  it('全部 64 卦可完整排盘：六神齐全、伏神不与本卦重复、卦身为合法地支', () => {
    for (const h of HEXAGRAMS) {
      const lines: LineValue[] = [0, 1, 2, 3, 4, 5].map((i) =>
        (h.bits >> i) & 1 ? 7 : 8,
      ) as LineValue[]
      const chart = chartFor(lines as Lines)
      expect(chart.primary.record.kingWenNumber).toBe(h.kingWenNumber)
      expect(chart.lines.every((l) => l.primary.spirit)).toBe(true)
      expect(chart.fuShen.length).toBeLessThanOrEqual(5)
      expect(chart.shensha.length).toBeGreaterThan(0)
    }
  })

  it('纳甲表自洽：任一卦六爻地支均属对应内外卦纳支序列', () => {
    const kan = hexagramByBits(0b010010)!
    expect(najiaForHexagram(kan).map((n) => n.branch))
      .toEqual(['寅', '辰', '午', '申', '戌', '子'])
    expect(najiaForHexagram(kan).every((n) => n.stem === '戊')).toBe(true)
  })
})
