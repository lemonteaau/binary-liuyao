// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { detectTimezoneDetail } from '@/calendar/solar-lunar'
import { TimezonePicker } from '@/components/TimezonePicker'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/pages/SettingsPage'
import { SettingsProvider } from '@/store/settings'

const STORAGE_KEY = 'hex64.settings.v1'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

function reportTimezone(timeZone: string | undefined) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone,
  } as Intl.ResolvedDateTimeFormatOptions)
}

describe('自动检测时区', () => {
  it.each(['UTC', 'Etc/UTC', 'GMT', ''])('浏览器报 %j 时按北京时间', (reported) => {
    reportTimezone(reported)
    expect(detectTimezoneDetail()).toEqual({ timezone: 'Asia/Shanghai', fellBack: true })
  })

  it('浏览器报香港、台北时并入北京时间', () => {
    reportTimezone('Asia/Taipei')
    expect(detectTimezoneDetail()).toEqual({ timezone: 'Asia/Shanghai', fellBack: false })
  })

  it('真实的地区时区照用，包括零时区的伦敦', () => {
    reportTimezone('Europe/London')
    expect(detectTimezoneDetail()).toEqual({ timezone: 'Europe/London', fellBack: false })
  })
})

function renderPicker(value = 'auto', fellBack = false) {
  const onChange = vi.fn()
  render(<TimezonePicker value={value} detected="Australia/Adelaide" fellBack={fellBack} onChange={onChange} />)
  return onChange
}

describe('时区选择器', () => {
  it('常用时区置顶，分隔线下是全部时区', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /^时区：自动/ }))

    const common = within(screen.getByRole('group', { name: '常用' })).getAllByRole('option')
    const titles = common.map((option) => option.querySelector('.tz-picker-title')?.textContent)
    expect(titles.slice(0, 3)).toEqual(['自动', '北京时间', '新加坡时间'])
    expect(common[0]!.getAttribute('aria-selected')).toBe('true')
    expect(common[1]!.textContent).toContain('中国大陆及港澳台通用 · UTC+08:00')
    expect(screen.getByRole('separator')).toBeTruthy()

    const all = within(screen.getByRole('group', { name: '全部时区' })).getAllByRole('option')
    const texts = all.map((option) => option.textContent ?? '')
    expect(texts.some((text) => text.includes('Australia/Adelaide'))).toBe(true)
    // 常用里有的不在下面重复；与北京时间相同的时区已并入北京时间
    for (const merged of ['Asia/Shanghai', 'Asia/Hong Kong', 'Asia/Macau', 'Asia/Taipei']) {
      expect(texts.some((text) => text.includes(merged))).toBe(false)
    }
    expect(texts.join('')).not.toMatch(/香港|澳门|台北|台湾/)
  })

  it('可按城市、IANA 名或偏移搜索，点选后关闭', () => {
    const onChange = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /^时区/ }))
    const search = screen.getByRole('combobox', { name: '搜索时区' })

    fireEvent.change(search, { target: { value: '东京' } })
    let options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toContain('东京时间')

    fireEvent.change(search, { target: { value: '+8' } })
    options = screen.getAllByRole('option')
    expect(options.some((option) => option.textContent?.includes('北京时间'))).toBe(true)
    expect(options.every((option) => option.textContent?.includes('UTC+08:00'))).toBe(true)

    fireEvent.change(search, { target: { value: 'UTC-5' } })
    expect(screen.getAllByRole('option').every((option) => /UTC-05:00/.test(option.textContent ?? ''))).toBe(true)

    fireEvent.change(search, { target: { value: 'adelaide' } })
    fireEvent.click(screen.getByRole('option', { name: /Australia\/Adelaide/ }))
    expect(onChange).toHaveBeenCalledWith('Australia/Adelaide')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('键盘上下移动、回车选择、Esc 关闭', () => {
    const onChange = renderPicker()
    const trigger = screen.getByRole('button', { name: /^时区/ })
    fireEvent.click(trigger)
    const list = screen.getByRole('listbox')

    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Asia/Shanghai')

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it.each(['香港', '台北', '澳门'])('搜 %s 得到北京时间', (query) => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /^时区/ }))
    fireEvent.change(screen.getByRole('combobox', { name: '搜索时区' }), { target: { value: query } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toContain('北京时间')
  })

  it('浏览器未提供时区时，自动一项写明按北京时间', () => {
    renderPicker('auto', true)
    expect(screen.getByRole('button', { name: /^时区/ }).textContent).toContain('浏览器未提供时区，按北京时间')
  })

  it('点外面关闭', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /^时区/ }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('设置页时区', () => {
  it('选择后保存到设置', () => {
    render(
      <MemoryRouter>
        <SettingsProvider>
          <SettingsPage />
        </SettingsProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^时区/ }))
    fireEvent.change(screen.getByRole('combobox', { name: '搜索时区' }), { target: { value: '东京' } })
    fireEvent.click(screen.getByRole('option', { name: /东京时间/ }))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { timezone?: string }
    expect(stored.timezone).toBe('Asia/Tokyo')
    expect(screen.getByRole('button', { name: '时区：东京时间' })).toBeTruthy()
  })

  it.each(['Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Macau'])('旧设置里的 %s 并入北京时间', async (timezone) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timezone }))
    render(
      <MemoryRouter>
        <SettingsProvider>
          <SettingsPage />
        </SettingsProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: '时区：北京时间' })).toBeTruthy()
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { timezone?: string }
      expect(stored.timezone).toBe('Asia/Shanghai')
    })
  })
})
