import { lineIsMutating, lineIsYang } from '@/engine/binary'
import type { LineValue } from '@/types'

export interface LineFlight {
  /** 主体抵达目标时完成；被取消时 reject */
  arrived: Promise<void>
  cancel(): void
}

const DURATION = 620
const TRAILS = [
  { delay: 36, opacity: 0.42 },
  { delay: 72, opacity: 0.18 },
] as const

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

function ghostOf(value: LineValue, className: string): HTMLSpanElement {
  const ghost = document.createElement('span')
  ghost.className = className
  ghost.dataset.yang = String(lineIsYang(value))
  ghost.dataset.mutating = String(lineIsMutating(value))
  for (let i = 0; i < (lineIsYang(value) ? 1 : 2); i++) {
    const bar = document.createElement('span')
    bar.className = 'coin-ghost-bar'
    ghost.append(bar)
  }
  return ghost
}

/**
 * 把舞台上的爻线沿弧线送进爻序记录：共享元素式过渡。
 * 坐标换算成 layer 自身的 CSS 像素，外层有缩放时同样准确。
 */
export function flyLine(
  layer: HTMLElement,
  from: Element,
  to: Element,
  value: LineValue,
): LineFlight | null {
  if (typeof layer.animate !== 'function') return null
  const origin = layer.getBoundingClientRect()
  const source = from.getBoundingClientRect()
  const target = to.getBoundingClientRect()
  if (!origin.width || !source.width || !target.width) return null
  const scale = layer.offsetWidth / origin.width

  const x0 = (source.left + source.width / 2 - origin.left) * scale
  const y0 = (source.top + source.height / 2 - origin.top) * scale
  const x1 = (target.left + target.width / 2 - origin.left) * scale
  const y1 = (target.top + target.height / 2 - origin.top) * scale
  const w0 = source.width * scale
  const w1 = target.width * scale
  const cx = (x0 + x1) / 2 - (x1 - x0) * 0.12
  const cy = Math.min(y0, y1) - Math.max(56, Math.abs(x1 - x0) * 0.22)
  const bank = x1 >= x0 ? 1 : -1

  const keyframes: Keyframe[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = easeInOutCubic(t)
    const q = 1 - p
    const x = q * q * x0 + 2 * q * p * cx + p * p * x1
    const y = q * q * y0 + 2 * q * p * cy + p * p * y1
    const width = w0 + (w1 - w0) * p
    const arc = Math.sin(Math.PI * p)
    keyframes.push({
      offset: t,
      width: `${width}px`,
      // 飞行中压扁拉长，并随弧线轻微倾斜
      transform: `translate(${x - width / 2}px, ${y}px) rotate(${bank * -7 * arc}deg) scaleY(${1 - 0.3 * arc})`,
      opacity: t > 0.9 ? (1 - t) / 0.1 : 1,
    })
  }

  const ghosts = [ghostOf(value, 'coin-ghost'), ...TRAILS.map(() => ghostOf(value, 'coin-ghost coin-ghost-trail'))]
  layer.append(...ghosts)
  const animations = ghosts.map((ghost, index) => {
    const trail = TRAILS[index - 1]
    return ghost.animate(
      trail ? keyframes.map((frame) => ({ ...frame, opacity: Number(frame.opacity) * trail.opacity })) : keyframes,
      { duration: DURATION, delay: trail?.delay ?? 0, easing: 'linear', fill: 'both' },
    )
  })
  const cleanup = () => ghosts.forEach((ghost) => ghost.remove())
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(cleanup)

  return {
    arrived: animations[0]!.finished.then(() => undefined),
    cancel() {
      animations.forEach((animation) => animation.cancel())
      cleanup()
    },
  }
}
