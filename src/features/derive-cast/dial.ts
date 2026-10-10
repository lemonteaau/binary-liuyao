/**
 * 罗盘推演的纯数学部分：盘面版面、两圈卦盘的转动轨迹与整段演出的节拍。
 *
 * 外盘定上卦（外卦）、内盘定下卦（内卦）：两盘各自转到所得之卦对准盘顶的“窗”，
 * 六爻便在窗里自下而上排成本卦；随后自初爻数到动爻。轨迹预先规划、按时间求值。
 */
import type { TrigramKey } from '@/data/trigrams'
import { clamp, clamp01 } from '@/features/coin-shake/choreography'

/** 先天八卦方位，自盘顶顺时针 */
export const RING_ORDER: readonly TrigramKey[] = [
  'qian', 'xun', 'kan', 'gen', 'kun', 'zhen', 'li', 'dui',
]
/** 地支环上位于盘顶的地支（午，南方在上）；顺时针依次排开 */
export const BRANCH_AT_TOP = 6
const SECTOR = Math.PI / 4
const TAU = Math.PI * 2

export const ringSlotOf = (key: TrigramKey) => RING_ORDER.indexOf(key)

export interface DialLayout {
  width: number
  height: number
  center: { x: number; y: number }
  /** 外盘外缘半径，其余尺寸均以它为单位 */
  radius: number
  bar: { length: number; thickness: number; pitch: number }
  /** 内盘、外盘最里一爻的半径 */
  innerStart: number
  outerStart: number
  /** 盘心读数区半径 */
  well: number
  /** 地支环半径；舞台太小时为 null，不画地支 */
  branchRadius: number | null
  /** 刻度环内缘半径 */
  tickRadius: number
}

export function dialLayout(width: number, height: number): DialLayout {
  // 放得下地支环时多留一圈；否则把卦盘本身做大
  const roomy = Math.min(height * 0.35, width * 0.3)
  const withBranches = roomy >= 80
  const radius = withBranches ? roomy : clamp(Math.min(height * 0.42, width * 0.36), 40, 130)
  return {
    width,
    height,
    center: { x: width / 2, y: height / 2 },
    radius,
    bar: { length: radius * 0.25, thickness: radius * 0.052, pitch: radius * 0.09 },
    innerStart: radius * 0.4,
    outerStart: radius * 0.76,
    well: radius * 0.3,
    branchRadius: withBranches ? radius * 1.18 : null,
    tickRadius: radius * (withBranches ? 1.32 : 1.08),
  }
}

/** 窗内第 line 爻（0 为初爻）中线到盘心的距离 */
export function windowLineRadius(layout: DialLayout, line: number): number {
  const start = line < 3 ? layout.innerStart : layout.outerStart
  return start + (line % 3) * layout.bar.pitch + layout.bar.thickness / 2
}

export interface SpinPlan {
  start: number
  /** 起转前反向蓄力的时长与角度 */
  windup: number
  recoil: number
  duration: number
  from: number
  to: number
  direction: 1 | -1
  /** 回弹系数：决定越过目标后荡回的幅度 */
  back: number
  /** 首次转到目标的时刻 */
  lock: number
  end: number
}

export interface SpinShape {
  start: number
  direction: 1 | -1
  /** 至少转过的整圈数 */
  turns: number
  duration: number
  windup?: number
  recoil?: number
  /** 越过目标的角度（弧度） */
  overshoot?: number
}

const mod = (value: number, base: number) => ((value % base) + base) % base

/** 由越过目标的比例反解 easeOutBack 的回弹系数：4c³ / 27(1+c)² = ratio */
function backFor(ratio: number): number {
  let low = 0
  let high = 3
  for (let i = 0; i < 28; i++) {
    const c = (low + high) / 2
    if ((4 * c ** 3) / (27 * (1 + c) ** 2) < ratio) low = c
    else high = c
  }
  return (low + high) / 2
}

/** 规划一圈卦盘的转动：把 slot 处的卦转到盘顶 */
export function planSpin(from: number, slot: number, shape: SpinShape): SpinPlan {
  const windup = shape.windup ?? 0.12
  const recoil = shape.recoil ?? 0.1
  const target = -slot * SECTOR
  const travel = shape.turns * TAU + mod(shape.direction * (target - from), TAU)
  const to = from + shape.direction * travel
  const back = backFor((shape.overshoot ?? 0.085) / (travel + recoil))
  return {
    start: shape.start,
    windup,
    recoil,
    duration: shape.duration,
    from,
    to,
    direction: shape.direction,
    back,
    lock: shape.start + windup + shape.duration * (1 - back / (1 + back)),
    end: shape.start + windup + shape.duration,
  }
}

/** 求 time 时刻的盘面角度 */
export function evalSpin(plan: SpinPlan, time: number): number {
  const tau = time - plan.start
  if (tau <= 0) return plan.from
  const wound = plan.from - plan.direction * plan.recoil
  if (tau < plan.windup) {
    return plan.from - plan.direction * plan.recoil * Math.sin((Math.PI / 2) * (tau / plan.windup))
  }
  const p = clamp01((tau - plan.windup) / plan.duration)
  const q = p - 1
  const eased = 1 + (plan.back + 1) * q ** 3 + plan.back * q ** 2
  return wound + (plan.to - wound) * eased
}

export interface DialPlan {
  upper: SpinPlan
  lower: SpinPlan
  moving: {
    start: number
    /** 自初爻起数的步数（1..6） */
    steps: number
    stepTime: number
    /** 数到动爻的时刻 */
    land: number
  }
  /** 三步各自开始、得出结果的时刻 */
  stepStarts: readonly [number, number, number]
  resolves: readonly [number, number, number]
  complete: number
}

const IGNITION = 0.16
const SPIN_TIME = 1.02
const STEP_GAP = 0.2
const COUNT_STEP = 0.125
/** 动爻闪变并定格所需时间 */
export const MOVING_GLITCH_TIME = 0.5
const SETTLE = 0.72

export function planDial(input: {
  upperSlot: number
  lowerSlot: number
  movingLine: number
  upperFrom?: number
  lowerFrom?: number
}): DialPlan {
  const upper = planSpin(input.upperFrom ?? 0, input.upperSlot, {
    start: IGNITION,
    direction: 1,
    turns: 1,
    duration: SPIN_TIME,
  })
  const lower = planSpin(input.lowerFrom ?? 0, input.lowerSlot, {
    start: upper.end + STEP_GAP,
    direction: -1,
    turns: 1,
    duration: SPIN_TIME,
  })
  const steps = input.movingLine + 1
  const start = lower.end + STEP_GAP + 0.06
  const land = start + steps * COUNT_STEP
  return {
    upper,
    lower,
    moving: { start, steps, stepTime: COUNT_STEP, land },
    stepStarts: [upper.start, lower.start, start],
    resolves: [upper.lock, lower.lock, land],
    complete: land + SETTLE,
  }
}
