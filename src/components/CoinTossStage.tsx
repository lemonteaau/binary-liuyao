import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode, Ref } from 'react'
import type { CoinToss } from '@/engine/binary'
import { faceOfScore, stageLayout } from '@/features/coin-shake/choreography'
import type { StageLayout } from '@/features/coin-shake/choreography'
import { CoinScene } from '@/features/coin-shake/scene'
import type { CoinSceneEvents } from '@/features/coin-shake/scene'
import { loadCoinSprites } from '@/features/coin-shake/sprites'

export interface CoinStageHandle {
  startShake(): void
  release(coins: CoinToss, events: CoinSceneEvents): void
  skip(): void
  reset(): void
}

interface CoinTossStageProps {
  ref?: Ref<CoinStageHandle>
  /** 当前静止的三枚铜钱；null 表示尚未摇过，全部正面 */
  faces: CoinToss | null
  shaking: boolean
  /** 首次进入时让铜钱落入桌面 */
  intro: boolean
  dim: boolean
  children?: ReactNode
}

function measure(host: HTMLElement) {
  return {
    width: host.clientWidth,
    height: host.clientHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  }
}

export function CoinTossStage({ ref, faces, shaking, intro, dim, children }: CoinTossStageProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CoinScene | null>(null)
  const latestRef = useRef({ faces, shaking, dim, intro })
  const [layout, setLayout] = useState<StageLayout | null>(null)

  useLayoutEffect(() => {
    latestRef.current = { ...latestRef.current, faces, shaking, dim }
  }, [faces, shaking, dim])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let cancelled = false
    let scene: CoinScene | null = null

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        const size = measure(host)
        if (!size.width || !size.height) return
        setLayout(stageLayout(size.width, size.height))
        scene?.resize(size.width, size.height, size.dpr)
      })
      : null
    resizeObserver?.observe(host)

    const visibilityObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => scene?.setVisible(Boolean(entry?.isIntersecting)))
      : null
    visibilityObserver?.observe(host)

    // 贴图解码成功后才创建画布上下文；测试环境与解码失败时舞台保持空白
    loadCoinSprites()
      .then((sprites) => {
        const size = measure(host)
        if (cancelled || !size.width || !size.height) return
        const context = canvas.getContext('2d')
        if (!context) return
        const { faces: initialFaces, shaking: initialShaking, dim: initialDim, intro: initialIntro } =
          latestRef.current
        scene = new CoinScene(canvas, context, sprites, size, {
          faces: initialFaces,
          shaking: initialShaking,
          intro: initialIntro,
        })
        scene.setDim(initialDim)
        sceneRef.current = scene
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      visibilityObserver?.disconnect()
      scene?.destroy()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setDim(dim)
  }, [dim])

  useImperativeHandle(ref, () => ({
    startShake: () => sceneRef.current?.startShake(),
    release: (coins, events) => {
      const scene = sceneRef.current
      if (scene) {
        scene.release(coins, events)
        return
      }
      coins.forEach((score, index) => events.onSettle?.(index, faceOfScore(score)))
      events.onAllSettled?.()
    },
    skip: () => sceneRef.current?.skip(),
    reset: () => sceneRef.current?.reset(),
  }), [])

  function trackPointer(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== 'mouse') return
    const host = event.currentTarget
    const rect = host.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    sceneRef.current?.setPointer({
      x: (event.clientX - rect.left) * (host.clientWidth / rect.width),
      y: (event.clientY - rect.top) * (host.clientHeight / rect.height),
    })
  }

  const style = layout
    ? ({
      '--coin-radius': `${layout.radius}px`,
      '--coin-rest-y': `${layout.center.y}px`,
      '--coin-slot-0': `${layout.slots[0].x}px`,
      '--coin-slot-1': `${layout.slots[1].x}px`,
      '--coin-slot-2': `${layout.slots[2].x}px`,
    } as CSSProperties)
    : undefined

  return (
    <span
      ref={hostRef}
      className="coin-stage"
      style={style}
      onPointerMove={trackPointer}
      onPointerLeave={() => sceneRef.current?.setPointer(null)}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="coin-canvas" />
      {children}
    </span>
  )
}
