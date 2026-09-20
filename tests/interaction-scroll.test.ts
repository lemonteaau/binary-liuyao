// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollIntoViewIfNeeded } from '@/lib/interaction-scroll'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  delete document.documentElement.dataset.motion
})

function targetAt(top: number, height: number) {
  const target = document.createElement('div')
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top,
    toJSON: () => ({}),
  })
  target.scrollIntoView = vi.fn()
  document.body.append(target)
  return target
}

describe('按可见区域滚动到后续内容', () => {
  it.each([390, 1280, 1920])('宽度 %i 下内容被遮挡时均滚动', (width) => {
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('innerHeight', 800)
    const target = targetAt(650, 300)
    expect(scrollIntoViewIfNeeded(target)).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth', block: 'start', inline: 'nearest',
    })
  })

  it('内容完整可见时保持位置', () => {
    const target = targetAt(100, 200)
    expect(scrollIntoViewIfNeeded(target)).toBe(false)
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('识别 CRT 内部滚动容器的遮挡', () => {
    const target = targetAt(350, 200)
    const container = document.createElement('div')
    container.style.overflowY = 'auto'
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 50 } as DOMRect)
    Object.defineProperty(container, 'clientHeight', { value: 400 })
    document.body.append(container)
    container.append(target)
    expect(scrollIntoViewIfNeeded(target)).toBe(true)
  })

  it('内容顶部在可视区上方时滚回开头', () => {
    expect(scrollIntoViewIfNeeded(targetAt(-50, 300))).toBe(true)
  })

  it('超高内容已对齐顶部时不重复滚动', () => {
    const target = targetAt(12, 2000)
    target.style.scrollMarginTop = '12px'
    expect(scrollIntoViewIfNeeded(target)).toBe(false)
  })

  it('使用缩小后的 visual viewport 判断遮挡', () => {
    vi.stubGlobal('visualViewport', { offsetTop: 50, height: 300 })
    expect(scrollIntoViewIfNeeded(targetAt(100, 400))).toBe(true)
  })

  it.each(['setting', 'system'])('尊重 %s 的减少动态效果设置', (source) => {
    if (source === 'setting') document.documentElement.dataset.motion = 'off'
    else vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const target = targetAt(1000, 300)
    scrollIntoViewIfNeeded(target)
    expect(target.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('忽略缺失或隐藏的内容', () => {
    expect(scrollIntoViewIfNeeded(null)).toBe(false)
    expect(scrollIntoViewIfNeeded(targetAt(0, 0))).toBe(false)
  })
})
