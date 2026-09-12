// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { legacyRouteDestination, migrateLegacyRoute } from '@/lib/routing'

const shared = 'v=2&s=101010&m=001000&t=1787553757&z=Asia%2FShanghai&i=coin&r=A1B2C3&o=864'

beforeEach(() => {
  localStorage.setItem('hex64.settings.v1', JSON.stringify({ animation: false, timezone: 'Asia/Shanghai' }))
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('旧地址迁移与数据兼容', () => {
  it.each([
    ['#/', '/'],
    ['#/about?support=1', '/about?support=1'],
    ['#/about?feedback=1', '/about?feedback=1'],
    ['#/ai-guide', '/ai-guide'],
    ['#/settings', '/settings'],
    ['#/result?s=101010&m=001000', '/result#s=101010&m=001000'],
    [`#/result?${shared}`, `/result#${shared}`],
    ['#/result', '/result'],
    ['#/%72esult?s=101010&m=001000', '/result#s=101010&m=001000'],
    ['#/RESULT/?s=101010&m=001000', '/result#s=101010&m=001000'],
    ['#/about/../result?s=101010&m=001000', '/result#s=101010&m=001000'],
    ['#/about?feedback=1#feedback', '/about?feedback=1#feedback'],
    ['#v=2&s=101010&m=001000', null],
    ['#support', null],
    ['', null],
    ['#//evil.example/path', '/'],
    ['#/\\evil.example/path', '/'],
  ])('转换 %s，同时保留参数与站内边界', (hash, destination) => {
    expect(legacyRouteDestination(hash)).toBe(destination)
  })

  it('在 React 启动前替换旧入口，不增加历史项、不改存储，也不把排盘放到 query', () => {
    window.history.replaceState({ custom: 'keep' }, '', `/?utm_source=old#/result?${shared}`)
    const length = window.history.length
    const stored = localStorage.getItem('hex64.settings.v1')
    migrateLegacyRoute()
    expect(window.location.pathname).toBe('/result')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe(`#${shared}`)
    expect(window.history.length).toBe(length)
    expect(window.history.state).toEqual({ custom: 'keep' })
    expect(localStorage.getItem('hex64.settings.v1')).toBe(stored)
    migrateLegacyRoute()
    expect(window.location.hash).toBe(`#${shared}`)
  })

  it.each([`/#/result?${shared}`, `/result#${shared}`])('完整还原 %s，刷新不重复插入历史或领取序号', async (url) => {
    window.history.replaceState(null, '', url)
    migrateLegacyRoute()
    const view = render(<App />)
    await waitFor(() => expect(screen.getByText('排盘完成')).toBeTruthy())
    const original = JSON.parse(localStorage.getItem('hex64.current.v1')!)
    expect(original).toMatchObject({ id: 'A1B2C3', ordinal: 864, source: 'share-link', chart: { inputMethod: 'coin' } })
    expect(original.chart.calendar.timezone).toBe('Asia/Shanghai')
    expect(window.location.pathname).toBe('/result')
    expect(window.location.search).toBe('')
    view.unmount()
    render(<App />)
    await waitFor(() => expect(screen.getByText('排盘完成')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem('hex64.current.v1')!)).toEqual(original)
    expect(JSON.parse(localStorage.getItem('hex64.history.v1')!)).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('运行中打开旧地址、后退与前进仍正确切页', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '[设置]' }))
    expect(window.location.pathname).toBe('/settings')
    await act(async () => { window.location.hash = '#/ai-guide' })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'AI解卦教程' })).toBeTruthy())
    expect(window.location.pathname).toBe('/ai-guide')
    expect(window.location.hash).toBe('')
    await act(async () => { window.history.back() })
    await waitFor(() => expect(window.location.pathname).toBe('/settings'))
    expect(screen.getByRole('link', { name: '[设置]' }).getAttribute('aria-current')).toBe('page')
    await act(async () => { window.history.forward() })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'AI解卦教程' })).toBeTruthy())
  })

  it.each(['support', 'feedback'])('保留关于页的 %s 定位入口', async (section) => {
    window.history.replaceState(null, '', `/#/about?${section}=1`)
    migrateLegacyRoute()
    render(<App />)
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled())
    expect(window.location.pathname).toBe('/about')
    expect(window.location.search).toBe(`?${section}=1`)
  })
})
