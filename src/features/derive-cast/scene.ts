/**
 * 罗盘推演舞台：两圈先天八卦盘各自转动，把所得之卦送到盘顶的窗里叠成本卦，再自初爻数出动爻。
 *
 * 数字、时间、汉字三种起卦共用。结果在点击时已经算定，转动轨迹由 dial.ts 预先规划，
 * 这里只按时间求值并补上顿挫、火花与拖影。
 */
import { BRANCHES, TRIGRAMS } from '@/data/trigrams'
import type { TrigramKey } from '@/data/trigrams'
import { clamp01 } from '@/features/coin-shake/choreography'
import {
  COIN_LIGHT,
  EMBER,
  FLUX,
  HOT,
  INK,
  SIGNAL,
  SparkField,
  TAU,
  rgba,
  spring,
  springMoving,
  stageCamera,
  stepSpring,
} from '@/features/stage/fx'
import type { RGB, StageCamera } from '@/features/stage/fx'
import { motionEnabled } from '@/lib/motion'
import type { StageScene, StageSize } from '@/components/useSceneStage'
import {
  BRANCH_AT_TOP,
  MOVING_GLITCH_TIME,
  RING_ORDER,
  dialLayout,
  evalSpin,
  planDial,
  ringSlotOf,
  windowLineRadius,
} from './dial'
import type { DialLayout, DialPlan, SpinPlan } from './dial'

export interface DialCast {
  upperKey: TrigramKey
  lowerKey: TrigramKey
  /** 0 为初爻 */
  movingLine: number
  /** 三步各自得出的序数，显示在盘心 */
  ordinals: readonly [number, number, number]
  /** 时间起卦：各步点亮的地支（0 为子） */
  branches: readonly (number | undefined)[]
}

export interface DialSceneEvents {
  /** 第 index 步（上卦、下卦、动爻）开始 */
  onStep?: (index: number) => void
  /** 第 index 步得出结果 */
  onResolve?: (index: number) => void
  onComplete?: () => void
}

interface Run {
  cast: DialCast
  plan: DialPlan
  events: DialSceneEvents
  started: number
  resolved: number
  counted: number
  /** 上一帧两盘各自转过的卦位数，用来判断是否有卦掠过盘顶 */
  sectors: [number, number]
  done: boolean
}

const SECTOR = Math.PI / 4
const FOG: RGB = [127, 163, 152]
const GLOW_IDLE = 0.4
const GLOW_CAST = 0.78
const REEL_STEP = 0.05
const TEXT_FONT = '"Fusion Pixel 12", ui-monospace, monospace'
/** 运动模糊：[回溯时间, 不透明度]，从最旧画起 */
const GHOSTS = [
  [0.014, 0.14],
  [0.0095, 0.2],
  [0.005, 0.28],
] as const
/** 盘外的装饰弧：[半径倍数, 随动系数, 是否带刻度] */
const FAR_ARCS = [
  [1.72, 0.5, false],
  [2.28, -0.34, true],
  [2.95, 0.22, false],
  [3.75, -0.15, true],
  [4.7, 0.1, false],
] as const

export class DialScene implements StageScene {
  private layout: DialLayout
  private dpr = 1
  private motion = motionEnabled()
  private visible = true
  private destroyed = false
  private raf = 0
  private lastFrame = 0
  private clock = 0
  private run: Run | null = null
  private runClock = 0
  private seedGlyph = ''

