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

describe('AI 解卦教程', () => {
  it('从导航进入后展示完整流程并可一键启用推荐设置', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation: false }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    window.location.hash = '#/ai-guide'

    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'AI解卦教程' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '[AI解卦]' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByRole('img')).toHaveLength(6)
    expect(screen.queryByText('请调用六爻skill，根据以上六爻排盘进行分析，要分析的问题是：')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '复制安装指令' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://github.com/lemonteaau/liuyao-eight-lesson-interpreter')))

    fireEvent.click(screen.getByRole('button', { name: '一键设置' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '已设置 ✓' })).toBeTruthy())
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({
      aiInstruction: true,
      aiInstructionPrompt: '请调用六爻skill，根据以上六爻排盘进行分析，要分析的问题是：',
    })
  })

  it('覆盖非默认提示词前要求确认', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      animation: false,
      aiInstruction: true,
      aiInstructionPrompt: '保留我的自定义提示词',
    }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    window.location.hash = '#/ai-guide'

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '一键设置' }))
    expect(screen.getByRole('alert').textContent).toContain('检测到已有自定义提示词')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').aiInstructionPrompt).toBe('保留我的自定义提示词')

    fireEvent.click(screen.getByRole('button', { name: '覆盖并启用' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '已设置 ✓' })).toBeTruthy())
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({
      aiInstruction: true,
      aiInstructionPrompt: '请调用六爻skill，根据以上六爻排盘进行分析，要分析的问题是：',
    })
  })
})
