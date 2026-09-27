// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { generateChart } from '@/engine'
import { formatRawText, RAW_TEXT_SOURCE_LINE } from '@/formatters/rawText'
import { mergeHistory, parseHistoryBackup, serializeHistoryBackup } from '@/lib/history-backup'
import { isReadingRecord } from '@/lib/reading-storage'
import { HistoryPage } from '@/pages/HistoryPage'
import { ReadingProvider, useReading } from '@/store/reading'
import type { ReadingRecord } from '@/store/reading'

const HISTORY_KEY = 'hex64.history.v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

function record(id: string, when = '2026-09-01T10:00:00+08:00', notes: Partial<ReadingRecord> = {}): ReadingRecord {
  const rawLines = [6, 9, 8, 8, 7, 8] as ReadingRecord['rawLines']
  return {
    id,
    rawLines,
    chart: generateChart({ inputMethod: 'manual', rawLines, when: new Date(when), timezone: 'Asia/Shanghai' }),
    ...notes,
  }
}

describe('排盘备注校验', () => {
  it('接受字符串备注，拒绝非字符串或超长备注', () => {
    expect(isReadingRecord({ ...record('A1B2C3'), question: '面试', outcome: '已通过' })).toBe(true)
    expect(isReadingRecord({ ...record('A1B2C3'), question: 42 })).toBe(false)
    expect(isReadingRecord({ ...record('A1B2C3'), outcome: 'x'.repeat(5000) })).toBe(false)
  })
})

describe('历史备份', () => {
  it('导出后可原样导入，并跳过无效条目', () => {
    const records = [record('AAAAAA', undefined, { question: '问事' }), record('BBBBBB')]
    const text = serializeHistoryBackup(records)
    expect(parseHistoryBackup(text)).toEqual({ records: JSON.parse(JSON.stringify(records)), skipped: 0 })

    const withJunk = JSON.stringify({ format: 'hex64-history', version: 1, records: [...records, {}, null] })
    expect(parseHistoryBackup(withJunk)?.skipped).toBe(2)
  })

  it('拒绝无法识别的文件', () => {
    expect(parseHistoryBackup('not json')).toBeNull()
    expect(parseHistoryBackup('{"records":[]}')).toBeNull()
  })

  it('合并时本地备注优先，缺失时从备份补齐，并按起卦时间倒序截断', () => {
    const local = [record('AAAAAA', '2026-09-02T10:00:00+08:00', { question: '本地' })]
    const imported = [
      record('AAAAAA', '2026-09-02T10:00:00+08:00', { question: '备份', outcome: '应验' }),
      record('BBBBBB', '2026-09-03T10:00:00+08:00'),
      record('CCCCCC', '2026-09-01T10:00:00+08:00'),
    ]
    const merged = mergeHistory(local, imported, 2)
    expect(merged.added).toBe(2)
    expect(merged.records.map((r) => r.id)).toEqual(['BBBBBB', 'AAAAAA'])
    expect(merged.records[1]).toMatchObject({ question: '本地', outcome: '应验' })
  })
})

describe('复制排盘来源', () => {
  it('开启时在卦爻后、AI 指令前附上来源', () => {
    const chart = record('AAAAAA').chart
    const text = formatRawText(chart, {
      includeAiInstruction: true,
      aiInstructionPrompt: '请分析。',
      includeSource: true,
    })
    expect(RAW_TEXT_SOURCE_LINE).toContain('liuyao.lemontea.xyz')
    expect(text).toContain(RAW_TEXT_SOURCE_LINE)
    expect(text.indexOf(RAW_TEXT_SOURCE_LINE)).toBeLessThan(text.indexOf('请分析。'))
    expect(formatRawText(chart, { includeAiInstruction: false })).not.toContain(RAW_TEXT_SOURCE_LINE)
  })
})

function NotesProbe() {
  const { current, history, commitReading, updateNotes } = useReading()
  return (
    <div>
      <output aria-label="状态">{JSON.stringify({ current, history })}</output>
      <button type="button" onClick={() => updateNotes('AAAAAA', { question: '  ', outcome: '已应验' })}>
        写备注
      </button>
      <button
        type="button"
        onClick={() => {
          const reading = record('AAAAAA')
          commitReading(reading.chart, reading.rawLines, { fromShareLink: true, readingId: 'AAAAAA' })
        }}
      >
        重开链接
      </button>
    </div>
  )
}

describe('排盘备注存储', () => {
  it('备注写入当前与历史，重新打开同一分享链接时保留', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([record('AAAAAA', undefined, { question: '旧问题' })]))
    render(<ReadingProvider><NotesProbe /></ReadingProvider>)

    fireEvent.click(screen.getByText('写备注'))
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
    expect(stored[0].outcome).toBe('已应验')
    // 按输入原样保存，展示时再忽略纯空白
    expect(stored[0].question).toBe('  ')

    fireEvent.click(screen.getByText('重开链接'))
    const state = JSON.parse(screen.getByLabelText('状态').textContent!)
    expect(state.current.outcome).toBe('已应验')
    expect(state.history).toHaveLength(1)
  })
})

describe('历史页', () => {
  function renderHistory() {
    return render(
      <ReadingProvider>
        <MemoryRouter initialEntries={['/history']}>
          <Routes>
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/result" element={<ResultProbe />} />
          </Routes>
        </MemoryRouter>
      </ReadingProvider>,
    )
  }

  function ResultProbe() {
    const { current } = useReading()
    return <p>结果页 {current?.id}</p>
  }

  it('无记录时显示空状态，导出不可用', () => {
    renderHistory()
    expect(screen.getByText('还没有排盘记录。')).toBeTruthy()
    expect((screen.getByText('[ 导出备份 ]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('列出记录并打开到结果页', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      record('AAAAAA', undefined, { question: '面试能否通过', outcome: '通过' }),
      record('BBBBBB'),
    ]))
    renderHistory()
    expect(screen.getByText('面试能否通过')).toBeTruthy()
    expect(screen.getByText('未记录所问之事')).toBeTruthy()
    expect(screen.getAllByText('已记应验')).toHaveLength(1)

    fireEvent.click(screen.getByText('面试能否通过'))
    expect(screen.getByText('结果页 AAAAAA')).toBeTruthy()
  })

  it('删除需要二次确认', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([record('AAAAAA'), record('BBBBBB')]))
    renderHistory()
    fireEvent.click(screen.getByLabelText('删除排盘 AAAAAA'))
    fireEvent.click(screen.getByText('取消'))
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('删除排盘 AAAAAA'))
    fireEvent.click(screen.getByText('确认删除'))
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
    expect(stored.map((r: ReadingRecord) => r.id)).toEqual(['BBBBBB'])
  })

  it('导入备份后合并并提示条数', async () => {
    renderHistory()
    const backup = serializeHistoryBackup([record('AAAAAA'), record('BBBBBB')])
    const file = new File([backup], 'backup.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('已导入 2 条新记录。')).toBeTruthy())
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(2)
  })
})
