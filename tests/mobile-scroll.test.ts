// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetScrollPosition, scrollIntoViewOnMobile } from '@/lib/mobile-scroll'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.motion
})

function mockMedia({ mobile, reducedMotion = false }: { mobile: boolean; reducedMotion?: boolean }) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('max-width') ? mobile : reducedMotion,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

describe('移动端交互滚动', () => {
  it('手机端平滑滚动到后续内容', () => {
    mockMedia({ mobile: true })
    const target = document.createElement('div')
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView

    expect(scrollIntoViewOnMobile(target)).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    })
  })

  it('关闭动效时使用即时滚动', () => {
    mockMedia({ mobile: true })
    document.documentElement.dataset.motion = 'off'
    const target = document.createElement('div')
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView

    scrollIntoViewOnMobile(target)

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('桌面端不强制改变用户的滚动位置', () => {
    mockMedia({ mobile: false })
    const target = document.createElement('div')
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView

    expect(scrollIntoViewOnMobile(target)).toBe(false)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('路由切换滚动复位', () => {
  it('立即归零，并在后续两帧抵消 WebKit 的滚动锚定', () => {
    const callbacks: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const target = document.createElement('div')
    target.scrollTop = 720
    target.scrollLeft = 18

    const cleanup = resetScrollPosition(target)
    expect(target.scrollTop).toBe(0)
    expect(target.scrollLeft).toBe(0)

    target.scrollTop = 480
    callbacks[0]!(0)
    expect(target.scrollTop).toBe(0)

    target.scrollTop = 240
    callbacks[1]!(16)
    expect(target.scrollTop).toBe(0)

    cleanup()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2)
  })
})
