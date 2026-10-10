// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'

const SETTINGS_KEY = 'hex64.settings.v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function setup(animation: boolean) {
  const track = vi.fn()
  vi.stubGlobal('umami', { track })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ animation, timezone: 'Asia/Shanghai' }))
  sessionStorage.setItem('hex64.booted', '1')
  render(<App />)
  return track
}

// jsdom 没有布局，画布舞台不会创建：无论动画设置如何，都应一次点击直接排盘
describe.each([true, false])('没有画布舞台时（动画设置 %s）', (animation) => {
  it('电脑起卦一次点击生成排盘', async () => {
    const track = setup(animation)
    fireEvent.click(screen.getByRole('button', { name: /电脑起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '点击起卦' }))

    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(track).toHaveBeenCalledWith('点击生成排盘', { 起卦方式: '电脑起卦' })
    expect(track).toHaveBeenCalledWith('成功生成排盘', { 起卦方式: '电脑起卦' })
  })

  it('时间起卦一次点击生成排盘', async () => {
    const track = setup(animation)
    fireEvent.click(screen.getByRole('button', { name: /时间起卦/ }))
    fireEvent.click(screen.getByRole('button', { name: '点击以此刻起卦' }))

    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(track).toHaveBeenCalledWith('点击生成排盘', { 起卦方式: '时间起卦' })
  })

  it('数字起卦填数后才能推演', async () => {
    const track = setup(animation)
    fireEvent.click(screen.getByRole('button', { name: /数字起卦/ }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '先输入数字' }).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('第一个数'), { target: { value: '384' } })
    fireEvent.change(screen.getByLabelText('第二个数'), { target: { value: '27' } })
    // 有动画时算式与结果都留给罗盘揭晓；关闭动画则直接写全
    if (animation) {
      expect(screen.queryByText('384+27 = 411')).toBeNull()
      expect(screen.queryByText('地火明夷')).toBeNull()
    } else {
      expect(screen.getByText('384+27 = 411')).toBeTruthy()
      expect(screen.getByText('地火明夷')).toBeTruthy()
    }

    fireEvent.click(screen.getByRole('button', { name: '点击推演起卦' }))
    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(track).toHaveBeenCalledWith('点击生成排盘', { 起卦方式: '数字起卦' })
  })

  it('数字起卦在最后一格按回车起卦', async () => {
    setup(animation)
    fireEvent.click(screen.getByRole('button', { name: /数字起卦/ }))
    fireEvent.change(screen.getByLabelText('第一个数'), { target: { value: '7' } })
    fireEvent.keyDown(screen.getByLabelText('第一个数'), { key: 'Enter' })
    expect(window.location.pathname).toBe('/')

    fireEvent.keyDown(screen.getByLabelText('第三个数'), { key: 'Enter' })
    await waitFor(() => expect(window.location.pathname).toBe('/result'))
  })
})

describe('汉字起卦', () => {
  it('载入笔画资料并写下汉字后可以推演', async () => {
    const track = setup(false)
    fireEvent.click(screen.getByRole('button', { name: /汉字起卦/ }))
    const input = await screen.findByLabelText<HTMLInputElement>('用于起卦的汉字')
    await waitFor(() => expect(input.disabled).toBe(false), { timeout: 10_000 })

    fireEvent.change(input, { target: { value: '好运' } })
    expect(screen.getByText('好 6 画')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '点击推演起卦' }))

    await waitFor(() => expect(window.location.pathname).toBe('/result'))
    expect(track).toHaveBeenCalledWith('点击生成排盘', { 起卦方式: '汉字起卦' })
  }, 20_000)

  it('在输入框里按回车等同点击罗盘；输入法选字时的回车不算', async () => {
    setup(false)
    fireEvent.click(screen.getByRole('button', { name: /汉字起卦/ }))
    const input = await screen.findByLabelText<HTMLInputElement>('用于起卦的汉字')
    await waitFor(() => expect(input.disabled).toBe(false), { timeout: 10_000 })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(window.location.pathname).toBe('/')

    fireEvent.change(input, { target: { value: '明' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(window.location.pathname).toBe('/')

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(window.location.pathname).toBe('/result'))
  }, 20_000)
})
