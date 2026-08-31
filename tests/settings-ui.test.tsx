// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CrtFx } from '@/App'
import { SettingsPage } from '@/pages/SettingsPage'
import { SettingsProvider, useSettings } from '@/store/settings'

const STORAGE_KEY = 'hex64.settings.v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.fontSize
  delete document.documentElement.dataset.motion
  delete document.documentElement.dataset.screenFx
})

function SettingsProbe() {
  const { settings, setFontSize } = useSettings()

  return (
    <div>
      <output aria-label="当前字号">{settings.fontSize}</output>
      <button type="button" onClick={() => setFontSize('small')}>
        使用小字号
      </button>
    </div>
  )
}

describe('SettingsProvider 字号设置', () => {
  it('默认使用标准字号，并同步到根节点和本地存储', async () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    )

    expect(screen.getByLabelText('当前字号').textContent).toBe('standard')
    expect(document.documentElement.dataset.fontSize).toBe('standard')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { fontSize?: string }
      expect(stored.fontSize).toBe('standard')
    })
  })

  it('旧版设置缺少字号时回退为标准字号', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timezone: 'UTC', animation: false }))

    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    )

    expect(screen.getByLabelText('当前字号').textContent).toBe('standard')
    expect(document.documentElement.dataset.fontSize).toBe('standard')
  })

  it('切换字号后立即应用、持久化，并在重新挂载时恢复', async () => {
    const firstRender = render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '使用小字号' }))

    expect(screen.getByLabelText('当前字号').textContent).toBe('small')
    expect(document.documentElement.dataset.fontSize).toBe('small')

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { fontSize?: string }
      expect(stored.fontSize).toBe('small')
    })

    firstRender.unmount()
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>,
    )

    expect(screen.getByLabelText('当前字号').textContent).toBe('small')
    expect(document.documentElement.dataset.fontSize).toBe('small')
  })
})

describe('动效设置', () => {
  it('关闭动效时立即移除动态 CRT 光带，但保留静态扫描线', () => {
    const { container } = render(
      <SettingsProvider>
        <CrtFx />
        <SettingsPage />
      </SettingsProvider>,
    )

    expect(container.querySelector('.fx-roll')).toBeTruthy()
    expect(container.querySelector('.fx-flicker')).toBeTruthy()
    expect(container.querySelector('.fx-scanlines')).toBeTruthy()

    const animationControls = screen.getByRole('group', { name: '动画开关' })
    fireEvent.click(within(animationControls).getByRole('button', { name: '关' }))

    expect(container.querySelector('.fx-roll')).toBeNull()
    expect(container.querySelector('.fx-flicker')).toBeNull()
    expect(container.querySelector('.fx-scanlines')).toBeTruthy()
  })
})
