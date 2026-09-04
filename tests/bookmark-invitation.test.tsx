// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BookmarkInvitation } from '@/components/BookmarkInvitation'
import {
  BOOKMARK_PROMPT_SESSION_KEY,
  BOOKMARK_PROMPT_STORAGE_KEY,
  BOOKMARK_PROMPT_VISIT_DELAY_MS,
  loadBookmarkPromptState,
  recordBookmarkPromptReading,
  registerBookmarkPromptVisit,
  syncBookmarkPromptReadingCount,
} from '@/lib/bookmark-prompt'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('收藏提示状态', () => {
  it('同一标签页刷新不重复累计访问', () => {
    expect(registerBookmarkPromptVisit().visitCount).toBe(1)
    expect(sessionStorage.getItem(BOOKMARK_PROMPT_SESSION_KEY)).toBe('1')
    expect(registerBookmarkPromptVisit().visitCount).toBe(1)
  })

  it('累计本地起卦次数且只向上同步历史记录', () => {
    expect(recordBookmarkPromptReading().completedReadingCount).toBe(1)
    expect(recordBookmarkPromptReading().completedReadingCount).toBe(2)
    expect(syncBookmarkPromptReadingCount(1).completedReadingCount).toBe(2)
    expect(syncBookmarkPromptReadingCount(4).completedReadingCount).toBe(4)
  })
})

describe('行为触发的快捷访问提示', () => {
  it('手机端第二次本地起卦后立即显示主屏幕指引', () => {
    mockMobilePlatform('iPhone')
    savePromptState({ visitCount: 1, completedReadingCount: 2 })

    renderInvitation()

    expect(screen.getByText('把 HEX//64 留在手边')).toBeTruthy()
    expect(screen.getByText(/添加到主屏幕/)).toBeTruthy()
  })

  it('第二次访问等待片刻后才显示，不在页面载入时打断用户', () => {
    vi.useFakeTimers()
    mockMobilePlatform('Android')
    savePromptState({ visitCount: 1, completedReadingCount: 0 })

    renderInvitation()
    expect(screen.queryByText('把 HEX//64 留在手边')).toBeNull()

    act(() => vi.advanceTimersByTime(BOOKMARK_PROMPT_VISIT_DELAY_MS - 1))
    expect(screen.queryByText('把 HEX//64 留在手边')).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('把 HEX//64 留在手边')).toBeTruthy()
  })

  it('桌面浏览器不弹浮层', () => {
    mockDesktopPlatform()
    savePromptState({ visitCount: 2, completedReadingCount: 2 })

    renderInvitation()

    expect(screen.queryByText(/把 HEX\/\/64/)).toBeNull()
  })

  it('关闭后记住选择，不再提示', () => {
    mockMobilePlatform('iPhone')
    savePromptState({ visitCount: 1, completedReadingCount: 2 })

    renderInvitation()
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷访问提示，以后不再提示' }))

    expect(screen.queryByText('把 HEX//64 留在手边')).toBeNull()
    expect(loadBookmarkPromptState().dismissed).toBe(true)
  })
})

function renderInvitation() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <BookmarkInvitation />
    </MemoryRouter>,
  )
}

function savePromptState(state: { visitCount: number; completedReadingCount: number }) {
  localStorage.setItem(BOOKMARK_PROMPT_STORAGE_KEY, JSON.stringify(state))
}

function mockMobilePlatform(kind: 'iPhone' | 'Android') {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    kind === 'iPhone'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'
      : 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile',
  )
}

function mockDesktopPlatform() {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  )
}
