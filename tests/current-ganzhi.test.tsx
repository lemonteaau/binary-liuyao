// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CurrentGanzhi, shichenRange } from '@/components/CurrentGanzhi'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('首页此刻四柱', () => {
  it('时辰起止跨零点', () => {
    expect(shichenRange('子')).toBe('23:00–01:00')
    expect(shichenRange('卯')).toBe('05:00–07:00')
    expect(shichenRange('亥')).toBe('21:00–23:00')
  })

  it('按所选时区显示四柱，并随时辰更新', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    // 北京时间 2026-10-16 06:03:15
    vi.setSystemTime(new Date('2026-10-15T22:03:15Z'))
    render(<CurrentGanzhi timezone="Asia/Shanghai" />)

    expect(screen.getByText('丙午年')).toBeTruthy()
    expect(screen.getByText('戊戌月')).toBeTruthy()
    expect(screen.getByText('癸亥日')).toBeTruthy()
    expect(screen.getByText('乙卯时')).toBeTruthy()
    expect(screen.getByText('卯时 05:00–07:00')).toBeTruthy()

    // 07:00 换辰时
    act(() => {
      vi.setSystemTime(new Date('2026-10-15T23:00:10Z'))
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('丙辰时')).toBeTruthy()
    expect(screen.getByText('辰时 07:00–09:00')).toBeTruthy()
  })
})
