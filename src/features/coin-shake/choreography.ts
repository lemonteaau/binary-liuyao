/**
 * 摇币动画的纯数学部分：铜钱姿态、舞台布局与抛掷轨迹。
 *
 * 松手时一次性规划每枚铜钱的完整轨迹（飞行 → 弹跳 → 欧拉盘式摆动 → 静止），
 * 落定的面由已经采样好的结果决定；渲染层只需按时间求值，不做物理积分。
 */
import type { CoinScore } from '@/engine/binary'

export type CoinFace = 'heads' | 'tails'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CoinPose {
  x: number
  y: number
  /** 币心离桌面的高度（px） */
  z: number
  /** 绕桌面内水平轴 phiS 的翻转角：kπ 时平躺，k 为偶数时正面朝上 */
  theta: number
  phiS: number
  /** 绕币面法线的自转，即纹理朝向 */
  psi: number
  /** 叠加的倾斜：落地后的摆动或悬停时的侧倾 */
  alpha: number
  phiW: number
}

/** 币面坐标系：u 为纹理向右，v 为纹理向下，n 为正面法线（朝向镜头为 +z） */
export interface CoinFrame {
  u: Vec3
  v: Vec3
  n: Vec3
}

export const faceOfScore = (score: CoinScore): CoinFace => (score === 3 ? 'heads' : 'tails')

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
export const clamp01 = (value: number) => clamp(value, 0, 1)
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** 以 (cos φ, sin φ, 0) 为轴旋转向量（Rodrigues 公式在水平轴上的化简） */
function rotateHorizontal(p: Vec3, phi: number, angle: number): Vec3 {
  const kx = Math.cos(phi)
  const ky = Math.sin(phi)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const along = (kx * p.x + ky * p.y) * (1 - c)
  return {
    x: p.x * c + ky * p.z * s + kx * along,
    y: p.y * c - kx * p.z * s + ky * along,
    z: p.z * c + (kx * p.y - ky * p.x) * s,
  }
}

export function coinFrame(pose: CoinPose): CoinFrame {
  const cp = Math.cos(pose.psi)
  const sp = Math.sin(pose.psi)
  let u: Vec3 = { x: cp, y: sp, z: 0 }
  let v: Vec3 = { x: -sp, y: cp, z: 0 }
  let n: Vec3 = { x: 0, y: 0, z: 1 }
  if (pose.theta !== 0) {
    u = rotateHorizontal(u, pose.phiS, pose.theta)
    v = rotateHorizontal(v, pose.phiS, pose.theta)
    n = rotateHorizontal(n, pose.phiS, pose.theta)
  }
  if (pose.alpha !== 0) {
    u = rotateHorizontal(u, pose.phiW, pose.alpha)
    v = rotateHorizontal(v, pose.phiW, pose.alpha)
    n = rotateHorizontal(n, pose.phiW, pose.alpha)
  }
  return { u, v, n }
}

const mod2 = (k: number) => ((k % 2) + 2) % 2

/** 平躺时朝上的一面 */
export function faceUp(theta: number): CoinFace {
  return mod2(Math.round(theta / Math.PI)) === 0 ? 'heads' : 'tails'
}

export const restingTheta = (face: CoinFace) => (face === 'heads' ? 0 : Math.PI)

export interface StagePoint {
  x: number
  y: number
}

export interface StageLayout {
  width: number
  height: number
  radius: number
  slots: readonly [StagePoint, StagePoint, StagePoint]
  center: StagePoint
  ringRadius: number
}

/** 三枚铜钱的静止位置与尺寸，随舞台大小缩放 */
export function stageLayout(width: number, height: number): StageLayout {
  const diameter = clamp(Math.min(height * 0.46, width / 4.4), 36, 116)
  const radius = diameter / 2
  const spacing = Math.max(
    diameter * 1.06,
    Math.min(diameter * 1.36, (width - diameter) / 2 - 8),
  )
  const center = { x: width / 2, y: height * 0.44 }
  return {
    width,
    height,
    radius,
    center,
    slots: [
      { x: center.x - spacing, y: center.y },
      { x: center.x, y: center.y },
      { x: center.x + spacing, y: center.y },
    ],
    ringRadius: Math.min(height * 0.41, spacing * 1.02),
  }
}

