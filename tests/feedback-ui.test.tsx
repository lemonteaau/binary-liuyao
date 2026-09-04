// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeedbackInvitation } from '@/components/FeedbackInvitation'
import { AboutPage } from '@/pages/AboutPage'
import {
  FEEDBACK_PROMPT_ACTIVE_MS,
  FEEDBACK_PROMPT_STORAGE_KEY,
} from '@/lib/feedback'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('关于页反馈栏', () => {
  it('常驻显示匿名反馈表单，并在成功后给出确认', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('6cb56d6e-c7d8-4824-8ed4-b782e36d9f54')

    render(
      <MemoryRouter initialEntries={['/about']}>
        <AboutPage />
      </MemoryRouter>,
    )

    const textarea = screen.getByRole('textbox', { name: '反馈意见' })
    fireEvent.change(textarea, { target: { value: '希望历史记录可以搜索。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByText('反馈已收到')).toBeTruthy()
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({
      method: 'POST',
    }))
    const stored = JSON.parse(localStorage.getItem(FEEDBACK_PROMPT_STORAGE_KEY) ?? '{}') as {
      submitted?: boolean
    }
    expect(stored.submitted).toBe(true)
  })

  it('发送失败时保留原文供重试', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('6cb56d6e-c7d8-4824-8ed4-b782e36d9f54')

    render(
      <MemoryRouter initialEntries={['/about']}>
        <AboutPage />
      </MemoryRouter>,
    )

    const textarea = screen.getByRole('textbox', { name: '反馈意见' }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '这里有一条不会丢的反馈。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('内容还在')
    })
    expect(textarea.value).toBe('这里有一条不会丢的反馈。')
  })

  it('关于页常驻显示跨平台的再次访问方法', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AboutPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('把本站留在手边')).toBeTruthy()
    expect(screen.getByText(/Ctrl D/)).toBeTruthy()
    expect(screen.getByText(/快捷键可能因浏览器设置而不同/)).toBeTruthy()
    expect(screen.getByText(/添加到主屏幕/)).toBeTruthy()
  })
})

describe('温和反馈邀请', () => {
  it('累计活跃时间不足时不显示', () => {
    localStorage.setItem(FEEDBACK_PROMPT_STORAGE_KEY, JSON.stringify({
      activeMs: FEEDBACK_PROMPT_ACTIVE_MS - 1,
    }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <FeedbackInvitation />
      </MemoryRouter>,
    )

    expect(screen.queryByText('用了一阵子，还顺手吗？')).toBeNull()
  })

  it('达到门槛后显示非模态邀请，关闭后 30 天内不再提示', () => {
    localStorage.setItem(FEEDBACK_PROMPT_STORAGE_KEY, JSON.stringify({
      activeMs: FEEDBACK_PROMPT_ACTIVE_MS,
    }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <FeedbackInvitation />
      </MemoryRouter>,
    )

    expect(screen.getByText('用了一阵子，还顺手吗？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭反馈邀请，30 天内不再提示' }))
    expect(screen.queryByText('用了一阵子，还顺手吗？')).toBeNull()

    const stored = JSON.parse(localStorage.getItem(FEEDBACK_PROMPT_STORAGE_KEY) ?? '{}') as {
      dismissedUntil?: number
    }
    expect(stored.dismissedUntil).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000)
  })

  it('关于页已有常驻反馈栏时不重复显示邀请', () => {
    localStorage.setItem(FEEDBACK_PROMPT_STORAGE_KEY, JSON.stringify({
      activeMs: FEEDBACK_PROMPT_ACTIVE_MS,
    }))

    render(
      <MemoryRouter initialEntries={['/about']}>
        <FeedbackInvitation />
      </MemoryRouter>,
    )

    expect(screen.queryByText('用了一阵子，还顺手吗？')).toBeNull()
  })

  it('收藏提示显示时暂缓反馈邀请', () => {
    localStorage.setItem(FEEDBACK_PROMPT_STORAGE_KEY, JSON.stringify({
      activeMs: FEEDBACK_PROMPT_ACTIVE_MS,
    }))

    render(
      <MemoryRouter initialEntries={['/']}>
        <FeedbackInvitation suppressed />
      </MemoryRouter>,
    )

    expect(screen.queryByText('用了一阵子，还顺手吗？')).toBeNull()
  })
})
