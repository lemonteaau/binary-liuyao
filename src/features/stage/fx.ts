/**
 * 各起卦舞台共用的画布小件：配色、弹簧、镜头抖动，以及贴着像素网格的火花与扩散环。
 */
import { clamp01 } from '@/features/coin-shake/choreography'

export type RGB = readonly [number, number, number]

export const SIGNAL: RGB = [61, 245, 198]
export const BRONZE: RGB = [214, 158, 84]
export const EMBER: RGB = [255, 214, 150]
export const HOT: RGB = [255, 244, 222]
export const DUST: RGB = [150, 112, 66]
export const INK: RGB = [215, 239, 230]
export const FLUX: RGB = [255, 77, 106]
export const COIN_LIGHT: RGB = [240, 189, 103]

export const TAU = Math.PI * 2

export interface Spring {
  value: number
  velocity: number
  target: number
}

export const spring = (value: number): Spring => ({ value, velocity: 0, target: value })

export function stepSpring(s: Spring, dt: number, stiffness: number, damping: number) {
  const steps = Math.max(1, Math.ceil(dt * 240))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    s.velocity += (stiffness * (s.target - s.value) - damping * s.velocity) * h
    s.value += s.velocity * h
  }
}

export const springMoving = (s: Spring, epsilon: number) =>
  Math.abs(s.target - s.value) > epsilon || Math.abs(s.velocity) > epsilon * 8

export const random = (min: number, max: number) => min + Math.random() * (max - min)

export const rgba = (color: RGB, alpha: number) =>
  `rgba(${color[0]},${color[1]},${color[2]},${clamp01(alpha).toFixed(3)})`

/** 平滑的伪随机抖动，用于镜头震动 */
export const wobble = (t: number, seed: number) =>
  (Math.sin(t + seed) + 0.6 * Math.sin(t * 1.73 + seed * 2.1) + 0.35 * Math.sin(t * 2.91 + seed * 0.7)) / 1.95

/** 绕舞台中心缩放并叠加震动的二维镜头，返回 CSS 像素下的仿射系数 */
export interface StageCamera {
  scale: number
  x: number
  y: number
}

export function stageCamera(
  center: { x: number; y: number },
  zoom: number,
  trauma: number,
  time: number,
): StageCamera {
  const shake = trauma ** 2
  const t = time * 34
  return {
    scale: zoom,
    x: center.x * (1 - zoom) + 6 * shake * wobble(t, 0),
    y: center.y * (1 - zoom) + 6 * shake * wobble(t * 0.93, 1.7),
  }
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: RGB
  drag: number
  flare: boolean
}

interface Pulse {
  x: number
  y: number
  /** 圆环为半径；方框为半宽与半高 */
  from: number
  to: number
  aspect: number
  life: number
  maxLife: number
  alpha: number
  width: number
  color: RGB
  shape: 'ring' | 'box'
  dashed: boolean
  delay: number
}

export interface BurstOptions {
  count: number
  speed: readonly [number, number]
  life: readonly [number, number]
  colors: readonly RGB[]
  /** 每隔几粒出一颗十字星芒；0 表示没有 */
  flareEvery?: number
  size?: number
  drag?: number
  /** 限定喷射方向（弧度）与张角 */
  direction?: number
  spread?: number
}

export interface PulseOptions {
  from: number
  to: number
  life: number
  alpha: number
  color: RGB
  width?: number
  shape?: 'ring' | 'box'
  /** 方框的高宽比 */
  aspect?: number
  dashed?: boolean
  delay?: number
}

/** 火花与扩散环：位置为舞台 CSS 像素，绘制时对齐像素网格以保留颗粒感 */
export class SparkField {
  private sparks: Spark[] = []
  private pulses: Pulse[] = []

  get active(): boolean {
    return this.sparks.length > 0 || this.pulses.length > 0
  }

  burst(x: number, y: number, options: BurstOptions) {
    const { count, speed, life, colors, flareEvery = 0, size = 2, drag = 5 } = options
    for (let i = 0; i < count; i++) {
      const angle = options.direction === undefined
        ? random(0, TAU)
        : options.direction + random(-0.5, 0.5) * (options.spread ?? Math.PI)
      const velocity = random(speed[0], speed[1])
      const duration = random(life[0], life[1])
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: duration,
        maxLife: life[1],
        size,
        color: colors[i % colors.length]!,
        drag,
        flare: flareEvery > 0 && i % flareEvery === 0,
      })
    }
  }

  pulse(x: number, y: number, options: PulseOptions) {
    this.pulses.push({
      x,
      y,
      from: options.from,
      to: options.to,
      aspect: options.aspect ?? 1,
      life: options.life,
      maxLife: options.life,
      alpha: options.alpha,
      width: options.width ?? 1,
      color: options.color,
      shape: options.shape ?? 'ring',
      dashed: options.dashed ?? false,
      delay: options.delay ?? 0,
    })
  }

  clear() {
    this.sparks = []
    this.pulses = []
  }

  step(dt: number) {
    this.sparks = this.sparks.filter((spark) => {
      spark.life -= dt
      if (spark.life <= 0) return false
      const drag = Math.exp(-spark.drag * dt)
      spark.vx *= drag
      spark.vy *= drag
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      return true
    })
    this.pulses = this.pulses.filter((pulse) => {
      if (pulse.delay > 0) pulse.delay -= dt
      else pulse.life -= dt
      return pulse.life > 0
    })
  }

  /** 须在镜头变换已设好的上下文里调用 */
  drawPulses(ctx: CanvasRenderingContext2D, fade = 1) {
    for (const pulse of this.pulses) {
      if (pulse.delay > 0) continue
      const p = 1 - pulse.life / pulse.maxLife
      const reach = pulse.from + (pulse.to - pulse.from) * (1 - (1 - p) ** 3)
      ctx.strokeStyle = rgba(pulse.color, pulse.alpha * (1 - p) ** 1.5 * fade)
      ctx.lineWidth = pulse.width
      ctx.setLineDash(pulse.dashed ? [2, 4] : [])
      ctx.beginPath()
      if (pulse.shape === 'ring') ctx.arc(pulse.x, pulse.y, reach, 0, TAU)
      else ctx.rect(pulse.x - reach, pulse.y - reach * pulse.aspect, reach * 2, reach * 2 * pulse.aspect)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  /** 自行设置变换：火花落在整数 CSS 像素上 */
  drawSparks(ctx: CanvasRenderingContext2D, dpr: number, camera: StageCamera, fade = 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    for (const spark of this.sparks) {
      const x = Math.round(spark.x * camera.scale + camera.x)
      const y = Math.round(spark.y * camera.scale + camera.y)
      const life = spark.life / spark.maxLife
      ctx.fillStyle = rgba(spark.color, life * fade)
      if (spark.flare) {
        const arm = Math.round(1 + 3 * life)
        ctx.fillRect(x - arm, y, arm * 2 + 1, 1)
        ctx.fillRect(x, y - arm, 1, arm * 2 + 1)
        ctx.fillRect(x - 1, y - 1, 3, 3)
      } else {
        const size = Math.max(1, Math.round(spark.size))
        ctx.fillRect(x - (size >> 1), y - (size >> 1), size, size)
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
