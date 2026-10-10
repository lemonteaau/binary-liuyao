/**
 * 电脑起卦舞台：一片翻涌的随机噪声，卦象从里面一爻一爻凝结出来。
 *
 * 每爻先取定三个随机位（1 为正、0 为反），随后同一行的噪声点收拢成爻线，
 * 自初爻向上叠成卦象。结果在点击时已经采样完毕，这里只按 schedule 的节拍把它演出来。
 */
import { lineIsMutating, lineIsYang, scoreCoinToss } from '@/engine/binary'
import type { CoinToss } from '@/engine/binary'
import { clamp01, easeOutCubic, lerp } from '@/features/coin-shake/choreography'
import {
  EMBER,
  FLUX,
  HOT,
  INK,
  SIGNAL,
  SparkField,
  random,
  rgba,
  spring,
  springMoving,
  stageCamera,
  stepSpring,
} from '@/features/stage/fx'
import type { StageCamera } from '@/features/stage/fx'
import { motionEnabled } from '@/lib/motion'
import type { StageScene, StageSize } from '@/components/useSceneStage'
import { CONDENSE_TIME, entropyLayout, entropySchedule } from './schedule'
import type { EntropyLayout, EntropySchedule } from './schedule'

export interface EntropySceneEvents {
  /** 第 index 爻（0 为初爻）已得出 */
  onLine?: (index: number) => void
  onComplete?: () => void
}

interface Streak {
  fromX: number
  fromY: number
  toX: number
  toY: number
  start: number
}

interface Run {
  tosses: readonly CoinToss[]
  schedule: EntropySchedule
  events: EntropySceneEvents
  /** 已触发 onLine 的爻数 */
  reported: number
  /** 已放出收拢线的行数 */
  gathered: number
  done: boolean
}

const FIELD_DENSITY = 0.3
const GRAIN_LEVELS = 4
const MASK_LEVELS = 4
const FLICKER_STEP = 0.045
const STREAK_TIME = 0.13
const STREAKS_PER_ROW = 7
/** 噪声点先各自亮起，再融成实线 */
const DOTS_TIME = 0.15
const DOT_COOL_TIME = 0.16
const DIGIT_FONT = '12px "Fusion Pixel 12", ui-monospace, monospace'
const DIGIT_PITCH = 9

export class EntropyScene implements StageScene {
  private layout: EntropyLayout
  private dpr = 1
  private motion = motionEnabled()
  private visible = true
  private destroyed = false
  private raf = 0
  private idleTimer = 0
  private idleTick = false
  private lastFrame = 0
  private clock = 0
  private run: Run | null = null
  private runClock = 0

  private on = new Uint8Array(0)
  private grain = new Float32Array(0)
  private heat = new Float32Array(0)
  /** 每爻每个点亮起的先后（0..1） */
  private dotOrder = new Float32Array(0)
  private flipClock = 0

