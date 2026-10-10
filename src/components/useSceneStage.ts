import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** 画布舞台的最小接口：随宿主尺寸重排、离屏时暂停、卸载时释放 */
export interface StageScene {
  resize(width: number, height: number, dpr: number): void
  setVisible(visible: boolean): void
  destroy(): void
}

export interface StageSize {
  width: number
  height: number
  dpr: number
}

function measure(host: HTMLElement): StageSize {
  return {
    width: host.clientWidth,
    height: host.clientHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  }
}

/**
 * 把一个画布场景挂到宿主元素上。宿主有尺寸且拿得到 2D 上下文时才创建场景；
 * 测试环境（无布局）下 sceneRef 保持为 null，调用方按“无动画”处理。
 */
export function useSceneStage<S extends StageScene>(
  create: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, size: StageSize) => S,
): {
  hostRef: RefObject<HTMLSpanElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  sceneRef: RefObject<S | null>
  size: StageSize | null
} {
  const hostRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<S | null>(null)
  const createRef = useRef(create)
  const [size, setSize] = useState<StageSize | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const sync = () => {
      const next = measure(host)
      if (!next.width || !next.height) return
      setSize(next)
      if (sceneRef.current) {
        sceneRef.current.resize(next.width, next.height, next.dpr)
        return
      }
      const context = canvas.getContext('2d')
      if (context) sceneRef.current = createRef.current(canvas, context, next)
    }

    // ResizeObserver 在开始观察时会先回调一次；没有它的环境退回到下一帧量一次
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null
    resizeObserver?.observe(host)
    const fallbackFrame = resizeObserver ? 0 : window.requestAnimationFrame(sync)
    const visibilityObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => sceneRef.current?.setVisible(Boolean(entry?.isIntersecting)))
      : null
    visibilityObserver?.observe(host)

    return () => {
      if (fallbackFrame) window.cancelAnimationFrame(fallbackFrame)
      resizeObserver?.disconnect()
      visibilityObserver?.disconnect()
      sceneRef.current?.destroy()
      sceneRef.current = null
    }
  }, [])

  return { hostRef, canvasRef, sceneRef, size }
}
