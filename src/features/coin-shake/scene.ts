/**
 * 摇币舞台：俯视的占卜桌面，用 2D canvas 把像素铜钱当作真实的三维圆片绘制。
 *
 * 币面在正交投影下是仿射变换，直接 setTransform 贴图；币厚由沿法线堆叠的剪影表现；
 * 高光来自可随鼠标移动的点光源。摇动阶段用弹簧模拟“捧在手里”的滞后与碰撞，
 * 松手后按 choreography 预先规划的轨迹求值，保证落定的面与采样结果一致。
 */
import type { CoinToss } from '@/engine/binary'
import { motionEnabled } from '@/lib/motion'
import {
  clamp,
  clamp01,
  coinFrame,
  easeInOutSine,
  evalToss,
  faceOfScore,
  planToss,
  restingTheta,
  stageLayout,
} from './choreography'
import type {
  CoinFace,
  CoinFrame,
  CoinPose,
  StageLayout,
  TossPlan,
  TossShape,
  Vec3,
} from './choreography'
import {
  BRONZE,
  DUST,
  EMBER,
  HOT,
  SIGNAL,
  TAU,
  random,
  rgba,
  spring,
  springMoving,
  stepSpring,
  wobble,
} from '@/features/stage/fx'
import type { RGB, Spring } from '@/features/stage/fx'
import { COIN_RATIO, HOLE_RATIO } from './sprites'
import type { CoinSprites } from './sprites'

export interface CoinSceneEvents {
  onSettle?: (index: number, face: CoinFace) => void
  onAllSettled?: () => void
}

export interface CoinSceneInit {
  faces: CoinToss | null
  shaking: boolean
  intro: boolean
}

interface CoinBody {
  pose: CoinPose
  face: CoinFace
  /** 静止位置相对槽位的随机偏移（以币半径计）与朝向 */
  jitter: { x: number; y: number; psi: number }
  vx: number
  vy: number
  vz: number
  spin: number
  spinTarget: number
  stiffness: number
  hover: Spring
  plan: TossPlan | null
  impactIndex: number
  settled: boolean
  fadeIn: boolean
  frame: CoinFrame
  lift: number
}

type ParticleKind = 'dust' | 'spark' | 'flare'

interface Particle {
  kind: ParticleKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  size: number
  color: RGB
  gravity: number
  drag: number
}

interface Ripple {
  x: number
  y: number
  from: number
  to: number
  life: number
  maxLife: number
  alpha: number
  width: number
  dashed: boolean
  color: RGB
  delay: number
}

interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

/** 镜头高度（以币半径计），决定升高时的透视放大 */
const PERSPECTIVE = 9
const THICKNESS = 0.11
const RING_IDLE = 0.13
const SHIMMER_TIME = 1.7
const DEFAULT_LIGHT = normalize({ x: -0.48, y: -0.52, z: 0.71 })
const REST_DIFFUSE = DEFAULT_LIGHT.z
/** 运动模糊：约等于 180° 快门的回溯采样 [回溯时间, 不透明度]，从最旧画起 */
const GHOSTS = [
  [0.0085, 0.16],
  [0.0057, 0.22],
  [0.0028, 0.3],
] as const
/** 先天八卦，自上方顺时针；每卦自内（初爻）向外 */
const TRIGRAMS = [
  [1, 1, 1],
  [0, 1, 1],
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
  [1, 0, 0],
  [1, 0, 1],
  [1, 1, 0],
] as const

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const negate = (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, z: -v.z })

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

