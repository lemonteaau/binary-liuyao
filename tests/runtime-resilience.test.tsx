// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { BootSequence, useBootOnce } from '@/components/BootSequence'
import { FeedbackForm } from '@/components/FeedbackForm'
import { LiveClock } from '@/components/LiveClock'
import { generateChart } from '@/engine'
import { ReadingProvider, useReading } from '@/store/reading'
import { SettingsProvider, useSettings } from '@/store/settings'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.location.hash = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function SettingsProbe() {
  const { settings, resolvedTimezone } = useSettings()
  return <output>{JSON.stringify({ ...settings, resolvedTimezone })}</output>
}

function ReadingProbe() {
  const { current, history } = useReading()
  return <output>{JSON.stringify({ current, history })}</output>
}

function BootProbe() {
  const { booting } = useBootOnce(true)
  return <output>{String(booting)}</output>
}

describe('异常状态恢复', () => {
  it('无效设置回退默认值，并保留有效的自定义提示词', () => {
    localStorage.setItem('hex64.settings.v1', JSON.stringify({
      timezone: 'Invalid/Zone', animation: 'false', screenFx: null,
      aiInstruction: {}, fontSize: 'huge', aiInstructionPrompt: '我的提示词',
    }))
    render(<SettingsProvider><SettingsProbe /></SettingsProvider>)
    const settings = JSON.parse(screen.getByRole('status').textContent!)
    expect(settings).toMatchObject({
      timezone: 'auto', fontSize: 'standard', animation: true,
      screenFx: true, aiInstruction: false, aiInstructionPrompt: '我的提示词',
    })
    expect(() => new Intl.DateTimeFormat('en', { timeZone: settings.resolvedTimezone })).not.toThrow()
  })

  it('历史损坏条目被跳过，正常记录保留且恢复不超过 20 条', () => {
    const rawLines = [7, 8, 7, 8, 7, 8] as const
    const chart = generateChart({ inputMethod: 'manual', rawLines })
    const records = Array.from({ length: 25 }, (_, index) => ({
      id: index.toString(16).toUpperCase().padStart(6, '0'), rawLines, chart,
    }))
    localStorage.setItem('hex64.current.v1', '{}')
    localStorage.setItem('hex64.history.v1', JSON.stringify([null, {}, ...records]))
    render(<ReadingProvider><ReadingProbe /></ReadingProvider>)
    const restored = JSON.parse(screen.getByRole('status').textContent!)
    expect(restored.current).toBeNull()
    expect(restored.history).toEqual(records.slice(0, 20))
    // 加载阶段不覆盖存储，仍能手动恢复原始数据。
    expect(JSON.parse(localStorage.getItem('hex64.history.v1')!)).toHaveLength(27)
  })

  it('空结果页也能通过跳过导航按钮聚焦主标题', async () => {
    localStorage.setItem('hex64.settings.v1', JSON.stringify({ animation: false }))
    window.location.hash = '#/result'
    render(<App />)
    const scroll = vi.fn()
    Object.defineProperty(document.getElementById('main-content'), 'scrollIntoView', { value: scroll })
    fireEvent.click(screen.getByRole('button', { name: '跳到主要内容' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })))
    expect(scroll).toHaveBeenCalled()
  })
})

describe('动效与后台计时', () => {
  it('系统减少动态效果时跳过启动序列', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<BootProbe />)
    expect(screen.getByRole('status').textContent).toBe('false')
  })

  it.each(['Enter', ' '])('可用键盘 %s 跳过启动序列', (key) => {
    const onDone = vi.fn()
    render(<BootSequence onDone={onDone} />)
    fireEvent.keyDown(screen.getByRole('button'), { key })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('隐藏页面停止时钟定时器，重新可见与切换时区立即更新', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T06:00:00Z'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const view = render(<LiveClock timezone="UTC" />)
    expect(view.container.textContent).toBe('06:00:00')
    expect(vi.getTimerCount()).toBe(1)
    visibility.mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(60_000))
    expect(view.container.textContent).toBe('06:00:00')
    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(view.container.textContent).toBe('06:01:00')
    view.rerender(<LiveClock timezone="Asia/Shanghai" />)
    expect(view.container.textContent).toBe('14:01:00')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('反馈请求恢复', () => {
  it('十秒超时后解除提交锁定并保留原文', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    render(<FeedbackForm />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '网络一直没有回应' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(input.disabled).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(screen.getByRole('alert').textContent).toContain('内容还在')
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('网络一直没有回应')
  })

  it('相同内容重试复用 ID，修改内容后分配新的 ID', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('response lost'))
    vi.stubGlobal('fetch', fetchMock)
    render(<FeedbackForm />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '第一条反馈' } })
    for (let index = 0; index < 2; index++) {
      fireEvent.click(screen.getByRole('button', { name: '发送' }))
      await screen.findByRole('alert')
    }
    fireEvent.change(input, { target: { value: '修改后的反馈' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByRole('alert')
    const payloads = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))
    expect(payloads[1].submissionId).toBe(payloads[0].submissionId)
    expect(payloads[2].submissionId).not.toBe(payloads[0].submissionId)
    expect(payloads[2].message).toBe('修改后的反馈')
  })

  it('卸载表单取消请求，不留下待处理提交', () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }))
    const view = render(<FeedbackForm />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '正在发送的反馈' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
