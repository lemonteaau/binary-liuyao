// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'

const SETTINGS_KEY = 'hex64.settings.v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.location.hash = ''
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('路由切换滚动复位', () => {
  it('结果页使用新滚动容器，不复用起卦页的偏移与 WebKit 合成层', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: false }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /摇币起卦/ }))
    const generatorScroller = container.querySelector<HTMLElement>('.crt-content')!
    generatorScroller.scrollTop = 640

    for (const lineName of ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']) {
      fireEvent.click(screen.getByRole('button', { name: `点击开始摇动${lineName}` }))
      fireEvent.click(screen.getByRole('button', { name: `点击停止并记录${lineName}` }))
    }
    fireEvent.click(screen.getByRole('button', { name: '六爻已完成，生成排盘' }))

    await waitFor(() => expect(window.location.hash).toBe('#/result'))
    const resultScroller = container.querySelector<HTMLElement>('.crt-content')!

    expect(resultScroller).not.toBe(generatorScroller)
    expect(resultScroller.scrollTop).toBe(0)
    expect(screen.getByText('排盘完成')).toBeTruthy()
  })
})
