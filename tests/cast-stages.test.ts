import { describe, expect, it } from 'vitest'
import { TRIGRAM_KEYS } from '@/data/trigrams'
import {
  RING_ORDER,
  dialLayout,
  evalSpin,
  planDial,
  planSpin,
  ringSlotOf,
  windowLineRadius,
} from '@/features/derive-cast/dial'
import {
  hanziScript,
  numberScript,
  shownRemainder,
  timeScript,
} from '@/features/derive-cast/script'
import { entropyLayout, entropySchedule } from '@/features/entropy-cast/schedule'
import { deriveHanziSeed } from '@/features/hanzi/derive'
import { rawLinesFromNumbers } from '@/features/number/derive'
import { deriveTimeSeed } from '@/features/time/derive'

const TAU = Math.PI * 2
const SECTOR = Math.PI / 4
const mod = (value: number, base: number) => ((value % base) + base) % base

describe('电脑起卦的节拍与版面', () => {
  it('六爻自初爻向上依次得出，每爻先取定三位再凝成爻线', () => {
    const { rows, complete } = entropySchedule()
    expect(rows).toHaveLength(6)
    rows.forEach((row, line) => {
      expect(row.start).toBeLessThan(row.bits[0])
      expect(row.bits[0]).toBeLessThan(row.bits[1])
      expect(row.bits[1]).toBeLessThan(row.bits[2])
      expect(row.bits[2]).toBeLessThan(row.bar)
      if (line > 0) expect(row.bits[0]).toBeGreaterThan(rows[line - 1]!.bar)
    })
    expect(complete).toBeGreaterThan(rows[5]!.bar)
  })

  it.each([[330, 188], [935, 239], [560, 248]])('舞台 %i×%i 上卦象居中、卦名放得下', (width, height) => {
    const layout = entropyLayout(width, height)
    const { block, cell, origin } = layout
    expect(Math.abs(block.x + block.width / 2 - width / 2)).toBeLessThanOrEqual(1)
    expect(block.y).toBeGreaterThan(0)
    expect(block.y + block.height).toBeLessThan(height)
    // 卦象落在噪声格线上
    expect(mod(block.x - origin.x, cell)).toBe(0)
    expect(mod(block.y - origin.y, cell)).toBe(0)
    expect(origin.x).toBeLessThanOrEqual(0)
    expect(origin.y).toBeLessThanOrEqual(0)
    expect(layout.rowTop(0)).toBeGreaterThan(layout.rowTop(5))
    expect(block.x + layout.finaleShift).toBeGreaterThan(0)
    expect(layout.names.x + layout.names.width).toBeLessThanOrEqual(width)
  })
})

