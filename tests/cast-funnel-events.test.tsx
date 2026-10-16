// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useImperativeHandle } from 'react'
import type { ReactNode, Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'

// jsdom 建不起画布舞台；换成一个总能开演的假舞台，由测试决定何时演完
const stage = vi.hoisted(() => ({ complete: null as (() => void) | null }))

interface FakeStageHandle {
  cast(input: unknown, events: { onComplete?: () => void }): boolean
  skip(): void
}

function FakeStage({ ref, children }: { ref?: Ref<FakeStageHandle>; children?: ReactNode }) {
  useImperativeHandle(ref, () => ({
    cast: (_input, events) => {
      let done = false
      stage.complete = () => {
        if (done) return
        done = true
        events.onComplete?.()
      }
      return true
    },
    skip: () => stage.complete?.(),
  }))
  return <span>{children}</span>
}

vi.mock('@/components/EntropyStage', () => ({ EntropyStage: FakeStage }))
vi.mock('@/components/DeriveStage', () => ({ DeriveStage: FakeStage }))

const SETTINGS_KEY = 'hex64.settings.v1'
const CAST_EVENTS = new Set(['开始起卦', '跳过起卦动画', '起卦动画完成', '点击生成排盘', '成功生成排盘'])

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  stage.complete = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup() {
  const track = vi.fn()
  vi.stubGlobal('umami', { track })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: true, timezone: 'Asia/Shanghai' }))
  sessionStorage.setItem('hex64.booted', '1')
  render(<App />)
  return track
}

function castEvents(track: ReturnType<typeof vi.fn>) {
  return track.mock.calls.filter(([event]) => CAST_EVENTS.has(event as string))
}

describe('起卦动画的漏斗事件', () => {
  it('电脑起卦：开演、演完停住，点生成排盘才记点击', async () => {
    const track = setup()
    fireEvent.click(screen.getByRole('button', { name: /电脑起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '点击起卦' }))
    act(() => stage.complete?.())

    // 卦成后停在舞台上，还没有点击生成排盘
    expect(window.location.pathname).toBe('/')
    expect(castEvents(track)).toEqual([
      ['开始起卦', { 起卦方式: '电脑起卦', 动画: '播放' }],
      ['起卦动画完成', { 起卦方式: '电脑起卦' }],
    ])

    fireEvent.click(screen.getByRole('button', { name: '卦已成，生成排盘' }))
    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(castEvents(track).slice(2)).toEqual([
      ['点击生成排盘', { 起卦方式: '电脑起卦' }],
      ['成功生成排盘', { 起卦方式: '电脑起卦' }],
    ])
  })

  it('时间起卦：演出中再点一下记为跳过', async () => {
    const track = setup()
    fireEvent.click(screen.getByRole('button', { name: /时间起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '点击以此刻起卦' }))
    fireEvent.click(screen.getByRole('button', { name: '推演中，点击跳过' }))
    fireEvent.click(screen.getByRole('button', { name: '卦已成，生成排盘' }))

    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(castEvents(track)).toEqual([
      ['开始起卦', { 起卦方式: '时间起卦', 动画: '播放' }],
      ['跳过起卦动画', { 起卦方式: '时间起卦' }],
      ['起卦动画完成', { 起卦方式: '时间起卦' }],
      ['点击生成排盘', { 起卦方式: '时间起卦' }],
      ['成功生成排盘', { 起卦方式: '时间起卦' }],
    ])
  })
})
