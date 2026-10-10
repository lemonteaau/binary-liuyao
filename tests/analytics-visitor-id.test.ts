// @vitest-environment jsdom

import html from '../index.html?raw'
import { afterEach, describe, expect, it, vi } from 'vitest'

const VISITOR_ID_KEY = 'hex64.visitor-id.v1'

type BeforeSend = (type: string, payload: Record<string, unknown>) => Record<string, unknown>

function runInlineAnalyticsScript(): BeforeSend {
  const scripts = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script')
  const source = [...scripts].find((script) => script.textContent?.includes('umamiBeforeSend'))?.textContent
  if (!source) throw new Error('index.html 中未找到 Umami 内联脚本')

  new Function(source)()
  return (window as unknown as { umamiBeforeSend: BeforeSend }).umamiBeforeSend
}

afterEach(() => {
  // Flush load listeners a test left pending so they cannot fire in the next one.
  vi.unstubAllGlobals()
  window.dispatchEvent(new Event('load'))
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Umami 本地访客编号', () => {
  it('首次访问生成随机编号并随每次上报发送', () => {
    const beforeSend = runInlineAnalyticsScript()
    const stored = localStorage.getItem(VISITOR_ID_KEY)

    expect(stored).toMatch(/^[0-9a-f]{32}$/)
    expect(beforeSend('event', { url: '/result?s=1', referrer: '' })).toEqual({
      url: '/result',
      referrer: '',
      id: stored,
    })
  })

  it('再次访问沿用已保存的编号', () => {
    localStorage.setItem(VISITOR_ID_KEY, 'a'.repeat(32))

    const beforeSend = runInlineAnalyticsScript()

    expect(beforeSend('event', { url: '/' }).id).toBe('a'.repeat(32))
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe('a'.repeat(32))
  })

  it('只在编号新生成时把它关联到 Umami 已有的访客记录', () => {
    const identify = vi.fn()
    vi.stubGlobal('umami', { identify })

    runInlineAnalyticsScript()
    window.dispatchEvent(new Event('load'))
    expect(identify).toHaveBeenCalledExactlyOnceWith(localStorage.getItem(VISITOR_ID_KEY))

    runInlineAnalyticsScript()
    window.dispatchEvent(new Event('load'))
    expect(identify).toHaveBeenCalledOnce()
  })

  it('本地存储不可写时不发送编号', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const beforeSend = runInlineAnalyticsScript()

    expect(beforeSend('event', { url: '/' })).toEqual({ url: '/', referrer: undefined })
  })

  it('通过 ?umami=off 与 ?umami=on 在本浏览器关闭和恢复统计', () => {
    window.history.replaceState(null, '', '/?umami=off')
    runInlineAnalyticsScript()
    expect(localStorage.getItem('umami.disabled')).toBe('1')

    window.history.replaceState(null, '', '/')
    runInlineAnalyticsScript()
    expect(localStorage.getItem('umami.disabled')).toBe('1')

    window.history.replaceState(null, '', '/?umami=on')
    runInlineAnalyticsScript()
    expect(localStorage.getItem('umami.disabled')).toBeNull()
  })
})
