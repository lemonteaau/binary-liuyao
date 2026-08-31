import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error Cloudflare Pages Functions are deployed as plain JavaScript.
import { onRequest, parseSubmission } from '../functions/api/feedback.js'

const SUBMISSION_ID = '6cb56d6e-c7d8-4824-8ed4-b782e36d9f54'
const API_URL = 'https://liuyao.lemontea.xyz/api/feedback'

interface DbOptions {
  existing?: { found: number } | null
  activity?: {
    minute_count: number
    hour_count: number
    day_count: number
  }
}

function createDb({
  existing = null,
  activity = { minute_count: 0, hour_count: 0, day_count: 0 },
}: DbOptions = {}) {
  const inserted: unknown[][] = []
  const prepare = vi.fn((sql: string) => {
    let args: unknown[] = []
    const statement = {
      bind: vi.fn((...values: unknown[]) => {
        args = values
        return statement
      }),
      first: vi.fn(async () => {
        if (sql.includes('SELECT 1 AS found')) return existing
        if (sql.includes('COUNT(CASE')) return activity
        return null
      }),
      run: vi.fn(async () => {
        if (sql.includes('INSERT OR IGNORE')) inserted.push(args)
        return { success: true }
      }),
    }
    return statement
  })

  return { inserted, prepare }
}

function request(
  body: string = JSON.stringify({
    submissionId: SUBMISSION_ID,
    message: '希望历史记录可以搜索。',
    source: 'about',
  }),
  headers: Record<string, string> = {},
  method = 'POST',
) {
  return new Request(API_URL, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://liuyao.lemontea.xyz',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    body: method === 'POST' ? body : undefined,
  })
}

async function callApi(
  req: Request,
  db = createDb(),
  env = {},
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  return onRequest({ request: req, env: { DB: db, ...env }, waitUntil }) as Promise<Response>
}

describe('feedback API', () => {
  it('只接受规范、非空且长度受限的匿名反馈', () => {
    expect(parseSubmission({
      submissionId: SUBMISSION_ID,
      message: '  两个字  ',
      source: 'about',
    })).toEqual({
      submissionId: SUBMISSION_ID,
      message: '两个字',
      source: 'about',
    })
    expect(parseSubmission({ submissionId: 'bad-id', message: '反馈', source: 'about' })).toBeNull()
    expect(parseSubmission({ submissionId: SUBMISSION_ID, message: 'x', source: 'about' })).toBeNull()
    expect(parseSubmission({ submissionId: SUBMISSION_ID, message: '反馈', source: 'unknown' })).toBeNull()
  })

  it('拒绝非 POST、跨域和非 JSON 请求', async () => {
    expect((await callApi(request('', {}, 'GET'))).status).toBe(405)
    expect((await callApi(request(undefined, {
      Origin: 'https://attacker.example',
      'Sec-Fetch-Site': 'cross-site',
    }))).status).toBe(403)
    expect((await callApi(request('feedback=x', { 'Content-Type': 'text/plain' }))).status).toBe(415)
  })

  it('拒绝格式错误和超大请求体', async () => {
    expect((await callApi(request('{'))).status).toBe(400)
    expect((await callApi(request('x'.repeat(8_193)))).status).toBe(413)
  })

  it('重复 submissionId 直接返回成功，不重复写入', async () => {
    const db = createDb({ existing: { found: 1 } })
    const response = await callApi(request(), db)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(db.inserted).toHaveLength(0)
    expect(db.prepare).toHaveBeenCalledTimes(1)
  })

  it('达到熔断阈值时暂时拒收新反馈', async () => {
    const db = createDb({
      activity: { minute_count: 15, hour_count: 15, day_count: 15 },
    })
    const response = await callApi(request(), db)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(db.inserted).toHaveLength(0)
  })

  it('将清理后的反馈写入 D1', async () => {
    const db = createDb()
    const response = await callApi(request(JSON.stringify({
      submissionId: SUBMISSION_ID,
      message: '  希望增加导出功能。  ',
      source: 'invite',
    })), db)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(db.inserted).toEqual([[
      SUBMISSION_ID,
      '希望增加导出功能。',
      'invite',
    ]])
  })

  it('写入成功后异步通知邮件 Worker，不让邮件结果阻塞提交响应', async () => {
    const db = createDb()
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    const backgroundTasks: Promise<unknown>[] = []
    const response = await callApi(
      request(),
      db,
      { FEEDBACK_NOTIFIER: { fetch } },
      (promise) => backgroundTasks.push(promise),
    )

    expect(response.status).toBe(201)
    expect(backgroundTasks).toHaveLength(1)
    await Promise.all(backgroundTasks)
    expect(fetch).toHaveBeenCalledWith(
      'https://feedback-notifier.internal/notify',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
