import { useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { ReactNode, Ref } from 'react'
import { DialScene } from '@/features/derive-cast/scene'
import type { DialSceneEvents } from '@/features/derive-cast/scene'
import type { DeriveScript } from '@/features/derive-cast/script'
import { useSceneStage } from './useSceneStage'

export interface DeriveStageHandle {
  /** 开始演出；舞台不可用（没有画布）时返回 false，调用方应直接给出结果 */
  cast(script: DeriveScript, events: DialSceneEvents): boolean
  skip(): void
}

interface DeriveStageProps {
  ref?: Ref<DeriveStageHandle>
  /** 待机时显示在盘心的字 */
  seedGlyph: string
  dim: boolean
  children?: ReactNode
}

export function DeriveStage({ ref, seedGlyph, dim, children }: DeriveStageProps) {
  const latestRef = useRef({ seedGlyph, dim })
  const { hostRef, canvasRef, sceneRef } = useSceneStage((canvas, context, size) => {
    const scene = new DialScene(canvas, context, size)
    scene.setSeedGlyph(latestRef.current.seedGlyph)
    scene.setDim(latestRef.current.dim)
    return scene
  })

  useLayoutEffect(() => {
    latestRef.current = { seedGlyph, dim }
    sceneRef.current?.setSeedGlyph(seedGlyph)
    sceneRef.current?.setDim(dim)
  }, [seedGlyph, dim, sceneRef])

  useImperativeHandle(ref, () => ({
    cast: (script, events) => {
      const scene = sceneRef.current
      if (!scene) return false
      scene.cast({
        upperKey: script.upperKey,
        lowerKey: script.lowerKey,
        movingLine: script.movingLine,
        ordinals: [script.steps[0].ordinal, script.steps[1].ordinal, script.steps[2].ordinal],
        branches: script.steps.map((step) => step.branch),
      }, events)
      return true
    },
    skip: () => sceneRef.current?.skip(),
  }), [sceneRef])

  return (
    <span ref={hostRef} className="coin-stage" aria-hidden="true">
      <canvas ref={canvasRef} className="coin-canvas" />
      {children}
    </span>
  )
}
