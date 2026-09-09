// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimHexagramOrdinal,
  getCurrentHexagramOrdinal,
  shouldClaimHexagramOrdinal,
} from '@/lib/hexagram-counter'

describe('hexagram counter client', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('短时间第十次排盘起暂停登记，并在 24 小时后恢复', () => {
    const start = new Date('2026-09-10T10:00:00Z').getTime()

    for (let index = 0; index < 9; index += 1) {
      expect(shouldClaimHexagramOrdinal(start + index * 1_000)).toBe(true)
    }
    expect(shouldClaimHexagramOrdinal(start + 9_000)).toBe(false)
    expect(shouldClaimHexagramOrdinal(start + 10 * 60 * 1_000)).toBe(false)
    expect(shouldClaimHexagramOrdinal(start + 24 * 60 * 60 * 1_000 + 9_000)).toBe(true)
  })

  it('较慢的排盘不会累计触发暂停', () => {
    const start = new Date('2026-09-10T10:00:00Z').getTime()

    for (let index = 0; index < 20; index += 1) {
      expect(shouldClaimHexagramOrdinal(start + index * 3 * 60 * 1_000)).toBe(true)
    }
  })

  it('本地状态损坏时放行登记并重新开始记录', () => {
    localStorage.setItem('hex64.counter-guard.v1', '{invalid')

    expect(shouldClaimHexagramOrdinal()).toBe(true)
  })

  it('claims and returns an ordinal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ordinal: 167 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(claimHexagramOrdinal('6cb56d6e-c7d8-4824-8ed4-b782e36d9f54')).resolves.toBe(167)
    expect(fetchMock).toHaveBeenCalledWith('/api/hexagram-count', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ eventId: '6cb56d6e-c7d8-4824-8ed4-b782e36d9f54' }),
    }))
  })

  it('reads the current ordinal without claiming a new one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ordinal: 169 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentHexagramOrdinal()).resolves.toBe(169)
    expect(fetchMock).toHaveBeenCalledWith('/api/hexagram-count', {
      method: 'GET',
      signal: undefined,
    })
  })

  it('rejects an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ordinal: 0 }), { status: 200 }),
    ))

    await expect(claimHexagramOrdinal('6cb56d6e-c7d8-4824-8ed4-b782e36d9f54')).rejects.toThrow(
      'invalid ordinal',
    )
  })
})
