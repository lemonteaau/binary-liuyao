import { describe, expect, it } from 'vitest'
import {
  coinFrame,
  evalToss,
  faceUp,
  planToss,
  restingTheta,
  stageLayout,
} from '@/features/coin-shake/choreography'
import type { CoinFace, TossShape, TossStart } from '@/features/coin-shake/choreography'

const SHAPE: TossShape = {
  delay: 0.045,
  flightTime: 0.55,
  apex: 180,
  spinRate: 30,
  lean: 0.4,
  restitution: [0.33, 0.27],
  wobbleTilt: 0.25,
  wobbleTime: 0.5,
  precession: Math.PI * 4.6,
  yawTurns: 1,
  slide: 14,
}

function start(overrides: Partial<TossStart> = {}): TossStart {
  return { x: 260, y: 100, z: 80, theta: 1.3, phiS: 0.7, psi: 0.4, spin: 11, ...overrides }
}

describe('摇币动画轨迹', () => {
  it.each<[CoinFace, Partial<TossStart>]>([
    ['heads', {}],
    ['tails', {}],
    ['heads', { theta: Math.PI * 7 + 0.2, spin: -9 }],
    ['tails', { theta: -Math.PI * 3, spin: -12 }],
  ])('落定后朝上的一面与采样结果一致（%s）', (face, overrides) => {
    const plan = planToss(start(overrides), { x: 120, y: 110, psi: 0.1, face }, SHAPE)
    const rest = evalToss(plan, plan.settleTime)

    expect(faceUp(rest.theta)).toBe(face)
    expect(rest.z).toBe(0)
    expect(rest.alpha).toBe(0)
    expect(rest.x).toBeCloseTo(120)
    expect(rest.y).toBeCloseTo(110)
    expect(Math.cos(rest.psi)).toBeCloseTo(Math.cos(0.1))
    expect(coinFrame(rest).n.z * (face === 'heads' ? 1 : -1)).toBeCloseTo(1)
  })

  it('延续松手前的旋转方向，并至少翻转半圈以上', () => {
    for (const spin of [8, -8]) {
      const plan = planToss(start({ spin }), { x: 120, y: 110, psi: 0, face: 'tails' }, SHAPE)
      expect(Math.sign(plan.spin)).toBe(Math.sign(spin))
      expect(Math.abs(plan.thetaFinal - start().theta)).toBeGreaterThan(Math.PI)
    }
  })

  it('轨迹连续：相邻帧之间没有跳变', () => {
    const plan = planToss(start(), { x: 400, y: 96, psi: -0.12, face: 'heads' }, SHAPE)
    const step = 1 / 240
    let previous = evalToss(plan, 0)
    for (let t = step; t <= plan.settleTime + 0.05; t += step) {
      const pose = evalToss(plan, t)
      const a = coinFrame(previous).n
      const b = coinFrame(pose).n
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThan(6)
      expect(Math.abs(pose.z - previous.z)).toBeLessThan(6)
      // 法线每帧转角受限于空中角速度
      expect(Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))).toBeLessThan(0.2)
      previous = pose
    }
  })

  it('飞行达到设定高度，随后按恢复系数弹跳并在结束前落回桌面', () => {
    const plan = planToss(start(), { x: 120, y: 110, psi: 0, face: 'heads' }, SHAPE)
    let apex = 0
    for (let t = SHAPE.delay; t < SHAPE.delay + SHAPE.flightTime; t += 0.002) {
      apex = Math.max(apex, evalToss(plan, t).z)
    }
    expect(apex).toBeCloseTo(SHAPE.apex, 0)
    expect(plan.impacts).toHaveLength(SHAPE.restitution.length + 1)
    expect(plan.impacts[1]!.speed).toBeCloseTo(plan.impacts[0]!.speed * 0.33)
    expect(plan.impacts.at(-1)!.time).toBeLessThan(plan.settleTime)
  })

  it('从静止开始的纯下落（入场动画）同样落在指定的一面', () => {
    const plan = planToss(
      start({ z: 200, theta: restingTheta('heads') - (Math.PI * 2 + 0.3), spin: 1 }),
      { x: 100, y: 100, psi: 0, face: 'heads' },
      { ...SHAPE, apex: 0, spinRate: 15, flightTime: 0.44 },
    )
    expect(plan.launchSpeed).toBe(0)
    expect(faceUp(evalToss(plan, plan.settleTime).theta)).toBe('heads')
  })
})

describe('摇币舞台布局', () => {
  it.each([
    [524, 238],
    [343, 190],
    [280, 150],
  ])('三枚铜钱在 %i×%i 舞台内等距排开且互不重叠', (width, height) => {
    const layout = stageLayout(width, height)
    const [left, middle, right] = layout.slots
    expect(middle.x).toBeCloseTo(width / 2)
    expect(middle.x - left.x).toBeCloseTo(right.x - middle.x)
    expect(middle.x - left.x).toBeGreaterThanOrEqual(layout.radius * 2)
    expect(left.x - layout.radius).toBeGreaterThanOrEqual(0)
    expect(right.x + layout.radius).toBeLessThanOrEqual(width)
  })
})
