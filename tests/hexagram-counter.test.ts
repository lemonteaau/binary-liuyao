import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimHexagramOrdinal } from '@/lib/hexagram-counter'

describe('hexagram counter client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('rejects an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ordinal: 0 }), { status: 200 }),
    ))

    await expect(claimHexagramOrdinal('6cb56d6e-c7d8-4824-8ed4-b782e36d9f54')).rejects.toThrow(
      'invalid ordinal',
    )
  })
})
