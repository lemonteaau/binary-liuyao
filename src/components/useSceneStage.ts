import { useCallback, useEffect, useRef, useState } from 'react'
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

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.slice(0, 120)
}

/**
 * 把一个画布场景挂到宿主元素上。宿主有尺寸且拿得到 2D 上下文时才创建场景；
 * 测试环境（无布局）下 sceneRef 保持为 null，调用方按“无动画”处理。
 *
 * 平时由 ResizeObserver 量到尺寸后建场景；起卦时若场景还没建起来，ensureScene 当场再建一次。
 * 建不起来时 stageNote 说明原因（尺寸为零、拿不到上下文、构造出错），随起卦事件上报。
 */
export function useSceneStage<S extends StageScene>(
  create: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, size: StageSize) => S,
): {
  hostRef: RefObject<HTMLSpanElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  sceneRef: RefObject<S | null>
  size: StageSize | null
  /** 返回现有场景；还没有就当场量一次尺寸再建 */
  ensureScene: () => S | null
  /** 场景没有按常规建起来时的说明；一切正常时为 null */
  stageNote: () => string | null
} {
  const hostRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<S | null>(null)
  const createRef = useRef(create)
  const noteRef = useRef<string | null>('未挂载')
  const [size, setSize] = useState<StageSize | null>(null)

  const build = useCallback((): S | null => {
    if (sceneRef.current) return sceneRef.current
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) {
      noteRef.current = '未挂载'
      return null
    }
    const next = measure(host)
    if (!next.width || !next.height) {
      noteRef.current = '尺寸为零'
      return null
    }
    setSize(next)
    try {
      const context = canvas.getContext('2d')
      if (!context) {
        noteRef.current = '无绘图上下文'
        return null
      }
      sceneRef.current = createRef.current(canvas, context, next)
      noteRef.current = null
    } catch (error) {
      noteRef.current = `创建出错 ${describeError(error)}`
    }
    return sceneRef.current
  }, [])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    noteRef.current = '未量到尺寸'

    const sync = () => {
      const scene = sceneRef.current
      if (!scene) {
        build()
        return
      }
      const next = measure(host)
      if (!next.width || !next.height) return
      setSize(next)
      scene.resize(next.width, next.height, next.dpr)
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
      noteRef.current = '未挂载'
    }
  }, [build])

  const ensureScene = useCallback((): S | null => {
    if (sceneRef.current) return sceneRef.current
    const before = noteRef.current
    const scene = build()
    // 常规路径没建起来、起卦时才补建成功：记下补建前卡在哪一步
    if (scene) noteRef.current = `补建（${before ?? '未知'}）`
    return scene
  }, [build])

  const stageNote = useCallback(() => noteRef.current, [])

  return { hostRef, canvasRef, sceneRef, size, ensureScene, stageNote }
}
