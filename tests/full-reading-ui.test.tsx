// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(screen.getByRole('heading', { name: '周易原文' })).toBeTruthy()
    expect(screen.getByRole('article', { name: '本卦《坎为水》周易原文' })).toBeTruthy()
    expect(screen.getByRole('article', { name: '变卦《水雷屯》周易原文' })).toBeTruthy()
    const copyButton = screen.getByRole('button', { name: '复制排盘' })
    expect(copyButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('显示本卦与变卦的卦辞、六爻，并标出本卦动爻', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const primary = screen.getByRole('article', { name: '本卦《坎为水》周易原文' })
    const result = screen.getByRole('article', { name: '变卦《水雷屯》周易原文' })

    expect(within(primary).getByText('习坎，有孚维心亨，行有尚。')).toBeTruthy()
    expect(within(primary).getAllByRole('listitem')).toHaveLength(6)
    expect(within(result).getByText('元亨，利贞。勿用有攸往，利建侯。')).toBeTruthy()
    expect(within(result).getAllByRole('listitem')).toHaveLength(6)
    expect(within(primary).getAllByText('动爻')).toHaveLength(2)
    expect(within(result).queryByText('动爻')).toBeNull()
  })

  it('无变爻时只显示一次原文，并保留乾卦用九', () => {
    const chart = generateChart({
      inputMethod: 'manual',
      rawLines: [7, 7, 7, 7, 7, 7],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })
    render(<FullReading chart={chart} rawText="" />)

    const classic = screen.getByRole('article', {
      name: '本卦 · 无变爻《乾为天》周易原文',
    })
    const classicsRegion = screen.getByRole('region', { name: '周易原文' })
    expect(within(classicsRegion).getAllByRole('article')).toHaveLength(1)
    expect(within(classic).getByText('见群龙无首，吉。')).toBeTruthy()
    expect(within(classic).queryByText('动爻')).toBeNull()
    expect(screen.queryByRole('article', { name: '变卦《乾为天》周易原文' })).toBeNull()
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
    expect(screen.getByRole('heading', { name: '周易原文' })).toBeTruthy()
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
