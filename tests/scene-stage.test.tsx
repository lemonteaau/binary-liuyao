// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { useImperativeHandle } from 'react'
import type { Ref } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStage } from '@/components/useSceneStage'
import type { StageScene, StageSize } from '@/components/useSceneStage'

class FakeScene implements StageScene {
  destroyed = false
  sizes: StageSize[] = []
  constructor(size: StageSize) {
    this.sizes.push(size)
  }
  resize(width: number, height: number, dpr: number) {
    this.sizes.push({ width, height, dpr })
  }
  setVisible() {}
  destroy() {
    this.destroyed = true
  }
}

interface ProbeHandle {
  ensure(): FakeScene | null
  current(): FakeScene | null
  note(): string | null
}

function Probe({ ref, create }: { ref: Ref<ProbeHandle>; create?: (size: StageSize) => FakeScene }) {
  const { hostRef, canvasRef, sceneRef, ensureScene, stageNote } = useSceneStage(
    (_canvas, _context, size) => (create ? create(size) : new FakeScene(size)),
  )
  useImperativeHandle(ref, () => ({
    ensure: ensureScene,
    current: () => sceneRef.current,
    note: stageNote,
  }))
  return (
    <span ref={hostRef}>
      <canvas ref={canvasRef} />
    </span>
  )
}

/** 由测试决定 ResizeObserver 何时回调 */
const observers: (() => void)[] = []
let hostSize = { width: 320, height: 240 }

beforeEach(() => {
  observers.length = 0
  hostSize = { width: 320, height: 240 }
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: () => void) {}
    observe() {
      observers.push(this.callback)
    }
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => hostSize.width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => hostSize.height)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({}) as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(create?: (size: StageSize) => FakeScene) {
  const ref: { current: ProbeHandle | null } = { current: null }
  const view = render(<Probe ref={ref} create={create} />)
  return { probe: () => ref.current!, ...view }
}

describe('画布舞台的创建', () => {
  it('量到尺寸后建起场景，之后随尺寸重排', () => {
    const { probe } = mount()
    act(() => observers.forEach((sync) => sync()))
    const scene = probe().current()
    expect(scene).not.toBeNull()
    expect(probe().note()).toBeNull()

    hostSize = { width: 200, height: 100 }
    act(() => observers.forEach((sync) => sync()))
    expect(probe().current()).toBe(scene)
    expect(scene!.sizes.at(-1)).toMatchObject({ width: 200, height: 100 })
  })

  it('ResizeObserver 一直没回调时，起卦当场补建并记下原因', () => {
    const { probe } = mount()
    expect(probe().current()).toBeNull()

    let scene: FakeScene | null = null
    act(() => {
      scene = probe().ensure()
    })
    expect(scene).not.toBeNull()
    expect(probe().current()).toBe(scene)
    expect(probe().note()).toBe('补建（未量到尺寸）')
  })

  it('宿主没有尺寸时建不起来，说明尺寸为零', () => {
    hostSize = { width: 0, height: 0 }
    const { probe } = mount()
    act(() => observers.forEach((sync) => sync()))
    expect(probe().ensure()).toBeNull()
    expect(probe().note()).toBe('尺寸为零')
  })

  it('拿不到 2D 上下文时说明原因', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const { probe } = mount()
    act(() => observers.forEach((sync) => sync()))
    expect(probe().ensure()).toBeNull()
    expect(probe().note()).toBe('无绘图上下文')
  })

  it('场景构造出错不抛到外面，记下错误', () => {
    const { probe } = mount(() => {
      throw new TypeError('boom')
    })
    expect(() => act(() => observers.forEach((sync) => sync()))).not.toThrow()
    expect(probe().ensure()).toBeNull()
    expect(probe().note()).toBe('创建出错 TypeError: boom')
  })

  it('卸载时释放场景', () => {
    const { probe, unmount } = mount()
    act(() => observers.forEach((sync) => sync()))
    const scene = probe().current()!
    unmount()
    expect(scene.destroyed).toBe(true)
  })
})
