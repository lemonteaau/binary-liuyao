// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SupportNudge } from '@/components/SupportNudge'
import { generateChart } from '@/engine'
import {
  claimSupportNudge,
  GLOBAL_GAP_MS,
  isFreshReading,
  loadSupportNudgeState,
  milestoneForReading,
  recordSupportClick,
  recordSupportNudgeReading,
  SAME_KIND_GAP_MS,
  SUPPORT_NUDGE_STORAGE_KEY,
  SUPPORTED_SILENCE_MS,
  syncSupportNudgeReadings,
} from '@/lib/support-nudge'
import type { ReadingRecord } from '@/store/reading'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1)

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function withReadings(readings: number) {
  localStorage.setItem(SUPPORT_NUDGE_STORAGE_KEY, JSON.stringify({ readings, shownAt: {} }))
}

describe('打赏提示限频', () => {
  it('同一时刻重复请求结果一致，只记一次展示', () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    expect(claimSupportNudge('outcome', 'A', T0)).toBe(true)
    expect(claimSupportNudge('outcome', 'A', T0 + 1000)).toBe(true)
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('任意两条提示之间至少间隔两周', () => {
    withReadings(10)
    expect(claimSupportNudge('outcome', 'A', T0)).toBe(true)
    expect(claimSupportNudge('ordinal', 'B', T0 + DAY)).toBe(false)
    expect(claimSupportNudge('ordinal', 'B', T0 + GLOBAL_GAP_MS - 1)).toBe(false)
    expect(claimSupportNudge('ordinal', 'B', T0 + GLOBAL_GAP_MS)).toBe(true)
  })

  it('同一种提示四个月内只出现一次', () => {
    expect(claimSupportNudge('export', 'A', T0)).toBe(true)
    expect(claimSupportNudge('export', 'B', T0 + GLOBAL_GAP_MS * 2)).toBe(false)
    expect(claimSupportNudge('export', 'B', T0 + SAME_KIND_GAP_MS)).toBe(true)
  })

  it('点过支持作者后半年内不再出现', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T0)
    recordSupportClick('页头')
    expect(claimSupportNudge('outcome', 'A', T0 + SUPPORTED_SILENCE_MS - 1)).toBe(false)
    expect(claimSupportNudge('outcome', 'A', T0 + SUPPORTED_SILENCE_MS)).toBe(true)
    vi.restoreAllMocks()
  })

  it('新用户排盘次数不足时不显示序号与教程提示', () => {
    withReadings(2)
    expect(claimSupportNudge('ordinal', 'A', T0)).toBe(false)
    expect(claimSupportNudge('ai-guide', 'A', T0)).toBe(false)
    withReadings(5)
    expect(claimSupportNudge('ordinal', 'A', T0)).toBe(true)
  })

  it('正常使用一年最多看到有限几条', () => {
    withReadings(50)
    const kinds = ['outcome', 'milestone', 'ordinal', 'ai-guide', 'export'] as const
    let shown = 0
    for (let day = 0; day < 365; day++) {
      for (const kind of kinds) {
        if (claimSupportNudge(kind, `${kind}-${day}`, T0 + day * DAY)) shown++
      }
    }
    // 每两周至多一条
    expect(shown).toBeLessThanOrEqual(Math.ceil(365 * DAY / GLOBAL_GAP_MS))
  })

  it('存储不可用时不显示', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(claimSupportNudge('outcome', 'A', T0)).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('排盘里程碑', () => {
  it('恰好达到里程碑时记住该卦，老用户的历史只补计数不补发', () => {
    syncSupportNudgeReadings(8)
    recordSupportNudgeReading('AAAAAA')
    expect(milestoneForReading('AAAAAA')).toBeNull()
    recordSupportNudgeReading('BBBBBB')
    expect(loadSupportNudgeState().readings).toBe(10)
    expect(milestoneForReading('BBBBBB')).toBe(10)

    syncSupportNudgeReadings(60)
    expect(loadSupportNudgeState().readings).toBe(60)
    expect(milestoneForReading('BBBBBB')).toBe(10)
  })

  it('只有刚在本机完成的排盘算作新排盘', () => {
    const rawLines = [7, 8, 7, 8, 7, 8] as ReadingRecord['rawLines']
    const when = new Date(T0)
    const reading: ReadingRecord = {
      id: 'AAAAAA', rawLines, chart: generateChart({ inputMethod: 'manual', rawLines, when, timezone: 'Asia/Shanghai' }),
    }
    expect(isFreshReading(reading, T0 + 60_000)).toBe(true)
    expect(isFreshReading(reading, T0 + DAY)).toBe(false)
    expect(isFreshReading({ ...reading, source: 'share-link' }, T0 + 60_000)).toBe(false)
  })
})

describe('SupportNudge', () => {
  it('显示一行提示，点击后进入静默期', () => {
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    render(
      <MemoryRouter>
        <SupportNudge kind="outcome" occurrence="A">卦有应验？</SupportNudge>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: '支持作者 →' })
    expect(link.getAttribute('href')).toBe('/about?support=1')
    fireEvent.click(link)
    expect(track).toHaveBeenCalledWith('点击支持作者', { 入口: '应验记录' })
    expect(loadSupportNudgeState().supportedAt).toBeDefined()
  })

  it('被限频时不渲染任何内容', () => {
    claimSupportNudge('export', 'X')
    const { container } = render(
      <MemoryRouter>
        <SupportNudge kind="outcome" occurrence="A">卦有应验？</SupportNudge>
      </MemoryRouter>,
    )
    expect(container.innerHTML).toBe('')
  })
})
