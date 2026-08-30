import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error Cloudflare Pages Functions are deployed as plain JavaScript.
import { isValidEventId, onRequest } from '../functions/api/hexagram-count.js'

const EVENT_ID = '6cb56d6e-c7d8-4824-8ed4-b782e36d9f54'
const API_URL = 'https://liuyao.lemontea.xyz/api/hexagram-count'

interface DbOptions {
  existing?: { ordinal: number } | null
  activity?: {
    minute_count: number
    hour_count: number
    day_count: number
  }
  current?: number
  claimed?: number
}

function createDb({
  existing = null,
  activity = { minute_count: 0, hour_count: 0, day_count: 0 },
  current = 229,
  claimed = 230,
}: DbOptions = {}) {
  const batch = vi.fn(async () => [{}, {}, { results: [{ ordinal: claimed }] }])
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(() => statement),
      first: vi.fn(async () => {
        if (sql.includes('SELECT value AS ordinal')) return { ordinal: current }
        if (sql.includes('COUNT(CASE')) return activity
        if (sql.includes('SELECT ordinal FROM hexagram_counter_events')) return existing
        return null
      }),
    }
    return statement
  })

  return { batch, prepare }
}

function postRequest(
  body: string = JSON.stringify({ eventId: EVENT_ID }),
  headers: Record<string, string> = {},
) {
  return new Request(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://liuyao.lemontea.xyz',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    body,
  })
}

async function callApi(request: Request, db = createDb(), env = {}) {
  return onRequest({ request, env: { DB: db, ...env } }) as Promise<Response>
}

describe('hexagram counter API', () => {
  it('returns the current count without creating an event', async () => {
    const db = createDb({ current: 241 })
    const response = await callApi(new Request(API_URL), db)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ordinal: 241 })
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('accepts only canonical UUID v4 event IDs', () => {
    expect(isValidEventId(EVENT_ID)).toBe(true)
    expect(isValidEventId('------------------------------------')).toBe(false)
    expect(isValidEventId('6cb56d6e-c7d8-1824-8ed4-b782e36d9f54')).toBe(false)
  })

  it('rejects cross-origin browser requests', async () => {
    const db = createDb()
    const response = await callApi(
      postRequest(undefined, {
        Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site',
      }),
      db,
    )

    expect(response.status).toBe(403)
    expect(db.prepare).not.toHaveBeenCalled()
  })

  it('requires JSON and rejects oversized bodies', async () => {
    const textResponse = await callApi(
      postRequest('eventId=x', { 'Content-Type': 'text/plain' }),
    )
    expect(textResponse.status).toBe(415)

    const oversizedResponse = await callApi(postRequest('x'.repeat(513)))
    expect(oversizedResponse.status).toBe(413)
  })

  it('returns an existing event without consuming the guard', async () => {
    const db = createDb({ existing: { ordinal: 203 } })
    const response = await callApi(postRequest(), db)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ordinal: 203 })
    expect(db.batch).not.toHaveBeenCalled()
    expect(db.prepare).toHaveBeenCalledTimes(1)
  })

  it('stops issuing new ordinals when the circuit breaker trips', async () => {
    const db = createDb({
      activity: { minute_count: 30, hour_count: 30, day_count: 30 },
    })
    const response = await callApi(postRequest(), db)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('claims a new ordinal below the configured limits', async () => {
    const db = createDb({ claimed: 230 })
    const response = await callApi(postRequest(), db)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ordinal: 230 })
    expect(db.batch).toHaveBeenCalledOnce()
  })
})
