// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
  localStorage.setItem('hex64.settings.v1', JSON.stringify({ animation: false, timezone: 'Asia/Shanghai' }))
  render(<App />)
}

const readout = () => document.querySelector('.editor-readout')?.textContent

describe('手动排卦', () => {
  it('每爻四选一，卦名随选择即时更新', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /手动排卦/ }))
    expect(readout()).toBe('本卦乾为天')

    const pick = (line: string, choice: string) =>
      fireEvent.click(within(screen.getByRole('radiogroup', { name: line })).getByRole('radio', { name: choice }))
    pick('初爻', '老阴')
    pick('三爻', '少阴')
    pick('五爻', '老阳')

    expect(readout()).toBe('本卦天水讼之卦火泽睽')
    const first = within(screen.getByRole('radiogroup', { name: '初爻' }))
    expect(first.getByRole('radio', { name: '老阴' }).getAttribute('aria-checked')).toBe('true')
    expect(first.getByRole('radio', { name: '少阳' }).getAttribute('aria-checked')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: '生成排盘 →' }))
    await waitFor(() => expect(window.location.pathname).toBe('/result'))
  })
})

describe('卦名起卦', () => {
  it('方表列全六十四卦，按上卦、下卦排列', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /卦名起卦/ }))
    const table = screen.getByRole('table', { name: '六十四卦' })
    const cells = within(table).getAllByRole('button')
    expect(cells).toHaveLength(64)
    expect(cells.slice(0, 8).map((cell) => cell.getAttribute('aria-label'))).toEqual([
      '乾为天', '泽天夬', '火天大有', '雷天大壮', '风天小畜', '水天需', '山天大畜', '地天泰',
    ])
    expect(cells[63]!.getAttribute('aria-label')).toBe('坤为地')
  })

  it('点爻线只标动爻，不改变所选的本卦', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /卦名起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '水火既济' }))
    expect(readout()).toBe('本卦水火既济')

    fireEvent.click(screen.getByRole('button', { name: '初爻：静爻，点击切换' }))
    fireEvent.click(screen.getByRole('button', { name: '四爻：静爻，点击切换' }))
    expect(readout()).toBe('本卦水火既济之卦泽山咸')
    expect(screen.getByRole('button', { name: '水火既济' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '初爻：动爻，点击切换' }))
    expect(readout()).toBe('本卦水火既济之卦泽火革')
  })

  it('手机上改为上卦、下卦各点一次', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /卦名起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '上卦：坎（水）' }))
    fireEvent.click(screen.getByRole('button', { name: '下卦：离（火）' }))

    expect(readout()).toBe('本卦水火既济')
    expect(screen.getByRole('button', { name: '上卦：坎（水）' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '下卦：乾（天）' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(screen.getByRole('group', { name: '上卦' })).getAllByRole('button')).toHaveLength(8)
  })

  it('手机上的检索结果按文王序列出全部命中', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /卦名起卦/ }))
    fireEvent.change(screen.getByLabelText('按卦名或文王序号检索'), { target: { value: '大' } })

    const results = within(screen.getByRole('list', { name: '检索结果' })).getAllByRole('button')
    expect(results.map((item) => item.textContent)).toEqual([
      '火天大有第 14 卦', '山天大畜第 26 卦', '泽风大过第 28 卦', '雷天大壮第 34 卦',
    ])
    fireEvent.click(results[2]!)
    expect(readout()).toBe('本卦泽风大过')
  })

  it('检索时方表仍然完整，未命中的变暗；回车选中第一个命中', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /卦名起卦/ }))
    const input = screen.getByLabelText('按卦名或文王序号检索')

    fireEvent.change(input, { target: { value: '中孚' } })
    const table = screen.getByRole('table', { name: '六十四卦' })
    expect(within(table).getAllByRole('button')).toHaveLength(64)
    expect(screen.getByRole('button', { name: '风泽中孚' }).dataset.dim).toBe('false')
    expect(screen.getByRole('button', { name: '乾为天' }).dataset.dim).toBe('true')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(readout()).toBe('本卦风泽中孚')

    fireEvent.change(input, { target: { value: '不存在' } })
    expect(screen.getByRole('alert').textContent).toBe('未找到匹配卦象')
  })
})
