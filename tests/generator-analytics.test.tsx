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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('起卦页 Umami 事件', () => {
  it('切换起卦方式时记录所选方式，相同方式不重复记录', () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: false }))

    render(<App />)

    const manualButton = screen.getByRole('button', { name: /手动排卦/ })
    fireEvent.click(manualButton)
    fireEvent.click(manualButton)
    fireEvent.click(screen.getByRole('button', { name: /数字起卦/ }))

    expect(track).toHaveBeenCalledWith('选择起卦方式', { 起卦方式: '手动排卦' })
    expect(track).toHaveBeenCalledWith('选择起卦方式', { 起卦方式: '数字起卦' })
    expect(track.mock.calls.filter(([event]) => event === '选择起卦方式')).toHaveLength(2)
  })

  it('记录最终起卦点击和成功生成', async () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: false }))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /手动排卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '生成排盘 →' }))

    await waitFor(() => expect(window.location.hash).toBe('#/result'))
    expect(track).toHaveBeenCalledWith('点击生成排盘', { 起卦方式: '手动排卦' })
    expect(track).toHaveBeenCalledWith('成功生成排盘', { 起卦方式: '手动排卦' })
  })

  it('摇币只记录首次开始，并记录重置时已完成的爻数', () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: false }))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /摇币起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '点击开始摇动初爻' }))
    fireEvent.click(screen.getByRole('button', { name: '点击停止并记录初爻' }))
    fireEvent.click(screen.getByRole('button', { name: '重置本次摇卦' }))

    expect(track.mock.calls.filter(([event]) => event === '开始摇币起卦')).toHaveLength(1)
    expect(track).toHaveBeenCalledWith('重置摇币起卦', { 已完成爻数: 1 })
  })
})