describe('罗盘转动轨迹', () => {
  it('卦盘按先天方位排列，八卦各占一位', () => {
    expect([...RING_ORDER].sort()).toEqual([...TRIGRAM_KEYS].sort())
    expect(ringSlotOf('qian')).toBe(0)
    expect(ringSlotOf('kun')).toBe(4)
  })

  it.each([1, -1] as const)('方向 %i：转足整圈后恰好把所得之卦停在盘顶', (direction) => {
    for (let slot = 0; slot < 8; slot++) {
      const from = 0.37
      const plan = planSpin(from, slot, { start: 0.2, direction, turns: 1, duration: 1 })
      const travel = direction * (plan.to - from)
      expect(travel).toBeGreaterThanOrEqual(TAU)
      expect(travel).toBeLessThan(TAU * 2)
      // 卦位 slot 画在 角度 + slot·45° 处，对准盘顶即该角度为整圈
      const offset = mod(plan.to + slot * SECTOR, TAU)
      expect(Math.min(offset, TAU - offset)).toBeLessThan(1e-9)
      expect(evalSpin(plan, plan.start)).toBe(from)
      expect(evalSpin(plan, plan.end + 1)).toBeCloseTo(plan.to, 9)
      expect(evalSpin(plan, plan.lock)).toBeCloseTo(plan.to, 6)
    }
  })

  it('先反向蓄力，越过目标后小幅荡回，全程连续', () => {
    const plan = planSpin(0, 3, { start: 0, direction: 1, turns: 1, duration: 1, overshoot: 0.085 })
    expect(evalSpin(plan, plan.windup * 0.5)).toBeLessThan(0)
    let previous = evalSpin(plan, 0)
    let peak = -Infinity
    for (let t = 0.002; t <= plan.end; t += 0.002) {
      const angle = evalSpin(plan, t)
      expect(Math.abs(angle - previous)).toBeLessThan(0.2)
      previous = angle
      peak = Math.max(peak, angle)
    }
    expect(peak - plan.to).toBeGreaterThan(0.06)
    expect(peak - plan.to).toBeLessThan(0.1)
  })

  it('三步依次进行：外盘、内盘、数动爻', () => {
    const plan = planDial({ upperSlot: 2, lowerSlot: 6, movingLine: 4 })
    expect(plan.upper.direction).toBe(1)
    expect(plan.lower.direction).toBe(-1)
    expect(plan.lower.start).toBeGreaterThan(plan.upper.end)
    expect(plan.moving.start).toBeGreaterThan(plan.lower.end)
    expect(plan.moving.steps).toBe(5)
    expect(plan.moving.land).toBeCloseTo(plan.moving.start + 5 * plan.moving.stepTime, 9)
    expect(plan.stepStarts[0]).toBeLessThan(plan.resolves[0])
    expect(plan.resolves[0]).toBeLessThan(plan.stepStarts[1])
    expect(plan.resolves[1]).toBeLessThan(plan.stepStarts[2])
    expect(plan.resolves[2]).toBeLessThan(plan.complete)
  })

  it.each([[330, 215], [935, 277]])('舞台 %i×%i：窗里六爻自内向外排开，内盘相邻两卦不相碰', (width, height) => {
    const layout = dialLayout(width, height)
    for (let line = 1; line < 6; line++) {
      expect(windowLineRadius(layout, line)).toBeGreaterThan(windowLineRadius(layout, line - 1))
    }
    expect(windowLineRadius(layout, 5) + layout.bar.thickness / 2).toBeLessThanOrEqual(layout.radius)
    expect(2 * layout.innerStart * Math.sin(SECTOR / 2)).toBeGreaterThan(layout.bar.length)
    expect(layout.center.y - layout.tickRadius).toBeGreaterThan(0)
    if (layout.branchRadius !== null) {
      expect(layout.branchRadius).toBeGreaterThan(layout.radius)
      expect(layout.branchRadius).toBeLessThan(layout.tickRadius)
    }
  })
})

describe('推演脚本', () => {
  it('数字起卦：脚本与原算法得出同一卦，整除时余数写 0', () => {
    const parsed = rawLinesFromNumbers(['384', '27', ''])
    if (!parsed.ok) throw new Error('expected ok')
    const script = numberScript(parsed.seed)
    expect(script.rawLines).toEqual(parsed.rawLines)
    expect(script.steps.map((step) => step.dividend)).toEqual(['384', '27', '384+27 = 411'])
    expect(script.steps[0].result).toBe('坤')
    expect(shownRemainder(script.steps[0])).toBe(0)
    expect(script.steps[0].ordinal).toBe(8)
    expect(script.steps[2].result).toBe('三爻')
  })

  it('数字起卦：位数再多也按字符串保留', () => {
    const parsed = rawLinesFromNumbers(['123456789012345678901234567890', '', ''])
    if (!parsed.ok) throw new Error('expected ok')
    const script = numberScript(parsed.seed)
    expect(script.rawLines).toEqual(parsed.rawLines)
    expect(script.steps[2].total).toBe(String(parsed.seed.moving.value))
  })

  it('时间起卦：脚本与原算法得出同一卦，并标出年支与时支', () => {
    for (const iso of ['2026-10-10T08:30:00Z', '2026-02-16T16:30:00Z', '2025-07-01T23:10:00Z']) {
      const derived = deriveTimeSeed(new Date(iso), 'Asia/Shanghai')
      const script = timeScript(derived.seed)
      expect(script.rawLines).toEqual(derived.rawLines)
      expect(script.steps[0].branch).toBe(derived.seed.yearBranchNumber - 1)
      expect(script.steps[1].branch).toBe(derived.seed.hourBranchNumber - 1)
      expect(script.steps[0].dividend).toContain(`= ${derived.seed.upperSum}`)
    }
  })

  it.each(['明', '好运', '水到渠成', '一二三四五六七八九十百千'])('汉字起卦「%s」：脚本与原算法得出同一卦', (text) => {
    const derived = deriveHanziSeed(text)
    if (!derived.ok) throw new Error('expected ok')
    const script = hanziScript(derived.seed)
    expect(script.rawLines).toEqual(derived.rawLines)
    expect(script.movingLine).toBe(derived.seed.movingLine)
    expect(script.seedGlyph).toBe([...text][0])
    for (const step of script.steps) expect(step.dividend).toContain(step.total)
  })
})
