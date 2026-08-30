// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollIntoViewOnMobile } from '@/lib/mobile-scroll'

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
