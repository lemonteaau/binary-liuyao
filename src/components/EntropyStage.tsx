import { useImperativeHandle } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import type { CoinToss } from '@/engine/binary'
import { EntropyScene } from '@/features/entropy-cast/scene'
import type { EntropySceneEvents } from '@/features/entropy-cast/scene'
import { entropyLayout } from '@/features/entropy-cast/schedule'
import { useSceneStage } from './useSceneStage'

export interface EntropyStageHandle {
  /** 开始演出；舞台不可用（没有画布）时返回 false，调用方应直接给出结果 */
  cast(tosses: readonly CoinToss[], events: EntropySceneEvents): boolean
  skip(): void
}

interface EntropyStageProps {
  ref?: Ref<EntropyStageHandle>
  children?: ReactNode
}

export function EntropyStage({ ref, children }: EntropyStageProps) {
  const { hostRef, canvasRef, sceneRef, size } = useSceneStage(
    (canvas, context, stageSize) => new EntropyScene(canvas, context, stageSize),
  )

  useImperativeHandle(ref, () => ({
    cast: (tosses, events) => {
      const scene = sceneRef.current
      if (!scene) return false
      scene.cast(tosses, events)
      return true
    },
    skip: () => sceneRef.current?.skip(),
  }), [sceneRef])

  const layout = size ? entropyLayout(size.width, size.height) : null
  const style = layout
    ? ({
      '--entropy-names-x': `${layout.names.x}px`,
      '--entropy-names-width': `${layout.names.width}px`,
    } as CSSProperties)
    : undefined

  return (
    <span ref={hostRef} className="coin-stage" style={style} aria-hidden="true">
      <canvas ref={canvasRef} className="coin-canvas" />
      {children}
    </span>
  )
}
