// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FullReading } from '@/components/FullReading'
import { generateChart } from '@/engine'
import { formatRawText } from '@/formatters/rawText'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function testReading() {
  const chart = generateChart({
    inputMethod: 'manual',
    rawLines: [6, 9, 8, 8, 7, 8],
    when: new Date('2026-08-24T14:42:37+08:00'),
    timezone: 'Asia/Shanghai',
  })
  return {
    chart,
    rawText: formatRawText(chart, { includeAiInstruction: false }),
  }
}

describe('FullReading 显示模式与复制', () => {
  it('默认显示结构化排盘', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    expect(screen.getByRole('heading', { name: '结构化六爻排盘' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '结构化' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '纯文字' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('region', { name: '本卦与变卦逐爻排盘' })).toBeTruthy()
    expect(screen.getAllByText('本卦')).toHaveLength(1)
    expect(screen.getAllByText('变卦')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: '纯文字排盘' })).toBeNull()
    const copyButton = screen.getByRole('button', { name: '复制排盘' })
    expect(copyButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('可切换为纯文字，并复制完整的排盘文本', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { chart, rawText } = testReading()
    const { container } = render(<FullReading chart={chart} rawText={rawText} />)

    fireEvent.click(screen.getByRole('button', { name: '纯文字' }))

    expect(screen.getByRole('heading', { name: '纯文字排盘' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '纯文字' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('region', { name: '本卦与变卦逐爻排盘' })).toBeNull()
    const plainReading = container.querySelector('pre')
    expect(plainReading?.textContent).toBe(rawText)

    const copyButton = screen.getByRole('button', { name: '复制排盘' })
    expect(copyButton.textContent).toBe('复制排盘')
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(writeText).toHaveBeenCalledWith(rawText)
  })
})
