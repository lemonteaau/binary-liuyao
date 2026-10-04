// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { generateChart } from '@/engine'
import { formatRawText } from '@/formatters/rawText'
import { ResultPage } from '@/pages/ResultPage'
import { ReadingProvider } from '@/store/reading'
import type { ReadingRecord } from '@/store/reading'
import { SettingsProvider } from '@/store/settings'

const CURRENT_KEY = 'hex64.current.v1'
const SETTINGS_KEY = 'hex64.settings.v1'
const PROMPT = '请根据以上六爻排盘进行分析，要分析的问题是：'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function storeReading(rawLines: ReadingRecord['rawLines'], notes: Partial<ReadingRecord> = {}) {
  const record: ReadingRecord = {
    id: 'AAAAAA',
    rawLines,
    chart: generateChart({
      inputMethod: 'manual',
      rawLines,
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    }),
    ...notes,
  }
  localStorage.setItem(CURRENT_KEY, JSON.stringify(record))
  return record
}

function renderResult() {
  return render(
    <SettingsProvider>
      <ReadingProvider>
        <MemoryRouter initialEntries={['/result']}>
          <Routes>
            <Route path="/result" element={<ResultPage />} />
          </Routes>
        </MemoryRouter>
      </ReadingProvider>
    </SettingsProvider>,
  )
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

describe('复制排盘附上所问', () => {
  const chart = generateChart({
    inputMethod: 'manual',
    rawLines: [6, 9, 8, 8, 7, 8],
    when: new Date('2026-08-24T14:42:37+08:00'),
    timezone: 'Asia/Shanghai',
  })

  it('提示词以冒号结尾时，问题接在冒号后', () => {
    const text = formatRawText(chart, {
      includeAiInstruction: true,
      aiInstructionPrompt: PROMPT,
      question: '  面试\n能否通过  ',
    })
    expect(text.endsWith(`${PROMPT}面试 能否通过`)).toBe(true)
    expect(text).not.toContain('所问之事：')
  })

  it('没有以冒号结尾的提示词时，问题放在第一行', () => {
    const text = formatRawText(chart, {
      includeAiInstruction: true,
      aiInstructionPrompt: '请分析。',
      question: '面试能否通过',
    })
    expect(text.startsWith('所问之事：面试能否通过\n\n起卦方式：')).toBe(true)
    expect(text.endsWith('请分析。')).toBe(true)
    expect(formatRawText(chart, { includeAiInstruction: false, question: '面试能否通过' }))
      .toMatch(/^所问之事：面试能否通过/)
  })

  it('问题为空时输出与不附带时一致', () => {
    const plain = formatRawText(chart, { includeAiInstruction: true, aiInstructionPrompt: PROMPT })
    expect(formatRawText(chart, {
      includeAiInstruction: true,
      aiInstructionPrompt: PROMPT,
      question: '   ',
    })).toBe(plain)
  })
})

describe('结果页布局', () => {
  it('所问与操作排在完整排盘之前，页尾不再有单独的操作面板', () => {
    storeReading([6, 9, 8, 8, 7, 8], { question: '面试能否通过' })
    renderResult()

    const question = screen.getByLabelText('所问何事') as HTMLInputElement
    expect(question.value).toBe('面试能否通过')
    const fullReading = screen.getByRole('region', { name: '结构化六爻排盘' })
    expect(question.compareDocumentPosition(fullReading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const toolbar = screen.getByRole('region', { name: '所问与操作' })
    for (const name of ['复制排盘', '导出分享图', '复制链接', '修改排盘', '再起一卦']) {
      expect(within(toolbar).getByRole('button', { name })).toBeTruthy()
    }
    expect(within(toolbar).getByRole('link', { name: '历史记录' })).toBeTruthy()
    expect(within(toolbar).getByRole('link', { name: '编辑提示词 →' }).getAttribute('href')).toBe('/settings')

    // 应验记录留在页尾，所问不再重复出现
    const outcome = screen.getByRole('textbox', { name: '应验记录' })
    expect(fullReading.compareDocumentPosition(outcome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByLabelText('所问何事')).toHaveLength(1)
    expect(screen.queryByText(/上方「复制排盘」/)).toBeNull()
  })

  it('摘要标出翻转的二进制位，静卦时说明不生变卦', () => {
    storeReading([7, 7, 7, 7, 7, 7])
    renderResult()

    const summary = screen.getByRole('region', { name: '本卦' })
    expect(within(summary).getByText('六爻安静')).toBeTruthy()
    expect(within(summary).queryByText('变卦')).toBeNull()
    expect(summary.querySelectorAll('[data-changed="true"]')).toHaveLength(0)
  })

  it('有动爻时两卦的翻转位都被标出', () => {
    storeReading([6, 9, 8, 8, 7, 8])
    renderResult()

    const summary = screen.getByRole('region', { name: '本卦与变卦' })
    const changed = summary.querySelectorAll('[data-changed="true"]')
    // 初爻、二爻动：两卦各标两位
    expect(changed).toHaveLength(4)
    expect(within(summary).getByLabelText('动爻标记 000011')).toBeTruthy()
  })

  it('勾选附上所问后，复制的文本把问题接在提示词冒号后', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiInstruction: true, aiInstructionPrompt: PROMPT }))
    storeReading([6, 9, 8, 8, 7, 8])
    const writeText = mockClipboard()
    const track = vi.fn()
    vi.stubGlobal('umami', { track })
    renderResult()

    fireEvent.change(screen.getByLabelText('所问何事'), { target: { value: '面试能否通过' } })
    const includeQuestion = screen.getByRole('checkbox', { name: '所问' }) as HTMLInputElement
    expect(includeQuestion.checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'AI 指令' }) as HTMLInputElement).checked).toBe(true)

    const copyButton = screen.getByRole('button', { name: '复制排盘' })
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]![0]).toMatch(new RegExp(`${PROMPT}$`))

    fireEvent.click(includeQuestion)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).includeQuestion).toBe(true)
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText.mock.calls[1]![0]).toMatch(new RegExp(`${PROMPT}面试能否通过$`))
    expect(track).toHaveBeenLastCalledWith('成功复制排盘', { 是否包含AI指令: true, 是否包含所问: true })
  })

  it('在结果页取消 AI 指令会同步到设置', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiInstruction: true, aiInstructionPrompt: PROMPT }))
    storeReading([6, 9, 8, 8, 7, 8])
    renderResult()

    fireEvent.click(screen.getByRole('checkbox', { name: 'AI 指令' }))
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).aiInstruction).toBe(false)
  })
})
