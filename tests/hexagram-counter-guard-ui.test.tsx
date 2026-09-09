// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { generateChart } from '@/engine'
import { ReadingProvider, useReading } from '@/store/reading'
import type { ReadingRecord } from '@/store/reading'

const rawLines = [6, 9, 8, 8, 7, 8] as ReadingRecord['rawLines']
const chart = generateChart({ inputMethod: 'manual', rawLines })

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('全局序号前端频率保护', () => {
  it('只停止 D1 登记，不影响排盘和 Umami 成功事件', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ ordinal: 200 }),
    )
    const track = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('umami', { track })

    const { result } = renderHook(() => useReading(), { wrapper })

    for (let index = 0; index < 9; index += 1) {
      act(() => result.current.commitReading(chart, rawLines))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(index + 1))
    }

    act(() => result.current.commitReading(chart, rawLines))

    expect(fetchMock).toHaveBeenCalledTimes(9)
    expect(result.current.current?.counterEventId).toBeUndefined()
    expect(result.current.current?.ordinal).toBeUndefined()
    expect(track.mock.calls.filter(([event]) => event === '成功生成排盘')).toHaveLength(10)
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <ReadingProvider>{children}</ReadingProvider>
}