export interface TossStart {
  x: number
  y: number
  z: number
  theta: number
  phiS: number
  psi: number
  /** 松手时的翻转角速度（rad/s），用来延续原有的旋转方向 */
  spin: number
}

export interface TossTarget {
  x: number
  y: number
  psi: number
  face: CoinFace
}

export interface TossShape {
  /** 相对松手的起跳延迟（s） */
  delay: number
  flightTime: number
  /** 最高点高度（px） */
  apex: number
  /** 空中翻转角速度（rad/s） */
  spinRate: number
  /** 首次触地时尚未转平的角度 */
  lean: number
  /** 每次弹起的恢复系数 */
  restitution: readonly number[]
  wobbleTilt: number
  wobbleTime: number
  /** 摆动开始时的进动角速度（rad/s） */
  precession: number
  /** 空中额外自转的整圈数 */
  yawTurns: number
  /** 触地后向前滑行的距离（px） */
  slide: number
}

interface Bounce {
  start: number
  duration: number
  speed: number
}

export interface TossPlan {
  start: TossStart
  target: TossTarget
  shape: TossShape
  gravity: number
  launchSpeed: number
  thetaFinal: number
  spin: number
  spinSign: 1 | -1
  land: StagePoint
  psiEnd: number
  phiW0: number
  bounces: readonly Bounce[]
  leanTime: number
  slideTime: number
  yawTime: number
  /** 每次触地的时刻（相对松手）及触地速度（px/s） */
  impacts: readonly { time: number; speed: number }[]
  settleTime: number
}

export function planToss(start: TossStart, target: TossTarget, shape: TossShape): TossPlan {
  const flight = shape.flightTime
  const z0 = Math.max(0, start.z)
  const apex = Math.max(shape.apex, z0)

  // 抛物线：给定起点高度、最高点与飞行时间，反解重力与初速度
  let gravity: number
  let launchSpeed: number
  if (apex - z0 < 1e-3) {
    gravity = Math.max(2 * z0 / (flight * flight), 1)
    launchSpeed = 0
  } else {
    const ratio = 1 + Math.sqrt(1 + z0 / (apex - z0))
    const apexTime = flight / ratio
    gravity = 2 * (apex - z0) / (apexTime * apexTime)
    launchSpeed = gravity * apexTime
  }
  const landingSpeed = gravity * flight - launchSpeed

  const bounces: Bounce[] = []
  let speed = landingSpeed
  let elapsed = 0
  for (const e of shape.restitution) {
    speed *= e
    const duration = 2 * speed / gravity
    bounces.push({ start: elapsed, duration, speed })
    elapsed += duration
  }
  const leanTime = Math.max(elapsed, 0.08)

  // 选择最终翻转的半圈数：方向延续、奇偶由落定的面决定
  const spinSign: 1 | -1 = start.spin < 0 ? -1 : 1
  const parity = target.face === 'heads' ? 0 : 1
  let k = Math.round((start.theta + spinSign * (shape.spinRate * flight + shape.lean)) / Math.PI)
  if (mod2(k) !== parity) k += spinSign
  while ((k * Math.PI - spinSign * shape.lean - start.theta) * spinSign < Math.PI * 0.5) {
    k += 2 * spinSign
  }
  const thetaFinal = k * Math.PI
  const spin = (thetaFinal - spinSign * shape.lean - start.theta) / flight

  const dx = target.x - start.x
  const dy = target.y - start.y
  const distance = Math.hypot(dx, dy)
  const slide = Math.min(shape.slide, distance * 0.5)
  const land = distance > 1e-6
    ? { x: target.x - dx / distance * slide, y: target.y - dy / distance * slide }
    : { x: target.x, y: target.y }

  const turn = Math.PI * 2
  const psiEnd = target.psi
    + turn * Math.round((start.psi - target.psi) / turn)
    + turn * shape.yawTurns

  const impacts = [{ time: shape.delay + flight, speed: landingSpeed }]
  for (const bounce of bounces) {
    impacts.push({ time: shape.delay + flight + bounce.start + bounce.duration, speed: bounce.speed })
  }

  return {
    start,
    target,
    shape,
    gravity,
    launchSpeed,
    thetaFinal,
    spin,
    spinSign,
    land,
    psiEnd,
    // 残余倾角 −sign·lean 绕 phiS，等价于 +lean 绕反向轴
    phiW0: start.phiS + (spinSign > 0 ? Math.PI : 0),
    bounces,
    leanTime,
    slideTime: leanTime + shape.wobbleTime * 0.6,
    yawTime: flight + leanTime + shape.wobbleTime * 0.5,
    impacts,
    settleTime: shape.delay + flight + leanTime + shape.wobbleTime,
  }
}

