// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { FullReading } from '@/components/FullReading'
import { generateChart } from '@/engine'
import { formatRawText } from '@/formatters/rawText'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
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

describe('FullReading 显示模式与逐爻排盘', () => {
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
    // 复制与分享已移到结果页顶部工具栏
    expect(screen.queryByRole('button', { name: '复制排盘' })).toBeNull()
  })

  it('静爻只保留必要标注，世应放在爻位栏，旬空标在落空的爻上', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const fifth = screen.getByRole('article', { name: '五爻，静爻' })
    // 坎为水：日空戌亥，五爻官鬼戊戌落空
    expect(within(fifth).getByText('空').getAttribute('title')).toBe('旬空：戌亥')
    expect(within(fifth).queryByText('少阳 · 静')).toBeNull()
    expect(within(fifth).queryByText('阳爻')).toBeNull()
    expect(screen.getAllByText('空')).toHaveLength(1)

    const top = screen.getByRole('article', { name: '上爻，静爻' })
    expect(top.querySelector('.reading-line-rail .reading-shiying')?.textContent).toBe('世')
    const third = screen.getByRole('article', { name: '三爻，静爻' })
    expect(third.querySelector('.reading-line-rail .reading-shiying')?.textContent).toBe('应')

    const second = screen.getByRole('article', { name: '二爻，动爻，回头克' })
    expect(within(second).getByText('老阳 · 动')).toBeTruthy()
    expect(within(second).getByText('变')).toBeTruthy()
  })

  it('历法区把四柱、旬空与卦身排在同一行', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const pillars = screen.getByLabelText('四柱干支、旬空与卦身')
    const terms = within(pillars).getAllByRole('term').map((term) => term.textContent)
    expect(terms).toEqual(['年柱', '月柱', '日柱', '时柱', '旬空', '卦身'])
    expect(within(pillars).getByText('戌亥')).toBeTruthy()
  })

  it('神煞标出所临的爻位，包括伏神与动爻化出的变爻', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const shensha = screen.getByRole('region', { name: '神煞与附加信息' })
    // 驿马、日禄都在申，落在四爻父母戊申
    expect(within(shensha).getAllByTitle('落在四爻').map((hit) => hit.textContent)).toEqual(['四爻', '四爻'])
    // 贵人寅午：初爻寅、三爻午，二爻动化出寅
    expect(within(shensha).getByTitle('落在初、三爻 · 二爻变').textContent).toBe('初、三爻 · 二爻变')
    // 灾煞子：上爻子，初爻动化出子
    expect(within(shensha).getByTitle('落在上爻 · 初爻变')).toBeTruthy()
    const peach = within(shensha).getByText('桃花').closest('li')!
    expect(peach.getAttribute('data-hit')).toBe('false')
    expect(peach.querySelector('em')).toBeNull()
  })

  it('静卦不显示变卦一栏', () => {
    const chart = generateChart({
      inputMethod: 'manual',
      rawLines: [7, 7, 7, 7, 7, 7],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })
    render(<FullReading chart={chart} rawText="" />)

    const matrix = screen.getByRole('region', { name: '本卦逐爻排盘' })
    expect(matrix.getAttribute('data-static')).toBe('true')
    expect(within(matrix).queryByText('变卦')).toBeNull()
    expect(within(matrix).queryByText('变化')).toBeNull()
    expect(within(matrix).getByText('六爻安静 · 无变卦')).toBeTruthy()
  })

  it('动爻标出变爻对本爻的回头生克', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const second = screen.getByRole('article', { name: '二爻，动爻，回头克' })
    expect(within(second).getByText('回头克').getAttribute('title')).toBe('变爻五行克本爻')
    const first = screen.getByRole('article', { name: '初爻，动爻，回头生' })
    expect(within(first).getByText('回头生').getAttribute('title')).toBe('变爻五行生本爻')
    // 只说明关系、不暗示吉凶：生克标签外观一致
    expect(within(second).getByText('回头克').className).toBe(within(first).getByText('回头生').className)
    expect(screen.getByRole('article', { name: '三爻，静爻' })).toBeTruthy()
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

  it('可切换为纯文字，并记住上次选择的显示模式', () => {
    const { chart, rawText } = testReading()
    const { container, unmount } = render(<FullReading chart={chart} rawText={rawText} />)

    fireEvent.click(screen.getByRole('button', { name: '纯文字' }))

    expect(screen.getByRole('heading', { name: '纯文字排盘' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '纯文字' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('region', { name: '本卦与变卦逐爻排盘' })).toBeNull()
    expect(screen.getByRole('heading', { name: '周易原文' })).toBeTruthy()
    expect(container.querySelector('pre')?.textContent).toBe(rawText)

    unmount()
    render(<FullReading chart={chart} rawText={rawText} />)
    expect(screen.getByRole('heading', { name: '纯文字排盘' })).toBeTruthy()
  })

  it('周易原文可展开或收起其余爻辞', () => {
    const { chart, rawText } = testReading()
    render(<FullReading chart={chart} rawText={rawText} />)

    const classics = screen.getByRole('region', { name: '周易原文' })
    expect(classics.getAttribute('data-collapsed')).toBe('true')
    const toggle = within(classics).getByRole('button', { name: '展开全部爻辞' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(classics.getAttribute('data-collapsed')).toBe('false')
    expect(within(classics).getByRole('button', { name: '收起其余爻辞' }).getAttribute('aria-expanded')).toBe('true')
  })
})
