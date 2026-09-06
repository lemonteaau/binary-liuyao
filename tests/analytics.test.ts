// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackDivinationEvent } from '@/lib/analytics'
import type { InputMethod } from '@/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Umami 起卦方式汉化', () => {
  it('将所有内部起卦枚举转换为中文属性值', () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    const methods: InputMethod[] = [
      'coin', 'entropy', 'manual', 'hexagram', 'number', 'time', 'hanzi', 'link',
    ]

    for (const method of methods) {
      trackDivinationEvent('测试事件', method)
    }

    expect(track.mock.calls).toEqual([
      ['测试事件', { 起卦方式: '摇币起卦' }],
      ['测试事件', { 起卦方式: '电脑起卦' }],
      ['测试事件', { 起卦方式: '手动排卦' }],
      ['测试事件', { 起卦方式: '卦名起卦' }],
      ['测试事件', { 起卦方式: '数字起卦' }],
      ['测试事件', { 起卦方式: '时间起卦' }],
      ['测试事件', { 起卦方式: '汉字起卦' }],
      ['测试事件', { 起卦方式: '分享链接' }],
    ])
  })
})