export class CoinScene {
  private readonly ctx: CanvasRenderingContext2D
  private layout: StageLayout
  private dpr = 1
  private motion = motionEnabled()
  private coins: CoinBody[]
  private mode: 'idle' | 'shaking' | 'tossing' = 'idle'
  private clock = 0
  private realClock = 0
  private shakeClock = 0
  private tossClock = 0
  private tossEvents: CoinSceneEvents | null = null
  private speedRamp: number | null = null
  private hitStop = 0
  private flash = 0
  private trauma = 0
  private handDirection = 0
  private readonly zoom = spring(1)
  private readonly focusX: Spring
  private readonly focusY: Spring
  private readonly ringGlow = spring(RING_IDLE)
  private ringAngle = 0
  private ringSpeed = 0
  private readonly lightFocus = spring(0)
  private readonly lightX = spring(0)
  private readonly lightY = spring(0)
  private lightZ = 0
  private readonly dim = spring(0)
  private pointer: { x: number; y: number } | null = null
  private shimmer: { start: number } | null = null
  private shimmerTimer = 0
  private visible = true
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  private raf = 0
  private lastFrame = 0
  private destroyed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    private readonly sprites: CoinSprites,
    size: { width: number; height: number; dpr: number },
    init: CoinSceneInit,
  ) {
    this.ctx = context
    this.layout = stageLayout(size.width, size.height)
    this.focusX = spring(this.layout.center.x)
    this.focusY = spring(this.layout.center.y)
    this.coins = [0, 1, 2].map((index) => {
      const face = init.faces ? faceOfScore(init.faces[index]!) : 'heads'
      return this.createBody(index, face)
    })
    this.resize(size.width, size.height, size.dpr)
    if (init.shaking) this.startShake()
    else if (init.intro) this.intro()
    this.scheduleShimmer()
  }

  /* ------------------------------ 公共指令 ------------------------------ */

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.layout = stageLayout(width, height)
    this.focusX.value = this.focusX.target = this.layout.center.x
    this.focusY.value = this.focusY.target = this.layout.center.y
    if (this.mode === 'idle') {
      this.coins.forEach((body, index) => this.placeAtRest(body, index))
    }
    this.render()
  }

  startShake() {
    this.motion = motionEnabled()
    this.endShimmer()
    if (this.mode === 'tossing') this.skip()
    this.mode = 'shaking'
    const R = this.layout.radius
    if (!this.motion) {
      this.coins.forEach((body, index) => {
        this.placeAtRest(body, index)
        body.pose.z = R * 0.35
      })
      this.render()
      return
    }
    this.shakeClock = 0
    this.handDirection = 0
    this.coins.forEach((body, index) => {
      body.vx = 0
      body.vy = 0
      body.vz = 0
      body.spin = 0
      body.spinTarget = (index === 1 ? -1 : 1) * random(9, 13)
      body.stiffness = random(0.85, 1.15)
      body.hover.target = 0
    })
    this.zoom.target = 1.07
    this.ringGlow.target = 0.55
    this.trauma = Math.min(1, this.trauma + 0.12)
    this.kick()
  }

  /** 松手：按采样结果规划三条轨迹。三枚铜钱由左至右对应 coins[0..2]。 */
  release(coins: CoinToss, events: CoinSceneEvents) {
    this.motion = motionEnabled()
    this.endShimmer()
    const faces = coins.map(faceOfScore)
    if (!this.motion) {
      this.coins.forEach((body, index) => {
        body.face = faces[index]!
        body.jitter = { x: 0, y: 0, psi: 0 }
        body.pose.theta = restingTheta(body.face)
        body.pose.phiS = 0
        this.placeAtRest(body, index)
      })
      this.mode = 'idle'
      this.render()
      faces.forEach((face, index) => events.onSettle?.(index, face))
      events.onAllSettled?.()
      return
    }

    const R = this.layout.radius
    const hand = this.centroid()
    // 按当前横向位置分配落点，飞行路线不交叉
    this.coins = [...this.coins].sort((a, b) => a.pose.x - b.pose.x)
    const delays = shuffled([0, 0.045, 0.09])
    this.coins.forEach((body, index) => {
      body.face = faces[index]!
      body.jitter = { x: random(-0.1, 0.1), y: random(-0.14, 0.14), psi: random(-0.16, 0.16) }
      const rest = this.restOf(body, index)
      this.launch(body, rest, {
        delay: delays[index]!,
        flightTime: random(0.5, 0.6),
        apex: R * random(2.9, 3.5),
        spinRate: random(24, 34),
        lean: random(0.32, 0.5),
        restitution: [random(0.3, 0.36), random(0.24, 0.3)],
        wobbleTilt: random(0.2, 0.3),
        wobbleTime: random(0.42, 0.62),
        precession: Math.PI * 2 * random(2, 2.6),
        yawTurns: Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? -1 : 1,
        slide: R * random(0.2, 0.35),
      })
    })

    this.mode = 'tossing'
    this.tossClock = 0
    this.tossEvents = events
    this.speedRamp = 0.045 + 0.24
    // 顿帧 + 闪光 + 冲击波：松手的一瞬
    this.hitStop = 0.075
    this.flash = 1
    this.trauma = Math.min(1, this.trauma + 0.42)
    this.ringGlow.value = 1
    this.ringGlow.target = RING_IDLE
    this.ringSpeed += 5
    this.zoom.target = 1
    this.zoom.velocity -= 1.1
    this.focusX.target = this.layout.center.x
    this.focusY.target = this.layout.center.y
    this.addRipple(hand.x, hand.y, R * 0.6, R * 3.4, 0.5, 0.75, 2, false, SIGNAL)
    this.addRipple(hand.x, hand.y, R * 0.4, R * 2.4, 0.42, 0.45, 1, true, EMBER, 0.06)
    for (let i = 0; i < 18; i++) {
      const angle = random(0, Math.PI * 2)
      const speed = R * random(3, 7.5)
      this.particles.push({
        kind: i % 5 === 0 ? 'flare' : 'spark',
        x: hand.x,
        y: hand.y,
        z: R * 1.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: random(-1, 2) * R,
        life: random(0.22, 0.42),
        maxLife: 0.42,
        size: 2,
        color: i % 3 === 0 ? SIGNAL : i % 3 === 1 ? EMBER : HOT,
        gravity: 0,
        drag: 5,
      })
    }
    this.kick()
  }

  /** 跳过尚未结束的抛掷，立即落定并触发全部回调 */
  skip() {
    if (this.mode !== 'tossing') return
    this.hitStop = 0
    this.coins.forEach((body, index) => {
      if (!body.settled) this.settle(index, false)
    })
    this.finishToss()
    this.render()
  }

  /** 重置：三枚铜钱轻跳回原位，统一翻回正面 */
  reset() {
    this.motion = motionEnabled()
    this.endShimmer()
    this.tossEvents = null
    this.dim.target = 0
    const R = this.layout.radius
    if (!this.motion) {
      this.coins.forEach((body, index) => {
        body.face = 'heads'
        body.jitter = { x: 0, y: 0, psi: 0 }
        body.pose.theta = 0
        body.pose.phiS = 0
        this.placeAtRest(body, index)
      })
      this.mode = 'idle'
      this.dim.value = 0
      this.render()
      return
    }
    this.coins.forEach((body, index) => {
      body.face = 'heads'
      body.jitter = { x: 0, y: 0, psi: 0 }
      this.launch(body, this.restOf(body, index), {
        delay: 0.06 * index,
        flightTime: 0.4,
        apex: body.pose.z + R * 0.95,
        spinRate: 16,
        lean: 0.25,
        restitution: [0.3],
        wobbleTilt: 0.12,
        wobbleTime: 0.26,
        precession: Math.PI * 5,
        yawTurns: 0,
        slide: 0,
      })
    })
    this.mode = 'tossing'
    this.tossClock = 0
    this.speedRamp = null
    this.zoom.target = 1
    this.ringGlow.target = RING_IDLE
    this.kick()
  }

  setPointer(point: { x: number; y: number } | null) {
    if (!this.motion) return
    if (point && this.lightFocus.value < 0.05) {
      this.lightX.value = this.lightX.target = point.x
      this.lightY.value = this.lightY.target = point.y
      this.lightX.velocity = 0
      this.lightY.velocity = 0
    }
    if (point) this.endShimmer()
    this.pointer = point
    this.kick()
  }

  /** 六爻完成后压暗铜钱，让出舞台给卦象 */
  setDim(on: boolean) {
    this.dim.target = on ? 1 : 0
    this.ringGlow.target = on ? 0 : RING_IDLE
    if (!this.motion) {
      this.dim.value = this.dim.target
      this.ringGlow.value = this.ringGlow.target
      this.render()
      return
    }
    this.kick()
  }

  setVisible(visible: boolean) {
    this.visible = visible
  }

  destroy() {
    this.destroyed = true
    this.tossEvents = null
    if (this.raf) cancelAnimationFrame(this.raf)
    window.clearTimeout(this.shimmerTimer)
  }

  /* ------------------------------ 编排 ------------------------------ */

  private createBody(index: number, face: CoinFace): CoinBody {
    const body: CoinBody = {
      pose: { x: 0, y: 0, z: 0, theta: restingTheta(face), phiS: 0, psi: 0, alpha: 0, phiW: 0 },
      face,
      jitter: { x: 0, y: 0, psi: 0 },
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      spinTarget: 0,
      stiffness: 1,
      hover: spring(0),
      plan: null,
      impactIndex: 0,
      settled: true,
      fadeIn: false,
      frame: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, n: { x: 0, y: 0, z: 1 } },
      lift: 0,
    }
    this.placeAtRest(body, index)
    return body
  }

  private restOf(body: CoinBody, index: number) {
    const slot = this.layout.slots[index]!
    const R = this.layout.radius
    return { x: slot.x + body.jitter.x * R, y: slot.y + body.jitter.y * R, psi: body.jitter.psi }
  }

  private placeAtRest(body: CoinBody, index: number) {
    const rest = this.restOf(body, index)
    body.pose = { ...body.pose, x: rest.x, y: rest.y, z: 0, psi: rest.psi, alpha: 0, phiW: 0 }
  }

  private launch(body: CoinBody, rest: { x: number; y: number; psi: number }, shape: TossShape) {
    const { pose } = body
    body.plan = planToss(
      {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        theta: pose.theta,
        phiS: pose.phiS,
        psi: pose.psi,
        spin: body.spin || 1,
      },
      { ...rest, face: body.face },
      shape,
    )
    body.impactIndex = 0
    body.settled = false
    body.fadeIn = false
    body.hover.target = 0
  }

  /** 首次进入：三枚铜钱从镜头前依次落到桌面 */
  private intro() {
    if (!this.motion) return
    const R = this.layout.radius
    this.coins.forEach((body, index) => {
      const rest = this.restOf(body, index)
      body.pose = {
        x: rest.x + (index - 1) * R * 0.25,
        y: rest.y - R * 0.4,
        z: R * 3.8,
        theta: restingTheta(body.face) - (Math.PI * 2 + 0.3),
        phiS: random(-0.5, 0.5),
        psi: rest.psi + random(-0.6, 0.6),
        alpha: 0,
        phiW: 0,
      }
      body.spin = 1
      this.launch(body, rest, {
        delay: 0.08 + index * 0.085,
        flightTime: 0.44,
        apex: 0,
        spinRate: 15,
        lean: 0.3,
        restitution: [0.3, 0.24],
        wobbleTilt: 0.14,
        wobbleTime: 0.3,
        precession: Math.PI * 4.4,
        yawTurns: 0,
        slide: 0,
      })
      body.fadeIn = true
    })
    this.mode = 'tossing'
    this.tossClock = 0
    this.speedRamp = null
    this.render()
    this.kick()
  }

  private centroid() {
    const x = this.coins.reduce((sum, body) => sum + body.pose.x, 0) / 3
    const y = this.coins.reduce((sum, body) => sum + body.pose.y, 0) / 3
    return { x, y }
  }

  private settle(index: number, withFx = true) {
    const body = this.coins[index]!
    const plan = body.plan
    body.settled = true
    body.plan = null
    body.fadeIn = false
    body.spin = 0
    body.pose = {
      ...body.pose,
      theta: plan?.thetaFinal ?? restingTheta(body.face),
      phiS: plan?.start.phiS ?? body.pose.phiS,
    }
    this.placeAtRest(body, index)
    if (withFx) this.clack(body)
    this.tossEvents?.onSettle?.(index, body.face)
  }

  private finishToss() {
    this.mode = 'idle'
    this.speedRamp = null
    const events = this.tossEvents
    this.tossEvents = null
    events?.onAllSettled?.()
    this.scheduleShimmer()
  }

  /* ------------------------------ 特效 ------------------------------ */

  private addRipple(
    x: number,
    y: number,
    from: number,
    to: number,
    life: number,
    alpha: number,
    width: number,
    dashed: boolean,
    color: RGB,
    delay = 0,
  ) {
    this.ripples.push({ x, y, from, to, life, maxLife: life, alpha, width, dashed, color, delay })
  }

  private clink() {
    const [a, b] = this.closestPair()
    const R = this.layout.radius
    const x = (a.pose.x + b.pose.x) / 2
    const y = (a.pose.y + b.pose.y) / 2
    const z = (a.pose.z + b.pose.z) / 2
    for (let i = 0; i < 5; i++) {
      const angle = random(0, Math.PI * 2)
      const speed = R * random(2.2, 4.5)
      this.particles.push({
        kind: i === 0 ? 'flare' : 'spark',
        x,
        y,
        z,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 0,
        life: random(0.1, 0.22),
        maxLife: 0.22,
        size: i === 0 ? 2 : 1.5,
        color: i === 0 ? HOT : Math.random() < 0.25 ? SIGNAL : EMBER,
        gravity: 0,
        drag: 7,
      })
    }
    this.trauma = Math.min(1, this.trauma + 0.07)
  }

  private closestPair(): [CoinBody, CoinBody] {
    let best: [CoinBody, CoinBody] = [this.coins[0]!, this.coins[1]!]
    let distance = Infinity
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = this.coins[i]!
        const b = this.coins[j]!
        const d = Math.hypot(a.pose.x - b.pose.x, a.pose.y - b.pose.y)
        if (d < distance) {
          distance = d
          best = [a, b]
        }
      }
    }
    return best
  }

  private impact(body: CoinBody, index: number, speed: number) {
    const R = this.layout.radius
    const strength = clamp(speed / (R * 18), 0.12, 1)
    const count = Math.round(4 + 12 * strength * (index === 0 ? 1 : 0.5))
    for (let i = 0; i < count; i++) {
      const angle = random(0, Math.PI * 2)
      const outward = R * random(1.2, 2.8) * strength
      const mint = Math.random() < 0.18
      this.particles.push({
        kind: 'dust',
        x: body.pose.x + Math.cos(angle) * R * 0.92,
        y: body.pose.y + Math.sin(angle) * R * 0.92,
        z: R * 0.05,
        vx: Math.cos(angle) * outward,
        vy: Math.sin(angle) * outward,
        vz: R * random(0.6, 2) * strength,
        life: random(0.3, 0.6),
        maxLife: 0.6,
        size: mint ? 1.5 : 2,
        color: mint ? SIGNAL : Math.random() < 0.5 ? DUST : BRONZE,
        gravity: R * 14,
        drag: 3.2,
      })
    }
    if (index === 0) {
      this.addRipple(body.pose.x, body.pose.y, R * 0.9, R * 1.8, 0.42, 0.42 * strength + 0.1, 1.5, true, SIGNAL)
    }
    this.trauma = Math.min(1, this.trauma + (index === 0 ? 0.24 : 0.08) * strength)
  }

  /** 欧拉盘最后“啪”一声平躺 */
  private clack(body: CoinBody) {
    const R = this.layout.radius
    this.addRipple(body.pose.x, body.pose.y, R * 0.96, R * 1.3, 0.26, 0.38, 1, false, EMBER)
    for (let i = 0; i < 4; i++) {
      const angle = random(0, Math.PI * 2)
      this.particles.push({
        kind: 'spark',
        x: body.pose.x + Math.cos(angle) * R,
        y: body.pose.y + Math.sin(angle) * R,
        z: 0,
        vx: Math.cos(angle) * R * 1.6,
        vy: Math.sin(angle) * R * 1.6,
        vz: 0,
        life: 0.18,
        maxLife: 0.18,
        size: 1.5,
        color: EMBER,
        gravity: 0,
        drag: 6,
      })
    }
    this.trauma = Math.min(1, this.trauma + 0.05)
  }

  private scheduleShimmer() {
    window.clearTimeout(this.shimmerTimer)
    if (!this.motion || this.destroyed) return
    this.shimmerTimer = window.setTimeout(() => {
      if (
        this.mode === 'idle'
        && !this.pointer
        && this.visible
        && document.visibilityState === 'visible'
        && this.dim.target === 0
      ) {
        this.shimmer = { start: this.clock }
        this.lightX.value = this.lightX.target = -this.layout.width * 0.15
        this.lightY.value = this.lightY.target = this.layout.center.y - this.layout.height * 0.2
        this.lightX.velocity = 0
        this.lightY.velocity = 0
        this.kick()
      }
      this.scheduleShimmer()
    }, random(5200, 8400))
  }

  private endShimmer() {
    this.shimmer = null
  }

  /* ------------------------------ 帧循环 ------------------------------ */

  private kick() {
    if (this.raf || this.destroyed || !this.motion) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.destroyed) return
    const real = this.lastFrame ? clamp((now - this.lastFrame) / 1000, 0, 0.05) : 1 / 60
    this.lastFrame = now
    this.step(real)
    this.render()
    if (this.active()) this.raf = requestAnimationFrame(this.frame)
    else this.lastFrame = 0
  }

  private step(real: number) {
    let dt = real
    if (this.hitStop > 0) {
      this.hitStop -= real
      dt = 0
    } else if (this.mode === 'tossing' && this.speedRamp !== null) {
      // 变速：铜钱升到最高点时放慢，像镜头里的一次“升格”
      const x = (this.tossClock - this.speedRamp) / 0.2
      if (Math.abs(x) < 1) dt *= 1 - 0.5 * Math.cos((Math.PI * x) / 2) ** 2
    }
    this.clock += dt
    this.realClock += real

    if (this.mode === 'shaking') this.updateShake(dt)
    else if (this.mode === 'tossing') this.updateToss(dt)
    else this.updateIdle(real)
    this.updateEffects(dt, real)
  }

  private updateShake(dt: number) {
    const t = (this.shakeClock += dt)
    const { center, radius: R } = this.layout
    const active = Math.max(0, t - 0.1)
    const envelope = 1 - Math.exp(-active / 0.3)
    const omega = Math.PI * 2 * 2.4
    const handX = center.x + R * 0.55 * Math.sin(omega * active) * envelope
    const handY = center.y - R * 0.1 + R * 0.16 * Math.sin(2 * omega * active + 0.7) * envelope

    const direction = Math.sign(Math.cos(omega * active))
    if (envelope > 0.35 && this.handDirection && direction !== this.handDirection) this.clink()
    this.handDirection = direction

    this.focusX.target = handX
    this.focusY.target = handY
    const spinEnvelope = clamp01((t - 0.08) / 0.25)
    const steps = Math.max(1, Math.ceil(dt * 240))
    const h = dt / steps

    this.coins.forEach((body, index) => {
      const orbit = (Math.PI * 2 * index) / 3 + active * Math.PI * 2 * 0.45
      const radius = R * 0.72 * (0.4 + 0.6 * envelope)
      const targetX = handX + radius * Math.cos(orbit)
      const targetY = handY + radius * 0.7 * Math.sin(orbit)
      // 起手先下压（预备动作），再被托起
      const targetZ = t < 0.1
        ? -R * 0.28
        : R * (1.3 + 0.28 * index + 0.22 * Math.sin(2 * omega * active + index * 2.1) * envelope)
      const k = 512 * body.stiffness
      const c = 15.8 * Math.sqrt(body.stiffness)
      for (let i = 0; i < steps; i++) {
        body.vx += (k * (targetX - body.pose.x) - c * body.vx) * h
        body.vy += (k * (targetY - body.pose.y) - c * body.vy) * h
        body.vz += (300 * (targetZ - body.pose.z) - 15.6 * body.vz) * h
        body.pose.x += body.vx * h
        body.pose.y += body.vy * h
        body.pose.z += body.vz * h
      }
      const spinGoal = body.spinTarget * (0.65 + 0.35 * Math.sin(1.9 * t + index * 1.7)) * spinEnvelope
      body.spin += (spinGoal - body.spin) * (1 - Math.exp(-dt / 0.12))
      body.pose.theta += body.spin * dt
      body.pose.phiS += (index - 1 || 0.6) * 0.9 * dt
      body.pose.psi += (index % 2 ? 0.7 : -0.7) * dt
      body.pose.alpha *= Math.exp(-dt / 0.1)
    })
  }

  private updateToss(dt: number) {
    this.tossClock += dt
    let allSettled = true
    this.coins.forEach((body, index) => {
      const plan = body.plan
      if (!plan || body.settled) return
      body.pose = evalToss(plan, this.tossClock)
      while (
        body.impactIndex < plan.impacts.length
        && this.tossClock >= plan.impacts[body.impactIndex]!.time
      ) {
        this.impact(body, body.impactIndex, plan.impacts[body.impactIndex]!.speed)
        body.impactIndex++
      }
      if (this.tossClock >= plan.settleTime) this.settle(index)
      else allSettled = false
    })
    if (allSettled) this.finishToss()
  }

  private updateIdle(real: number) {
    const R = this.layout.radius
    this.coins.forEach((body, index) => {
      const rest = this.restOf(body, index)
      const near = this.pointer
        && Math.hypot(this.pointer.x - rest.x, this.pointer.y - rest.y) < R * 1.3
      body.hover.target = near ? 1 : 0
      stepSpring(body.hover, real, 170, 15)
      const lift = body.hover.value
      let alpha = 0
      let phiW = 0
      if (this.pointer && Math.abs(lift) > 0.001) {
        const dx = this.pointer.x - rest.x
        const dy = this.pointer.y - rest.y
        // 靠近鼠标的一侧微微翘起，像被吸引
        alpha = 0.08 * lift * clamp01(Math.hypot(dx, dy) / R)
        phiW = Math.atan2(-dx, dy)
      }
      body.pose = { ...body.pose, x: rest.x, y: rest.y, z: R * 0.1 * lift, psi: rest.psi, alpha, phiW }
    })
  }

  private updateEffects(dt: number, real: number) {
    const R = this.layout.radius
    stepSpring(this.zoom, real, 90, 13)
    stepSpring(this.focusX, real, 60, 14)
    stepSpring(this.focusY, real, 60, 14)
    if (this.mode !== 'shaking') {
      this.focusX.target = this.layout.center.x
      this.focusY.target = this.layout.center.y
      if (this.mode === 'idle') this.zoom.target = 1
    }
    this.trauma = Math.max(0, this.trauma - real * 1.7)
    this.flash *= Math.exp(-real / 0.07)

    stepSpring(this.ringGlow, real, 40, 9)
    const ringTarget = this.mode === 'shaking' ? 0.9 : 0
    this.ringSpeed += (ringTarget - this.ringSpeed) * (1 - Math.exp(-real / 0.6))
    this.ringAngle += this.ringSpeed * dt

    if (this.pointer && this.mode === 'idle') {
      this.lightFocus.target = 1
      this.lightX.target = this.pointer.x
      this.lightY.target = this.pointer.y
      this.lightZ = R * 2.3
    } else if (this.shimmer) {
      const p = (this.clock - this.shimmer.start) / SHIMMER_TIME
      if (p >= 1 || this.mode !== 'idle') {
        this.shimmer = null
        this.lightFocus.target = 0
      } else {
        this.lightFocus.target = 1
        this.lightX.target = -this.layout.width * 0.15 + this.layout.width * 1.3 * easeInOutSine(p)
        this.lightZ = R * 2.1
      }
    } else {
      this.lightFocus.target = 0
    }
    stepSpring(this.lightFocus, real, 26, 10)
    stepSpring(this.lightX, real, 80, 17)
    stepSpring(this.lightY, real, 80, 17)
    stepSpring(this.dim, real, 30, 11)

    this.particles = this.particles.filter((p) => {
      p.life -= dt
      if (p.life <= 0) return false
      const drag = Math.exp(-p.drag * dt)
      p.vx *= drag
      p.vy *= drag
      p.vz -= p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.z < 0 && p.gravity > 0) {
        p.z = 0
        p.vz *= -0.25
      }
      return true
    })
    this.ripples = this.ripples.filter((ripple) => {
      if (ripple.delay > 0) ripple.delay -= dt
      else ripple.life -= dt
      return ripple.life > 0
    })
  }

  private active(): boolean {
    return this.mode !== 'idle'
      || this.hitStop > 0
      || this.particles.length > 0
      || this.ripples.length > 0
      || this.trauma > 0.002
      || this.flash > 0.01
      || this.shimmer !== null
      || Math.abs(this.ringSpeed) > 0.01
      || springMoving(this.zoom, 0.0005)
      || springMoving(this.focusX, 0.1)
      || springMoving(this.focusY, 0.1)
      || springMoving(this.ringGlow, 0.002)
      || springMoving(this.lightFocus, 0.002)
      || (this.lightFocus.value > 0.002
        && (springMoving(this.lightX, 0.2) || springMoving(this.lightY, 0.2)))
      || springMoving(this.dim, 0.002)
      || this.coins.some((body) => springMoving(body.hover, 0.002))
  }

  /* ------------------------------ 绘制 ------------------------------ */

  private render() {
    const { ctx, canvas } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'

    const camera = this.camera()
    const R = this.layout.radius
    for (const body of this.coins) {
      body.frame = coinFrame(body.pose)
      const tilt = Math.sqrt(Math.max(0, 1 - body.frame.n.z ** 2))
      // 倾斜时靠边缘支撑，币心随之抬高
      body.lift = Math.max(body.pose.z, R * tilt * 0.85)
    }
    const order = [...this.coins].sort((a, b) => a.lift - b.lift)

    this.drawBagua(camera)
    this.drawRipples(camera)
    for (const body of order) this.drawShadow(body, camera)
    this.drawParticles(camera, false)
    for (const body of order) this.drawCoin(body, camera)
    this.drawParticles(camera, true)

    if (this.flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(SIGNAL, 0.13 * this.flash)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  private camera(): Matrix {
    const t = this.realClock * 34
    const shake = this.trauma ** 2
    const ox = 7 * shake * wobble(t, 0)
    const oy = 7 * shake * wobble(t * 0.93, 1.7)
    const rotation = 0.014 * shake * wobble(t * 0.81, 3.1)
    const zoom = this.zoom.value
    const cos = Math.cos(rotation) * zoom
    const sin = Math.sin(rotation) * zoom
    const fx = this.focusX.value
    const fy = this.focusY.value
    return {
      a: cos,
      b: sin,
      c: -sin,
      d: cos,
      e: fx - (cos * fx - sin * fy) + ox,
      f: fy - (sin * fx + cos * fy) + oy,
    }
  }

  private setAffine(m: Matrix, l11: number, l21: number, l12: number, l22: number, x: number, y: number) {
    const s = this.dpr
    this.ctx.setTransform(
      s * (m.a * l11 + m.c * l21),
      s * (m.b * l11 + m.d * l21),
      s * (m.a * l12 + m.c * l22),
      s * (m.b * l12 + m.d * l22),
      s * (m.a * x + m.c * y + m.e),
      s * (m.b * x + m.d * y + m.f),
    )
  }

  private project(x: number, y: number, z: number) {
    const F = PERSPECTIVE * this.layout.radius
    const s = F / (F - clamp(z, -F * 0.5, F * 0.8))
    const { center } = this.layout
    return { x: center.x + (x - center.x) * s, y: center.y + (y - center.y) * s, s }
  }

  private level(deviceDiameter: number): number {
    const { sizes } = this.sprites
    for (let i = sizes.length - 1; i >= 0; i--) {
      if (sizes[i]! * COIN_RATIO >= deviceDiameter * 0.92) return i
    }
    return 0
  }

  private opacity(body: CoinBody): number {
    const faded = 1 - 0.72 * this.dim.value
    if (!body.fadeIn || !body.plan) return faded
    return faded * clamp01((this.tossClock - body.plan.shape.delay) / 0.16)
  }

  private lightDirection(pose: CoinPose): Vec3 {
    const focus = clamp01(this.lightFocus.value)
    if (focus < 0.001) return DEFAULT_LIGHT
    const point = normalize({
      x: this.lightX.value - pose.x,
      y: this.lightY.value - pose.y,
      z: this.lightZ - pose.z,
    })
    return normalize({
      x: DEFAULT_LIGHT.x + (point.x - DEFAULT_LIGHT.x) * focus,
      y: DEFAULT_LIGHT.y + (point.y - DEFAULT_LIGHT.y) * focus,
      z: DEFAULT_LIGHT.z + (point.z - DEFAULT_LIGHT.z) * focus,
    })
  }

  private drawShadow(body: CoinBody, camera: Matrix) {
    const opacity = this.opacity(body)
    if (opacity <= 0) return
    const R = this.layout.radius
    const { u, v } = body.frame
    const light = this.lightDirection(body.pose)
    const lz = Math.max(light.z, 0.35)
    // 沿光线把圆片投到桌面上：仍是仿射变换
    const sx = -light.x / lz
    const sy = -light.y / lz
    const height = body.lift / R
    const reach = body.lift + R * 0.06
    const x = body.pose.x + sx * reach * 0.5 + R * 0.02
    const y = body.pose.y + sy * reach * 0.5 + R * 0.07
    const k = R / this.sprites.shadowRadius
    const blurMix = clamp01((height - 0.12) / 0.8)
    const softMix = clamp01((height - 0.9) / 1.3)
    const weights = [1 - blurMix, blurMix * (1 - softMix), blurMix * softMix]
    const alpha = (0.6 / (1 + 0.7 * height)) * opacity
    const half = this.sprites.shadowSize / 2
    weights.forEach((weight, index) => {
      if (weight < 0.01) return
      this.ctx.globalAlpha = alpha * weight
      this.setAffine(
        camera,
        k * (u.x + u.z * sx),
        k * (u.y + u.z * sy),
        k * (v.x + v.z * sx),
        k * (v.y + v.z * sy),
        x,
        y,
      )
      this.ctx.drawImage(this.sprites.shadows[index]!, -half, -half)
    })
    this.ctx.globalAlpha = 1
  }

  private drawCoin(body: CoinBody, camera: Matrix) {
    const opacity = this.opacity(body)
    if (opacity <= 0) return
    const plan = body.plan
    if (plan && this.mode === 'tossing' && !body.fadeIn) {
      const tau = this.tossClock - plan.shape.delay
      if (tau > 0 && tau < plan.shape.flightTime) {
        const blur = clamp01(Math.abs(plan.spin) / 30)
        for (const [lag, alpha] of GHOSTS) {
          const pose = evalToss(plan, this.tossClock - lag)
          this.drawDisc(pose, coinFrame(pose), pose.z, camera, alpha * blur * opacity, false)
        }
      }
    }
    this.drawDisc(body.pose, body.frame, body.lift, camera, opacity, true)
  }

  private drawDisc(
    pose: CoinPose,
    frame: CoinFrame,
    lift: number,
    camera: Matrix,
    opacity: number,
    solid: boolean,
  ) {
    const { ctx, sprites } = this
    const R = this.layout.radius
    const p = this.project(pose.x, pose.y, lift)
    const front = frame.n.z >= 0
    const fu = frame.u
    const fv = front ? frame.v : negate(frame.v)
    const level = this.level(2 * R * p.s * this.zoom.value * this.dpr)
    const size = sprites.sizes[level]!
    const half = size / 2
    const k = (R / (half * COIN_RATIO)) * p.s
    // 朝向镜头的币面在币心沿法线偏移半个币厚处
    const offset = R * THICKNESS * p.s * (front ? 0.5 : -0.5)
    const faceX = p.x + frame.n.x * offset
    const faceY = p.y + frame.n.y * offset

    ctx.globalAlpha = opacity
    if (solid) {
      this.drawRim(camera, faceX, faceY, -2 * frame.n.x * offset, -2 * frame.n.y * offset, R * p.s, fu, fv)
    }
    this.setAffine(camera, k * fu.x, k * fu.y, k * fv.x, k * fv.y, faceX, faceY)
    ctx.drawImage((front ? sprites.heads : sprites.tails)[level]!, -half, -half, size, size)
    if (solid) this.shadeFace(pose, front ? frame.n : negate(frame.n), fu, fv, half)
    ctx.globalAlpha = 1
  }

  /**
   * 币厚：近、远两个币面椭圆的包络，一次填充即可（原先是逐层叠画剪影）。
   * 在近面坐标系里两个方孔都是轴对齐正方形，它们的交集就是能直接看穿的部分。
   */
  private drawRim(
    camera: Matrix,
    x: number,
    y: number,
    ox: number,
    oy: number,
    radius: number,
    fu: Vec3,
    fv: Vec3,
  ) {
    const length = Math.hypot(ox, oy)
    if (length * this.zoom.value * this.dpr < 0.5) return
    const { ctx } = this
    const r = radius * 0.99
    const ax = r * fu.x
    const ay = r * fu.y
    const bx = r * fv.x
    const by = r * fv.y
    // 椭圆 x + a·cosφ + b·sinφ 上切线平行于偏移方向的两点
    const start = Math.atan2(bx * oy - by * ox, ax * oy - ay * ox)
    const outward = Math.atan2(bx * ox + by * oy, ax * ox + ay * oy)
    const forward = (((outward - start) % TAU) + TAU) % TAU < Math.PI
    const sweep = forward ? Math.PI : -Math.PI

    ctx.beginPath()
    this.setAffine(camera, ax, ay, bx, by, x + ox, y + oy)
    ctx.arc(0, 0, 1, start, start + sweep, !forward)
    this.setAffine(camera, ax, ay, bx, by, x, y)
    ctx.arc(0, 0, 1, start + sweep, start + 2 * sweep, !forward)
    ctx.closePath()
    const det = ax * by - ay * bx
    if (Math.abs(det) > r * r * 1e-3) {
      const dx = (ox * by - oy * bx) / det
      const dy = (ax * oy - ay * ox) / det
      const hole = HOLE_RATIO / 0.99
      const x0 = -hole + Math.max(0, dx)
      const x1 = hole + Math.min(0, dx)
      const y0 = -hole + Math.max(0, dy)
      const y1 = hole + Math.min(0, dy)
      if (x1 > x0 && y1 > y0) ctx.rect(x0, y0, x1 - x0, y1 - y0)
    }

    // 近面边缘亮、远面边缘暗
    const ux = ox / length
    const uy = oy / length
    const reach = Math.hypot(ax * ux + ay * uy, bx * ux + by * uy)
    const gx = x + ux * reach
    const gy = y + uy * reach
    this.setAffine(camera, 1, 0, 0, 1, 0, 0)
    const gradient = ctx.createLinearGradient(gx, gy, gx + ox, gy + oy)
    gradient.addColorStop(0, '#a56d2e')
    gradient.addColorStop(0.35, '#6f4518')
    gradient.addColorStop(1, '#35200b')
    ctx.fillStyle = gradient
    ctx.fill('evenodd')
  }

  /** 在当前币面坐标系内叠加明暗与高光（方孔处镂空） */
  private shadeFace(pose: CoinPose, normal: Vec3, fu: Vec3, fv: Vec3, half: number) {
    const { ctx } = this
    const light = this.lightDirection(pose)
    const halfway = normalize({ x: light.x, y: light.y, z: light.z + 1 })
    const diffuse = dot(normal, light)
    const facing = Math.max(0, dot(normal, halfway))
    const dim = this.dim.value
    const shade = 1 - (1 - clamp((REST_DIFFUSE - diffuse) * 0.9, 0, 0.6)) * (1 - 0.55 * dim)
    const specular = (0.5 * facing ** 22 + 0.9 * facing ** 180) * (1 - 0.85 * dim)
    const radius = half * COIN_RATIO * 0.985
    const hole = half * COIN_RATIO * HOLE_RATIO

    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.rect(-hole, -hole, hole * 2, hole * 2)
    if (shade > 0.005) {
      ctx.fillStyle = `rgba(5,9,8,${shade.toFixed(3)})`
      ctx.fill('evenodd')
    }
    if (specular > 0.01) {
      const hx = dot(halfway, fu) * radius * 1.4
      const hy = dot(halfway, fv) * radius * 1.4
      const gradient = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 1.3)
      gradient.addColorStop(0, `rgba(255,238,200,${Math.min(1, specular).toFixed(3)})`)
      gradient.addColorStop(0.4, `rgba(255,196,120,${(specular * 0.35).toFixed(3)})`)
      gradient.addColorStop(1, 'rgba(255,180,100,0)')
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = gradient
      ctx.fill('evenodd')
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  private drawBagua(camera: Matrix) {
    const glow = this.ringGlow.value * (1 - this.dim.value)
    if (glow < 0.004) return
    const { ctx } = this
    const { ringRadius: radius, center } = this.layout
    const s = this.dpr
    ctx.setTransform(s * camera.a, s * camera.b, s * camera.c, s * camera.d, s * camera.e, s * camera.f)
    ctx.translate(center.x, center.y)
    ctx.rotate(this.ringAngle)
    ctx.lineWidth = 1
    ctx.strokeStyle = rgba(SIGNAL, glow * 0.9)
    ctx.setLineDash([1.5, 4.5])
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = rgba(SIGNAL, glow * 0.4)
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.56, 0, Math.PI * 2)
    ctx.stroke()

    const length = radius * 0.19
    const bar = Math.max(1.5, radius * 0.028)
    const gap = bar * 2.4
    ctx.fillStyle = rgba(SIGNAL, glow)
    TRIGRAMS.forEach((lines, index) => {
      ctx.save()
      ctx.rotate((index * Math.PI) / 4)
      lines.forEach((yang, line) => {
        const y = -(radius * 0.68 + line * gap) - bar / 2
        if (yang) ctx.fillRect(-length / 2, y, length, bar)
        else {
          ctx.fillRect(-length / 2, y, length * 0.4, bar)
          ctx.fillRect(length * 0.1, y, length * 0.4, bar)
        }
      })
      ctx.restore()
    })

    if (glow > 0.3) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = rgba(SIGNAL, (glow - 0.3) * 0.22)
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  private drawRipples(camera: Matrix) {
    const { ctx } = this
    const s = this.dpr
    ctx.setTransform(s * camera.a, s * camera.b, s * camera.c, s * camera.d, s * camera.e, s * camera.f)
    for (const ripple of this.ripples) {
      if (ripple.delay > 0) continue
      const p = 1 - ripple.life / ripple.maxLife
      const radius = ripple.from + (ripple.to - ripple.from) * (1 - (1 - p) ** 3)
      ctx.strokeStyle = rgba(ripple.color, ripple.alpha * (1 - p) ** 1.5)
      ctx.lineWidth = ripple.width
      ctx.setLineDash(ripple.dashed ? [2, 4] : [])
      ctx.beginPath()
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  /** 粒子对齐 CSS 像素网格，保持像素风的颗粒感 */
  private drawParticles(camera: Matrix, additive: boolean) {
    const { ctx } = this
    const s = this.dpr
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over'
    for (const particle of this.particles) {
      if ((particle.kind !== 'dust') !== additive) continue
      const projected = this.project(particle.x, particle.y, particle.z)
      const x = Math.round(camera.a * projected.x + camera.c * projected.y + camera.e)
      const y = Math.round(camera.b * projected.x + camera.d * projected.y + camera.f)
      const life = particle.life / particle.maxLife
      const alpha = particle.kind === 'dust' ? 0.75 * life ** 0.7 : life
      ctx.fillStyle = rgba(particle.color, alpha * (1 - 0.6 * this.dim.value))
      const size = Math.max(1, Math.round(particle.size * projected.s))
      if (particle.kind === 'flare') {
        const arm = Math.round(1 + 3 * life)
        ctx.fillRect(x - arm, y, arm * 2 + 1, 1)
        ctx.fillRect(x, y - arm, 1, arm * 2 + 1)
        ctx.fillRect(x - 1, y - 1, 3, 3)
      } else {
        ctx.fillRect(x - (size >> 1), y - (size >> 1), size, size)
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
