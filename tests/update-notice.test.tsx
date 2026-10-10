// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_MIN_GAP_MS,
  UpdateNotice,
  useAppUpdate,
} from '@/components/UpdateNotice'
import { APP_VERSION, fetchLatestVersion } from '@/lib/app-version'

const TITLE = 'HEX//64 有新版本'
let now = 0

beforeEach(() => {
  now = 1_700_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Harness() {
  const update = useAppUpdate()
  return update.available ? <UpdateNotice onDismiss={update.dismiss} /> : null
}

function stubLatestVersion(version: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () => ({
    ok: true,
    json: async () => ({ version }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function returnToTab() {
  now += UPDATE_CHECK_MIN_GAP_MS
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('读取线上版本', () => {
  it('不走缓存地请求 version.json', async () => {
    const fetchMock = stubLatestVersion('build-b')

    expect(await fetchLatestVersion()).toBe('build-b')
    expect(fetchMock).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store' }))
  })

  it('请求失败、状态异常或内容不合法时返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchLatestVersion()).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ version: 'x' }) }))
    expect(await fetchLatestVersion()).toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    }))
    expect(await fetchLatestVersion()).toBeNull()

    stubLatestVersion(42)
    expect(await fetchLatestVersion()).toBeNull()
  })
})

describe('新版本提示', () => {
  it('回到旧标签页时发现新部署并提示刷新', async () => {
    const fetchMock = stubLatestVersion('build-b')
    render(<Harness />)

    expect(screen.queryByText(TITLE)).toBeNull()
    returnToTab()

    expect(await screen.findByText(TITLE)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('线上版本与当前一致时不提示', async () => {
    const fetchMock = stubLatestVersion(APP_VERSION)
    render(<Harness />)

    returnToTab()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await settle()

    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('刚加载或刚检查过时不重复请求', async () => {
    const fetchMock = stubLatestVersion(APP_VERSION)
    render(<Harness />)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(fetchMock).not.toHaveBeenCalled()

    returnToTab()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pageshow'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('标签页在后台时不请求，定时检查只在可见时进行', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const fetchMock = stubLatestVersion('build-b')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<Harness />)

    now += UPDATE_CHECK_INTERVAL_MS
    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    now += UPDATE_CHECK_INTERVAL_MS
    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    })
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText(TITLE)).toBeTruthy()
  })

  it('懒加载分块失败时立即检查，不受最短间隔限制', async () => {
    const fetchMock = stubLatestVersion('build-b')
    render(<Harness />)

    act(() => {
      window.dispatchEvent(new Event('vite:preloadError'))
    })

    expect(await screen.findByText(TITLE)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('选择稍后只忽略这一个版本，再有新部署会重新提示', async () => {
    let latest = 'build-b'
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ version: latest }),
    })))
    render(<Harness />)

    returnToTab()
    fireEvent.click(await screen.findByRole('button', { name: '稍后' }))
    expect(screen.queryByText(TITLE)).toBeNull()

    returnToTab()
    await settle()
    expect(screen.queryByText(TITLE)).toBeNull()

    latest = 'build-c'
    returnToTab()
    expect(await screen.findByText(TITLE)).toBeTruthy()
  })

  it('点击立即刷新会重新加载页面', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    stubLatestVersion('build-b')
    render(<Harness />)

    returnToTab()
    fireEvent.click(await screen.findByRole('button', { name: '立即刷新' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('卸载后不再监听或请求', async () => {
    const fetchMock = stubLatestVersion('build-b')
    const view = render(<Harness />)
    view.unmount()

    returnToTab()
    act(() => {
      window.dispatchEvent(new Event('vite:preloadError'))
    })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