  private readonly outerRest = spring(0)
  private readonly innerRest = spring(0)
  private readonly glow = spring(0)
  private readonly dim = spring(0)
  private readonly zoom = spring(1)
  private readonly driftSpeed = spring(0)
  private drift = 0
  private trauma = 0
  private flash = 0
  private tick = 0
  private hitStop = 0
  private readonly fx = new SparkField()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    size: StageSize,
  ) {
    this.layout = dialLayout(size.width, size.height)
    this.glow.target = GLOW_IDLE
    if (this.motion) {
      // 入场：两盘反向旋入并归位
      this.outerRest.value = -1.15
      this.innerRest.value = 1.15
    } else {
      this.glow.value = GLOW_IDLE
    }
    this.resize(size.width, size.height, size.dpr)
    // 盘面文字用像素字体；尚未载入时先用后备字体画，载入后重画一次
    void document.fonts?.load(`12px ${TEXT_FONT}`).then(() => {
      if (!this.destroyed) this.render()
    }, () => undefined)
    this.kick()
  }

  /* ------------------------------ 公共指令 ------------------------------ */

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.layout = dialLayout(width, height)
    this.render()
  }

  /** 待机时显示在盘心的字 */
  setSeedGlyph(glyph: string) {
    if (glyph === this.seedGlyph) return
    this.seedGlyph = glyph
    this.render()
  }

  cast(cast: DialCast, events: DialSceneEvents) {
    this.motion = motionEnabled()
    this.run = {
      cast,
      plan: planDial({
        upperSlot: ringSlotOf(cast.upperKey),
        lowerSlot: ringSlotOf(cast.lowerKey),
        movingLine: cast.movingLine,
        upperFrom: this.outerRest.value,
        lowerFrom: this.innerRest.value,
      }),
      events,
      started: 0,
      resolved: 0,
      counted: 0,
      sectors: [0, 0],
      done: false,
    }
    this.run.sectors = [
      Math.floor(this.run.plan.upper.from / SECTOR),
      Math.floor(this.run.plan.lower.from / SECTOR),
    ]
    this.runClock = 0
    this.fx.clear()
    this.dim.target = 0
    if (!this.motion) {
      this.skip()
      return
    }
    this.glow.target = GLOW_CAST
    this.glow.velocity += 2.5
    this.driftSpeed.target = 1
    this.flash = 0.6
    this.zoom.velocity += 0.45
    this.kick()
  }

  /** 立即得出全部结果并触发尚未发出的回调 */
  skip() {
    const run = this.run
    if (!run || run.done) return
    this.runClock = run.plan.complete + 1
    this.hitStop = 0
    while (run.started < 3) run.events.onStep?.(run.started++)
    while (run.resolved < 3) run.events.onResolve?.(run.resolved++)
    this.finish(run, false)
    this.render()
  }

  /** 卦成后压暗盘面，让出舞台给卦象 */
  setDim(on: boolean) {
    this.dim.target = on ? 1 : 0
    if (!this.motion) {
      this.dim.value = this.dim.target
      this.render()
      return
    }
    this.kick()
  }

  setVisible(visible: boolean) {
    this.visible = visible
    if (visible) this.kick()
  }

  destroy() {
    this.destroyed = true
    this.run = null
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  /* ------------------------------ 帧循环 ------------------------------ */

  private kick() {
    if (this.raf || this.destroyed || !this.motion || !this.visible) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.destroyed) return
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 1 / 60
    this.lastFrame = now
    this.step(dt)
    this.render()
    if (this.visible && this.busy()) this.raf = requestAnimationFrame(this.frame)
    else this.lastFrame = 0
  }

  private busy(): boolean {
    return (this.run !== null && this.runClock < this.run.plan.complete + 0.6)
      || this.fx.active
      || this.hitStop > 0
      || this.trauma > 0.002
      || this.flash > 0.01
      || this.tick > 0.01
      || Math.abs(this.driftSpeed.value) > 0.004
      || springMoving(this.driftSpeed, 0.004)
      || springMoving(this.outerRest, 0.0008)
      || springMoving(this.innerRest, 0.0008)
      || springMoving(this.glow, 0.003)
      || springMoving(this.dim, 0.004)
      || springMoving(this.zoom, 0.0005)
  }

  private step(real: number) {
    let dt = real
    if (this.hitStop > 0) {
      this.hitStop -= real
      dt = 0
    }
    this.clock += real
    stepSpring(this.outerRest, real, 38, 9.5)
    stepSpring(this.innerRest, real, 38, 9.5)
    stepSpring(this.glow, real, 40, 10)
    stepSpring(this.dim, real, 30, 11)
    stepSpring(this.zoom, real, 90, 13)
    stepSpring(this.driftSpeed, real, 12, 7)
    this.drift += this.driftSpeed.value * dt * 0.5
    this.trauma = Math.max(0, this.trauma - real * 1.8)
    this.flash *= Math.exp(-real / 0.07)
    this.tick *= Math.exp(-real / 0.06)
    if (this.run) this.advance(this.run, dt)
    this.fx.step(dt)
  }

  private advance(run: Run, dt: number) {
    const before = this.runClock
    this.runClock += dt
    const t = this.runClock
    const { plan } = run
    const R = this.layout.radius

    while (run.started < 3 && t >= plan.stepStarts[run.started]!) run.events.onStep?.(run.started++)

    // 卦掠过盘顶时“咔”地一响：转得慢下来才看得清，快的时候只留拖影
    const spins = [plan.upper, plan.lower] as const
    spins.forEach((spin, ring) => {
      const sector = Math.floor(evalSpin(spin, t) / SECTOR)
      if (sector === run.sectors[ring]) return
      run.sectors[ring] = sector
      if (t <= spin.start || t >= spin.lock) return
      const speed = Math.abs(evalSpin(spin, t) - evalSpin(spin, before)) / Math.max(dt, 1e-4)
      if (speed > 17) return
      this.tick = 1
      this.trauma = Math.min(1, this.trauma + 0.025)
      const pointer = this.windowPoint(ring === 0 ? 1.02 : 0.69)
      this.fx.burst(pointer.x, pointer.y, {
        count: 2,
        speed: [R * 0.5, R * 1.3],
        life: [0.08, 0.18],
        colors: [EMBER, HOT],
        size: 1.5,
        drag: 7,
        direction: -Math.PI / 2 + (spin.direction > 0 ? 0.9 : -0.9),
        spread: 1.2,
      })
    })

    while (run.resolved < 2 && t >= plan.resolves[run.resolved]!) {
      const ring = run.resolved++
      this.lockRing(ring)
      run.events.onResolve?.(ring)
    }

    // 自初爻数到动爻
    const { moving } = plan
    if (t >= moving.start && run.resolved === 2) {
      const count = Math.min(moving.steps, Math.floor((t - moving.start) / moving.stepTime) + 1)
      while (run.counted < count) {
        const line = run.counted++
        const point = this.windowPoint(windowLineRadius(this.layout, line) / R)
        this.tick = 1
        this.trauma = Math.min(1, this.trauma + 0.02)
        this.fx.burst(point.x - this.layout.bar.length * 0.72, point.y, {
          count: 2,
          speed: [R * 0.4, R * 1],
          life: [0.08, 0.16],
          colors: [EMBER, HOT],
          size: 1.5,
          drag: 7,
          direction: Math.PI,
          spread: 1.6,
        })
      }
      if (t >= moving.land) {
        run.resolved = 3
        const point = this.windowPoint(windowLineRadius(this.layout, run.cast.movingLine) / R)
        this.fx.pulse(point.x, point.y, {
          shape: 'box',
          from: this.layout.bar.length * 0.55,
          to: this.layout.bar.length * 1.5,
          aspect: 0.45,
          life: 0.42,
          alpha: 0.85,
          color: FLUX,
          width: 1.5,
        })
        this.fx.burst(point.x, point.y, {
          count: 12,
          speed: [R * 0.8, R * 2.6],
          life: [0.16, 0.36],
          colors: [FLUX, HOT, EMBER],
          flareEvery: 4,
          drag: 5,
        })
        this.trauma = Math.min(1, this.trauma + 0.28)
        this.zoom.velocity += 0.5
        this.hitStop = 0.05
        run.events.onResolve?.(2)
      }
    }

    if (!run.done && t >= plan.complete) this.finish(run, true)
  }

  /** 一圈卦盘转到位：顿帧、闪光，沿盘面荡开一圈 */
  private lockRing(ring: number) {
    const { layout } = this
    const R = layout.radius
    const band = ring === 0 ? 0.87 : 0.5
    const point = this.windowPoint(band)
    this.hitStop = 0.055
    this.flash = 0.9
    this.tick = 1
    this.trauma = Math.min(1, this.trauma + 0.3)
    this.zoom.velocity += 0.75
    this.glow.velocity += 1.6
    this.fx.pulse(layout.center.x, layout.center.y, {
      from: R * band,
      to: R * (band + 0.3),
      life: 0.5,
      alpha: 0.7,
      color: SIGNAL,
      width: 2,
    })
    this.fx.pulse(point.x, point.y, {
      from: R * 0.08,
      to: R * 0.5,
      life: 0.4,
      alpha: 0.55,
      color: EMBER,
      dashed: true,
      delay: 0.05,
    })
    this.fx.burst(point.x, point.y, {
      count: 16,
      speed: [R * 0.9, R * 3.2],
      life: [0.18, 0.4],
      colors: [SIGNAL, EMBER, HOT],
      flareEvery: 5,
      drag: 5,
    })
  }

  private finish(run: Run, withFx: boolean) {
    run.done = true
    this.glow.target = GLOW_IDLE
    this.driftSpeed.target = 0
    this.outerRest.value = this.outerRest.target = run.plan.upper.to
    this.innerRest.value = this.innerRest.target = run.plan.lower.to
    this.outerRest.velocity = 0
    this.innerRest.velocity = 0
    if (withFx && this.motion) {
      this.flash = 0.8
      this.fx.pulse(this.layout.center.x, this.layout.center.y, {
        from: this.layout.radius * 0.3,
        to: this.layout.radius * 1.5,
        life: 0.6,
        alpha: 0.5,
        color: SIGNAL,
        width: 1.5,
      })
    }
    run.events.onComplete?.()
  }

  /* ------------------------------ 几何 ------------------------------ */

  /** 盘顶窗口中、离盘心 fraction·R 处的舞台坐标 */
  private windowPoint(fraction: number) {
    const { center, radius } = this.layout
    return { x: center.x, y: center.y - radius * fraction }
  }

  private ringAngle(ring: number, lag = 0): number {
    const plan = this.spinOf(ring)
    if (plan) return evalSpin(plan, this.runClock - lag)
    return ring === 0 ? this.outerRest.value : this.innerRest.value
  }

  private spinOf(ring: number): SpinPlan | null {
    if (!this.run) return null
    return ring === 0 ? this.run.plan.upper : this.run.plan.lower
  }

  /* ------------------------------ 绘制 ------------------------------ */

  private render() {
    const { ctx, canvas, layout, dpr } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const camera = stageCamera(layout.center, this.zoom.value, this.trauma, this.clock)
    const fade = 1 - 0.8 * this.dim.value
    const s = dpr * camera.scale
    const dial = () => ctx.setTransform(
      s, 0, 0, s,
      dpr * (camera.x + layout.center.x * camera.scale),
      dpr * (camera.y + layout.center.y * camera.scale),
    )

    dial()
    this.drawFrame(fade)
    this.drawRing(1, fade, dial)
    this.drawRing(0, fade, dial)
    dial()
    this.drawWindow(fade)
    this.drawCount(fade)
    ctx.setTransform(s, 0, 0, s, dpr * camera.x, dpr * camera.y)
    this.fx.drawPulses(ctx, fade)
    this.drawBranches(camera, fade)
    this.drawCenter(camera, fade)
    this.fx.drawSparks(ctx, dpr, camera, fade)

    if (this.flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(SIGNAL, 0.11 * this.flash)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  /** 盘面的同心圆、分格线、刻度与盘外的装饰弧；原点在盘心 */
  private drawFrame(fade: number) {
    const { ctx, layout } = this
    const R = layout.radius
    const glow = this.glow.value * fade
    const reach = Math.hypot(layout.width, layout.height) / 2 + 4

    ctx.lineWidth = 1
    for (const [scale, follow, ticked] of FAR_ARCS) {
      const radius = R * scale
      if (radius > reach) break
      ctx.save()
      ctx.rotate(this.drift * follow)
      ctx.strokeStyle = rgba(SIGNAL, glow * 0.34)
      ctx.setLineDash(ticked ? [] : [2, 7])
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, TAU)
      ctx.stroke()
      ctx.setLineDash([])
      if (ticked) {
        ctx.fillStyle = rgba(SIGNAL, glow * 0.5)
        const count = Math.round(scale * 30)
        for (let i = 0; i < count; i++) {
          ctx.rotate(TAU / count)
          ctx.fillRect(-0.5, -radius - (i % 5 === 0 ? 6 : 3), 1, i % 5 === 0 ? 6 : 3)
        }
      }
      ctx.restore()
    }

    // 刻度环：七十二候，逢六加长
    ctx.save()
    ctx.rotate(-this.drift * 0.8)
    ctx.fillStyle = rgba(SIGNAL, glow * 0.7)
    for (let i = 0; i < 72; i++) {
      const long = i % 6 === 0
      ctx.fillRect(-0.5, -layout.tickRadius - (long ? R * 0.07 : R * 0.035), 1, long ? R * 0.07 : R * 0.035)
      ctx.rotate(TAU / 72)
    }
    ctx.restore()

    const circles: Array<[number, number, boolean]> = [
      [layout.tickRadius, 0.55, false],
      [R * 1.04, 0.8, false],
      [R * 0.685, 0.42, true],
      [layout.well + R * 0.045, 0.6, false],
    ]
    for (const [radius, alpha, dashed] of circles) {
      ctx.strokeStyle = rgba(SIGNAL, glow * alpha)
      ctx.setLineDash(dashed ? [1.5, 4.5] : [])
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0, TAU)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  /** 一圈卦盘：0 为外盘（上卦），1 为内盘（下卦） */
  private drawRing(ring: number, fade: number, dial: () => void) {
    const { ctx, layout, run } = this
    const R = layout.radius
    const start = ring === 0 ? layout.outerStart : layout.innerStart
    const plan = this.spinOf(ring)
    const t = this.runClock
    const locked = Boolean(run && plan && t >= plan.lock)
    const spinning = Boolean(plan && t > plan.start && !locked)
    const glow = this.glow.value * fade
    const angle = this.ringAngle(ring)
    const chosen = run ? ringSlotOf(ring === 0 ? run.cast.upperKey : run.cast.lowerKey) : -1
    const lockedFor = plan ? t - plan.lock : 0

    // 分格线随盘转动
    dial()
    ctx.rotate(angle + SECTOR / 2)
    ctx.fillStyle = rgba(SIGNAL, glow * (locked ? 0.2 : 0.36))
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(-0.5, -(start + R * 0.25), 1, R * 0.29)
      ctx.rotate(SECTOR)
    }

    const drawTrigrams = (theta: number, alpha: number, solid: boolean) => {
      for (let slot = 0; slot < 8; slot++) {
        const selected = solid && locked && slot === chosen
        if (selected) continue
        dial()
        ctx.rotate(theta + slot * SECTOR)
        ctx.fillStyle = rgba(SIGNAL, alpha * (locked ? 0.34 : 0.95))
        this.trigramBars(TRIGRAMS[RING_ORDER[slot]!].bits, start)
      }
    }

    if (spinning && plan) {
      const speed = Math.abs(evalSpin(plan, t) - evalSpin(plan, t - 0.004)) / 0.004
      const blur = clamp01(speed / 14)
      if (blur > 0.05) {
        for (const [lag, alpha] of GHOSTS) drawTrigrams(this.ringAngle(ring, lag), glow * alpha * blur, false)
      }
    }
    drawTrigrams(angle, Math.min(1, glow * (spinning ? 1.25 : 1)), true)

    if (locked && run) {
      // 窗里的三爻：定格时闪白，随后以墨色常亮
      const heat = clamp01(1 - lockedFor / 0.3)
      dial()
      ctx.rotate(angle + chosen * SECTOR)
      for (let k = 0; k < 3; k++) {
        const line = ring === 0 ? k + 3 : k
        this.windowBar(run, line, k, start, heat, fade)
      }
    }
  }

  /** 画一卦的三爻；原点在盘心、卦位已转到正上方 */
  private trigramBars(bits: number, start: number) {
    const { ctx } = this
    const { length, thickness, pitch } = this.layout.bar
    for (let k = 0; k < 3; k++) {
      const y = -(start + k * pitch) - thickness
      if ((bits >> k) & 1) ctx.fillRect(-length / 2, y, length, thickness)
      else {
        ctx.fillRect(-length / 2, y, length * 0.41, thickness)
        ctx.fillRect(length * 0.09, y, length * 0.41, thickness)
      }
    }
  }

  private windowBar(run: Run, line: number, k: number, start: number, heat: number, fade: number) {
    const { ctx } = this
    const { length, thickness, pitch } = this.layout.bar
    const key = line < 3 ? run.cast.lowerKey : run.cast.upperKey
    let yang = Boolean((TRIGRAMS[key].bits >> k) & 1)
    let color: RGB = INK
    let shift = 0
    let alpha = 1
    let counted = 0

    const t = this.runClock
    const { moving } = run.plan
    if (run.counted > line && t < moving.land) {
      counted = clamp01(1 - (t - moving.start - line * moving.stepTime) / 0.16)
    }
    if (line === run.cast.movingLine && t >= moving.land) {
      color = FLUX
      // 动爻：在阴阳之间闪变一瞬，示意“将变”
      const g = (t - moving.land) / MOVING_GLITCH_TIME
      if (g < 0.12) shift = 2
      else if (g < 0.24) {
        shift = -2
        yang = !yang
      } else if (g >= 0.52 && g < 0.64) {
        yang = !yang
        alpha = 0.6
      }
      heat = Math.max(heat, clamp01(1 - g * 2.2))
    }

    const y = -(start + k * pitch) - thickness
    const parts = yang
      ? [[-length / 2, length]]
      : [[-length / 2, length * 0.41], [length * 0.09, length * 0.41]]
    for (const [x, width] of parts) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(color, (0.14 + 0.3 * Math.max(heat, counted)) * fade)
      ctx.fillRect(x! + shift - 2, y - 2, width! + 4, thickness + 4)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = rgba(color, alpha * fade)
      ctx.fillRect(x! + shift, y, width!, thickness)
      const hot = Math.max(heat, counted * 0.85)
      if (hot > 0.02) {
        ctx.fillStyle = rgba(HOT, hot * fade)
        ctx.fillRect(x! + shift, y, width!, thickness)
      }
    }
  }

  /** 盘顶的窗：两道铜色立柱与指针 */
  private drawWindow(fade: number) {
    const { ctx, layout } = this
    const R = layout.radius
    const half = layout.bar.length / 2 + R * 0.045
    const top = -R * 1.04
    const bottom = -(layout.innerStart - R * 0.05)
    const alpha = (0.5 + 0.5 * this.tick) * fade * Math.min(1, this.glow.value * 1.9)
    ctx.fillStyle = rgba(COIN_LIGHT, alpha)
    for (const side of [-1, 1]) {
      const x = side * half
      ctx.fillRect(x - 0.5, top, 1, bottom - top)
      ctx.fillRect(side > 0 ? x - R * 0.035 : x, top, R * 0.035, 1)
      ctx.fillRect(side > 0 ? x - R * 0.035 : x, bottom - 1, R * 0.035, 1)
    }
    // 指针
    const tip = -R * 1.045
    const size = Math.max(4, R * 0.055)
    ctx.beginPath()
    ctx.moveTo(0, tip)
    ctx.lineTo(-size * 0.7, tip - size)
    ctx.lineTo(size * 0.7, tip - size)
    ctx.closePath()
    ctx.fill()
    if (this.tick > 0.02) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(HOT, this.tick * 0.5 * fade)
      ctx.fillRect(-half, top, half * 2, 1.5)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  /** 数动爻时沿窗左侧攀升的游标 */
  private drawCount(fade: number) {
    const { run, ctx, layout } = this
    if (!run || run.counted === 0) return
    const t = this.runClock
    const { moving } = run.plan
    const settled = t - moving.land
    if (settled > 0.9) return
    const line = run.counted - 1
    const y = -windowLineRadius(layout, line)
    const size = Math.max(3.5, layout.radius * 0.05)
    const alpha = fade * (settled > 0 ? clamp01(1 - (settled - 0.4) / 0.5) : 1)
    ctx.fillStyle = rgba(settled >= 0 ? FLUX : COIN_LIGHT, alpha)
    for (const side of [-1, 1]) {
      const x = side * (layout.bar.length / 2 + layout.radius * 0.1)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + side * size, y - size * 0.75)
      ctx.lineTo(x + side * size, y + size * 0.75)
      ctx.closePath()
      ctx.fill()
    }
  }

  /** 地支环：字始终正立，落在整数像素上 */
  private drawBranches(camera: StageCamera, fade: number) {
    const { ctx, layout, run } = this
    if (layout.branchRadius === null) return
    const glow = Math.min(1, this.glow.value * 1.5) * fade
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.font = `12px ${TEXT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let branch = 0; branch < 12; branch++) {
      const angle = ((branch - BRANCH_AT_TOP) * TAU) / 12
      const x = layout.center.x + Math.sin(angle) * layout.branchRadius
      const y = layout.center.y - Math.cos(angle) * layout.branchRadius
      const step = run ? run.cast.branches.indexOf(branch) : -1
      const lit = run && step >= 0 && step < run.started
      const sx = Math.round(x * camera.scale + camera.x)
      const sy = Math.round(y * camera.scale + camera.y)
      if (lit) {
        const since = this.runClock - run.plan.stepStarts[step]!
        const pop = clamp01(1 - since / 0.4)
        ctx.fillStyle = rgba(COIN_LIGHT, (0.16 + 0.3 * pop) * fade)
        ctx.fillRect(sx - 9, sy - 9, 18, 18)
        ctx.fillStyle = rgba(pop > 0.5 ? HOT : COIN_LIGHT, fade)
      } else {
        ctx.fillStyle = rgba(FOG, 0.62 * glow)
      }
      ctx.fillText(BRANCHES[branch]!, sx, sy + 1)
    }
  }

  /** 盘心：待机时是种子字，推演时是滚动并定格的序数 */
  private drawCenter(camera: StageCamera, fade: number) {
    const { ctx, layout, run } = this
    let text = this.seedGlyph
    let color = rgba(INK, 0.78 * fade)
    if (run) {
      const t = this.runClock
      const step = Math.max(0, run.started - 1)
      const resolvedAt = run.plan.resolves[step]!
      if (run.started === 0) {
        text = this.seedGlyph
      } else if (t >= resolvedAt) {
        text = String(run.cast.ordinals[step])
        const heat = clamp01(1 - (t - resolvedAt) / 0.28)
        color = step === 2 ? rgba(FLUX, fade) : heat > 0.4 ? rgba(HOT, fade) : rgba(INK, fade)
      } else if (step === 2) {
        text = String(Math.max(1, run.counted))
        color = rgba(COIN_LIGHT, fade)
      } else {
        const phase = Math.floor(t / REEL_STEP)
        text = String(1 + (((phase * 2654435761) >>> 13) % 8))
        color = rgba(SIGNAL, 0.85 * fade)
      }
    }
    if (!text) return
    const glyphs = [...text]
    const size = layout.well >= 22 && glyphs.length === 1 ? 24 : 12
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.font = `${size}px ${TEXT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color
    ctx.fillText(
      glyphs.slice(0, 4).join(''),
      Math.round(layout.center.x * camera.scale + camera.x),
      Math.round(layout.center.y * camera.scale + camera.y) + (size === 24 ? 2 : 1),
    )
  }
}