  private readonly energy = spring(0.5)
  private readonly dim = spring(0)
  private readonly zoom = spring(1)
  /** 卦成后卦象左移、让出卦名的进度 */
  private readonly shift = spring(0)
  private readonly scan = spring(0)
  private scanGlow = 0
  private trauma = 0
  private flash = 0
  private streaks: Streak[] = []
  private readonly fx = new SparkField()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    size: StageSize,
  ) {
    this.layout = entropyLayout(size.width, size.height)
    this.resize(size.width, size.height, size.dpr)
    // 读数用像素字体；尚未载入时先用后备字体画，载入后重画一次
    void document.fonts?.load(DIGIT_FONT).then(() => {
      if (!this.destroyed) this.render()
    }, () => undefined)
    document.addEventListener('visibilitychange', this.wake)
    this.kick()
  }

  /* ------------------------------ 公共指令 ------------------------------ */

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(width * dpr))
    this.canvas.height = Math.max(1, Math.round(height * dpr))
    this.layout = entropyLayout(width, height)
    this.buildField()
    this.scan.value = this.scan.target = this.layout.height
    this.render()
  }

  /** 演出已经采样好的六次掷币，tosses[0] 为初爻 */
  cast(tosses: readonly CoinToss[], events: EntropySceneEvents) {
    this.motion = motionEnabled()
    this.run = {
      tosses,
      schedule: entropySchedule(),
      events,
      reported: 0,
      gathered: 0,
      done: false,
    }
    this.runClock = 0
    this.streaks = []
    this.fx.clear()
    this.dim.target = 0
    this.shift.value = this.shift.target = 0
    if (!this.motion) {
      this.skip()
      return
    }
    this.energy.target = 1
    this.energy.velocity += 3
    this.flash = 0.7
    this.trauma = Math.min(1, this.trauma + 0.2)
    this.zoom.velocity += 0.5
    this.scan.value = this.layout.height
    this.kick()
  }

  /** 立即得出全部六爻并触发尚未发出的回调 */
  skip() {
    const run = this.run
    if (!run || run.done) return
    this.runClock = run.schedule.complete + CONDENSE_TIME
    run.gathered = 6
    this.streaks = []
    while (run.reported < 6) run.events.onLine?.(run.reported++)
    this.finish(run)
    if (!this.motion) this.shift.value = this.shift.target
    this.render()
  }

  /** 压暗舞台 */
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
    window.clearTimeout(this.idleTimer)
    document.removeEventListener('visibilitychange', this.wake)
  }

  /* ------------------------------ 噪声场 ------------------------------ */

  private buildField() {
    const { columns, rows, barCells, barRows } = this.layout
    const count = columns * rows
    this.on = new Uint8Array(count)
    this.grain = new Float32Array(count)
    this.heat = new Float32Array(count)
    for (let index = 0; index < count; index++) {
      this.on[index] = Math.random() < FIELD_DENSITY ? 1 : 0
      this.grain[index] = Math.random()
    }
    this.dotOrder = new Float32Array(6 * barCells * barRows)
    for (let index = 0; index < this.dotOrder.length; index++) this.dotOrder[index] = Math.random()
  }

  private flipField(share: number) {
    const count = this.on.length
    const flips = Math.max(1, Math.round(count * share))
    for (let i = 0; i < flips; i++) {
      const index = Math.floor(Math.random() * count)
      // 保持整体密度：亮格更容易熄灭
      const lit = this.on[index] === 1
      if (lit || Math.random() < FIELD_DENSITY / (1 - FIELD_DENSITY)) {
        this.on[index] = lit ? 0 : 1
        if (!lit) this.heat[index] = 0.5
      }
    }
  }

  /** 让开卦象（以及卦成后的卦名）的矩形 */
  private moat() {
    const { block, cell, names, finaleShift } = this.layout
    const p = clamp01(this.shift.value)
    const margin = cell * 1.5
    return {
      x0: block.x - cell * 5.5 + finaleShift * p,
      x1: lerp(block.x + block.width + margin, names.x + names.width + cell, p),
      y0: block.y - margin,
      y1: block.y + block.height + margin,
    }
  }

  /** 在某一行的高度上、卦象两侧挑一个噪声格 */
  private pickSource(y: number): { x: number; y: number } {
    const { width, cell, origin, columns, rows } = this.layout
    const moat = this.moat()
    const leftRoom = Math.max(1, moat.x0)
    const rightRoom = Math.max(1, width - moat.x1)
    const reach = Math.min(1, 150 / Math.max(leftRoom, rightRoom))
    const x = Math.random() < leftRoom / (leftRoom + rightRoom)
      ? moat.x0 - random(0.1, reach) * leftRoom
      : moat.x1 + random(0.1, reach) * rightRoom
    const column = Math.max(0, Math.min(columns - 1, Math.floor((x - origin.x) / cell)))
    const row = Math.max(0, Math.min(rows - 1, Math.floor((y + random(-2.2, 2.2) * cell - origin.y) / cell)))
    const index = row * columns + column
    this.on[index] = 1
    this.heat[index] = 1
    return { x: origin.x + (column + 0.5) * cell, y: origin.y + (row + 0.5) * cell }
  }

  /* ------------------------------ 帧循环 ------------------------------ */

  private kick() {
    if (this.raf || this.destroyed || !this.motion || !this.visible) return
    window.clearTimeout(this.idleTimer)
    this.idleTimer = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  /** 页面切到后台时帧循环自行停下；回到前台再接上 */
  private wake = () => {
    if (document.visibilityState === 'visible') this.kick()
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.destroyed) return
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 1 / 60
    this.lastFrame = now
    this.step(dt)
    this.render()
    if (!this.visible || document.visibilityState === 'hidden') {
      this.lastFrame = 0
      return
    }
    if (this.busy()) {
      this.raf = requestAnimationFrame(this.frame)
      return
    }
    // 待机时噪声只需偶尔翻动，不必每帧重绘
    this.lastFrame = 0
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0
      this.idleTick = true
      this.kick()
    }, 170)
  }

  private busy(): boolean {
    return (this.run !== null && this.runClock < this.run.schedule.complete + 1.2)
      || this.fx.active
      || this.streaks.length > 0
      || this.trauma > 0.002
      || this.flash > 0.01
      || this.scanGlow > 0.01
      || springMoving(this.energy, 0.004)
      || springMoving(this.dim, 0.004)
      || springMoving(this.shift, 0.002)
      || springMoving(this.zoom, 0.0005)
  }

  private step(dt: number) {
    this.clock += dt
    stepSpring(this.energy, dt, 60, 13)
    stepSpring(this.dim, dt, 30, 11)
    stepSpring(this.zoom, dt, 90, 13)
    stepSpring(this.shift, dt, 46, 12)
    stepSpring(this.scan, dt, 260, 26)
    this.trauma = Math.max(0, this.trauma - dt * 1.8)
    this.flash *= Math.exp(-dt / 0.07)

    const casting = this.run !== null && !this.run.done
    this.scanGlow += ((casting ? 1 : 0) - this.scanGlow) * (1 - Math.exp(-dt / 0.12))
    // 待机时每次定时唤醒翻一小撮；起卦时噪声沸腾
    this.flipClock += dt
    if (this.idleTick || this.flipClock >= (casting ? 0.04 : 0.15)) {
      this.idleTick = false
      this.flipClock = 0
      this.flipField(casting ? 0.075 : 0.012)
    }
    const cooling = Math.exp(-dt / 0.22)
    for (let i = 0; i < this.heat.length; i++) {
      if (this.heat[i]! > 0.004) this.heat[i]! *= cooling
    }

    if (this.run) this.advance(this.run, dt)
    this.streaks = this.streaks.filter((streak) => this.runClock - streak.start < STREAK_TIME + 0.16)
    this.fx.step(dt)
  }

  private advance(run: Run, dt: number) {
    this.runClock += dt
    const t = this.runClock
    const { layout } = this
    const { cell } = layout
    const { rows } = run.schedule
    const barHeight = layout.barRows * cell

    const active = rows.findIndex((row) => t < row.bar + 0.1)
    if (active >= 0 && t >= rows[active]!.start) {
      this.scan.target = layout.rowTop(active) + barHeight / 2
    }

    // 爻线凝结前，两侧的噪声点先向这一行收拢
    while (run.gathered < 6 && t >= rows[run.gathered]!.bar - STREAK_TIME) {
      const line = run.gathered++
      const y = layout.rowTop(line) + barHeight / 2
      for (let i = 0; i < STREAKS_PER_ROW; i++) {
        const source = this.pickSource(y)
        this.streaks.push({
          fromX: source.x,
          fromY: source.y,
          toX: layout.block.x + random(0.08, 0.92) * layout.block.width,
          toY: y + random(-0.3, 0.3) * barHeight,
          start: rows[line]!.bar - STREAK_TIME + i * 0.014,
        })
      }
    }

    while (run.reported < 6 && t >= rows[run.reported]!.bar) {
      const line = run.reported++
      const value = scoreCoinToss(run.tosses[line]!)
      const color = lineIsMutating(value) ? FLUX : SIGNAL
      const x = layout.block.x + layout.block.width / 2
      const y = layout.rowTop(line) + barHeight / 2
      this.fx.pulse(x, y, {
        shape: 'box',
        from: layout.block.width * 0.5,
        to: layout.block.width * 0.5 + cell * 2.2,
        aspect: (barHeight * 0.5 + cell) / (layout.block.width * 0.5 + cell * 2.2),
        life: 0.38,
        alpha: 0.55,
        color,
      })
      for (const side of [-1, 1]) {
        this.fx.burst(x + side * layout.block.width * 0.5, y, {
          count: 4,
          speed: [cell * 6, cell * 16],
          life: [0.14, 0.3],
          colors: [color, HOT, EMBER],
          direction: side > 0 ? 0 : Math.PI,
          spread: 1.5,
          flareEvery: 4,
          drag: 6,
        })
      }
      this.trauma = Math.min(1, this.trauma + 0.11)
      run.events.onLine?.(line)
    }

    if (!run.done && t >= run.schedule.complete) this.finish(run)
  }

  private finish(run: Run) {
    run.done = true
    this.energy.target = 0.3
    this.shift.target = 1
    if (this.motion) {
      const { block, cell } = this.layout
      this.flash = 1
      this.trauma = Math.min(1, this.trauma + 0.3)
      this.zoom.velocity += 0.7
      this.fx.pulse(block.x + block.width / 2, block.y + block.height / 2, {
        shape: 'box',
        from: block.width * 0.5 + cell,
        to: block.width * 0.5 + cell * 5,
        aspect: (block.height * 0.5 + cell * 4) / (block.width * 0.5 + cell * 5),
        life: 0.5,
        alpha: 0.6,
        color: SIGNAL,
        width: 1.5,
      })
    }
    run.events.onComplete?.()
  }

  /* ------------------------------ 绘制 ------------------------------ */

  private render() {
    const { ctx, canvas, layout, dpr } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = false

    const camera = stageCamera(
      { x: layout.width / 2, y: layout.height / 2 },
      this.zoom.value,
      this.trauma,
      this.clock,
    )
    const fade = 1 - 0.74 * this.dim.value
    const offset = layout.finaleShift * clamp01(this.shift.value)
    this.applyCamera(camera)
    this.drawField(fade)
    this.drawScan(fade)
    this.drawStreaks(fade)
    this.fx.drawPulses(ctx, fade)
    for (let line = 0; line < 6; line++) this.drawLine(line, offset, fade)
    this.drawDigits(camera, fade)
    this.fx.drawSparks(ctx, dpr, camera, fade)

    if (this.flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(SIGNAL, 0.1 * this.flash)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  private applyCamera(camera: StageCamera) {
    const s = this.dpr * camera.scale
    this.ctx.setTransform(s, 0, 0, s, this.dpr * camera.x, this.dpr * camera.y)
  }

  private drawField(fade: number) {
    const { ctx } = this
    const { cell, origin, columns, rows } = this.layout
    const gain = (0.4 + 0.75 * this.energy.value) * fade
    const moat = this.moat()
    const falloff = cell * 5
    const size = cell - 3
    const paths: Path2D[] = []
    for (let i = 0; i < GRAIN_LEVELS * MASK_LEVELS; i++) paths.push(new Path2D())
    const hot: number[] = []
    for (let row = 0; row < rows; row++) {
      const y = origin.y + row * cell
      const dy = Math.max(moat.y0 - y - cell, y - moat.y1, 0)
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column
        if (!this.on[index]) continue
        const x = origin.x + column * cell
        const dx = Math.max(moat.x0 - x - cell, x - moat.x1, 0)
        // 靠近卦象的噪声逐圈变淡
        const near = Math.ceil(clamp01(Math.hypot(dx, dy) / falloff) * MASK_LEVELS) - 1
        if (near < 0) continue
        const grain = Math.min(GRAIN_LEVELS - 1, Math.floor(this.grain[index]! * GRAIN_LEVELS))
        paths[near * GRAIN_LEVELS + grain]!.rect(x + 1, y + 1, size, size)
        if (this.heat[index]! > 0.04) hot.push(index)
      }
    }
    // 按亮度分级成批填充，避免逐格设置透明度
    paths.forEach((path, level) => {
      const near = (Math.floor(level / GRAIN_LEVELS) + 1) / MASK_LEVELS
      const grain = level % GRAIN_LEVELS
      ctx.fillStyle = rgba(SIGNAL, (0.05 + 0.065 * grain) * near * gain)
      ctx.fill(path)
    })
    ctx.globalCompositeOperation = 'lighter'
    for (const index of hot) {
      const column = index % columns
      const row = (index - column) / columns
      ctx.fillStyle = rgba(SIGNAL, this.heat[index]! * 0.6 * fade)
      ctx.fillRect(origin.x + column * cell + 1, origin.y + row * cell + 1, size, size)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  /** 采样线：停在正在取定的那一爻的高度 */
  private drawScan(fade: number) {
    if (this.scanGlow < 0.01) return
    const { ctx } = this
    const { width, cell } = this.layout
    const y = Math.round(this.scan.value)
    const alpha = this.scanGlow * fade
    const band = ctx.createLinearGradient(0, y - cell * 2, 0, y + cell * 2)
    band.addColorStop(0, rgba(SIGNAL, 0))
    band.addColorStop(0.5, rgba(SIGNAL, 0.09 * alpha))
    band.addColorStop(1, rgba(SIGNAL, 0))
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = band
    ctx.fillRect(0, y - cell * 2, width, cell * 4)
    const line = ctx.createLinearGradient(0, 0, width, 0)
    line.addColorStop(0, rgba(SIGNAL, 0))
    line.addColorStop(0.5, rgba(SIGNAL, 0.5 * alpha))
    line.addColorStop(1, rgba(SIGNAL, 0))
    ctx.fillStyle = line
    ctx.fillRect(0, y, width, 1)
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawStreaks(fade: number) {
    const { ctx } = this
    ctx.globalCompositeOperation = 'lighter'
    for (const streak of this.streaks) {
      const p = (this.runClock - streak.start) / STREAK_TIME
      if (p <= 0) continue
      const head = clamp01(p)
      const tail = clamp01(p - 0.45)
      const linger = p > 1 ? clamp01(1 - (p - 1) / 1.2) : 1
      const x0 = streak.fromX + (streak.toX - streak.fromX) * tail
      const y0 = streak.fromY + (streak.toY - streak.fromY) * tail
      const x1 = streak.fromX + (streak.toX - streak.fromX) * head
      const y1 = streak.fromY + (streak.toY - streak.fromY) * head
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
      gradient.addColorStop(0, rgba(SIGNAL, 0))
      gradient.addColorStop(1, rgba(SIGNAL, linger * fade))
      ctx.strokeStyle = gradient
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      if (p < 1) {
        ctx.fillStyle = rgba(HOT, fade)
        ctx.fillRect(Math.round(x1) - 1, Math.round(y1) - 1, 3, 3)
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawLine(line: number, offset: number, fade: number) {
    const { ctx, layout, run } = this
    const { cell, barCells, barRows, gapCells } = layout
    const left = layout.block.x + offset
    const top = layout.rowTop(line)
    const timing = run?.schedule.rows[line]
    const since = run && timing ? this.runClock - timing.bar : -1

    if (!run || since < 0) {
      // 尚未得出：一道虚线占位
      ctx.fillStyle = rgba(SIGNAL, 0.16 * fade)
      const y = top + Math.floor((barRows * cell - 3) / 2)
      for (let x = left + 1; x < left + barCells * cell - 3; x += cell) ctx.fillRect(x, y, cell - 4, 1)
      return
    }

    const value = scoreCoinToss(run.tosses[line]!)
    const color = lineIsMutating(value) ? FLUX : INK
    const half = (barCells - gapCells) / 2
    const segments = lineIsYang(value) ? [[0, barCells]] : [[0, half], [half + gapCells, half]]
    const fuse = easeOutCubic(clamp01((since - DOTS_TIME) / (CONDENSE_TIME - DOTS_TIME)))
    // 六爻齐备后自下而上扫过一道光
    const sweep = run.done ? this.runClock - run.schedule.complete - line * 0.05 : -1
    const shine = sweep >= 0 && sweep < 0.42 ? 1 - sweep / 0.42 : 0
    const size = cell - 3

    if (fuse < 1) {
      for (const [start, length] of segments) {
        for (let i = start!; i < start! + length!; i++) {
          for (let j = 0; j < barRows; j++) {
            const lit = since - this.dotOrder[(line * barCells + i) * barRows + j]! * DOTS_TIME * 0.8
            if (lit < 0) continue
            const x = left + i * cell + 1
            const y = top + j * cell + 1
            ctx.fillStyle = rgba(color, fade)
            ctx.fillRect(x, y, size, size)
            const hot = 1 - lit / DOT_COOL_TIME
            if (hot > 0) {
              ctx.fillStyle = rgba(HOT, hot * fade)
              ctx.fillRect(x - 1, y - 1, size + 2, size + 2)
            }
          }
        }
      }
    }

    const height = barRows * cell - 3
    for (const [start, length] of segments) {
      const x = left + start! * cell + 1
      const width = length! * cell - 3
      const heat = Math.max(fuse < 1 ? 0.5 * (1 - fuse) : 0, shine * 0.8)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = rgba(color, (0.05 + 0.2 * heat) * fuse * fade)
      ctx.fillRect(x - 3, top - 2, width + 6, height + 6)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = rgba(color, fuse * fade)
      ctx.fillRect(x, top + 1, width, height)
      if (heat > 0.02) {
        ctx.fillStyle = rgba(HOT, heat * fuse * fade)
        ctx.fillRect(x, top + 1, width, height)
      }
    }
  }

  /** 每爻左侧的三个随机位读数；卦成后淡出 */
  private drawDigits(camera: StageCamera, fade: number) {
    const { run, ctx, layout } = this
    const alpha = fade * (1 - clamp01(this.shift.value * 2.2))
    if (!run || alpha < 0.01) return
    const { cell, barRows } = layout
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.font = DIGIT_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const t = this.runClock
    for (let line = 0; line < 6; line++) {
      const timing = run.schedule.rows[line]!
      if (t < timing.start) continue
      const y = layout.rowTop(line) + (barRows * cell - 3) / 2 + 1
      for (let bit = 0; bit < 3; bit++) {
        const lockedFor = t - timing.bits[bit]!
        let digit: string
        let color = rgba(SIGNAL, 0.5 * alpha)
        if (lockedFor >= 0) {
          digit = run.tosses[line]![bit] === 3 ? '1' : '0'
          color = lockedFor < 0.12 ? rgba(HOT, alpha) : rgba(SIGNAL, 0.92 * alpha)
        } else {
          const phase = Math.floor(t / FLICKER_STEP) + bit * 7 + line * 13
          digit = ((phase * 2654435761) >>> 16) % 2 === 0 ? '1' : '0'
        }
        const x = layout.block.x - cell * 1.75 - (2 - bit) * DIGIT_PITCH
        ctx.fillStyle = color
        ctx.fillText(
          digit,
          Math.round(x * camera.scale + camera.x),
          Math.round(y * camera.scale + camera.y),
        )
      }
    }
  }
}
