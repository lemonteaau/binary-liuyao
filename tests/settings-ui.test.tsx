// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