/** 求松手后 time 秒时的姿态 */
export function evalToss(plan: TossPlan, time: number): CoinPose {
  const { start, target, shape } = plan
  const tau = time - shape.delay
  if (tau <= 0) {
    return { ...start, alpha: 0, phiW: plan.phiW0 }
  }
  if (time >= plan.settleTime) {
    return restPose(target.x, target.y, plan.psiEnd, plan.thetaFinal, start.phiS)
  }

  const psi = lerp(start.psi, plan.psiEnd, easeOutCubic(clamp01(tau / plan.yawTime)))
  const flight = shape.flightTime

  if (tau < flight) {
    const p = tau / flight
    return {
      x: lerp(start.x, plan.land.x, p),
      y: lerp(start.y, plan.land.y, p),
      z: Math.max(0, start.z + plan.launchSpeed * tau - 0.5 * plan.gravity * tau * tau),
      theta: start.theta + plan.spin * tau,
      phiS: start.phiS,
      psi,
      alpha: 0,
      phiW: plan.phiW0,
    }
  }

  const after = tau - flight
  const slide = easeOutCubic(clamp01(after / plan.slideTime))
  let z = 0
  for (const bounce of plan.bounces) {
    const s = after - bounce.start
    if (s >= 0 && s < bounce.duration) {
      z = bounce.speed * s - 0.5 * plan.gravity * s * s
      break
    }
  }

  let alpha: number
  let phiW: number
  const lean = smootherstep(clamp01(after / plan.leanTime))
  if (after < plan.leanTime) {
    alpha = shape.wobbleTilt * lean
    phiW = plan.phiW0 + shape.precession * 0.5 * after * after / plan.leanTime
  } else {
    // 欧拉盘：倾角按 (1−x)^(1/3) 收敛，进动随倾角变小而加快，最后“啪”地平躺
    const remain = 1 - clamp01((after - plan.leanTime) / shape.wobbleTime)
    alpha = shape.wobbleTilt * Math.cbrt(remain)
    phiW = plan.phiW0
      + shape.precession * plan.leanTime * 0.5
      + shape.precession * shape.wobbleTime * 1.2 * (1 - remain ** (5 / 6))
  }

  return {
    x: lerp(plan.land.x, target.x, slide),
    y: lerp(plan.land.y, target.y, slide),
    z: Math.max(0, z),
    theta: plan.thetaFinal - plan.spinSign * shape.lean * (1 - lean),
    phiS: start.phiS,
    psi,
    alpha,
    phiW,
  }
}

/** 平躺静止的姿态；奇数半圈时翻转轴决定反面纹理的朝向，须沿用原轴 */
export function restPose(x: number, y: number, psi: number, theta: number, phiS = 0): CoinPose {
  return { x, y, z: 0, theta, phiS, psi, alpha: 0, phiW: 0 }
}
