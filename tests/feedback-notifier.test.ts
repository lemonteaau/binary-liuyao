import { describe, expect, it, vi } from 'vitest'

// @ts-expect-error Cloudflare Worker is deployed as plain JavaScript.
import worker from '../cloudflare/feedback-notifier.js'

const SUBMISSION_ID = '6cb56d6e-c7d8-4824-8ed4-b782e36d9f54'

function validRequest(overrides = {}) {
  return new Request('https://feedback-notifier.internal/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissionId: SUBMISSION_ID,
      message: '希望增加历史搜索功能。',
      source: 'about',
      ...overrides,
    }),
  })
}

function environment() {
  return {
    EMAIL: { send: vi.fn().mockResolvedValue({ messageId: 'test-message' }) },
    NOTIFICATION_TO: 'owner@example.com',
    NOTIFICATION_FROM: 'hex64@example.com',
  }
}

describe('feedback notification Worker', () => {
  it('拒绝非 POST 和无效反馈', async () => {
    const env = environment()
    expect((await worker.fetch(new Request('https://feedback-notifier.internal/'), env)).status).toBe(405)
    expect((await worker.fetch(validRequest({ message: 'x' }), env)).status).toBe(400)
    expect(env.EMAIL.send).not.toHaveBeenCalled()
  })

  it('向私有配置的地址发送纯文本通知', async () => {
    const env = environment()
    const response = await worker.fetch(validRequest({ source: 'invite' }), env)

    expect(response.status).toBe(200)
    expect(env.EMAIL.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      from: 'hex64@example.com',
      subject: 'HEX//64 收到新反馈 · 使用邀请',
      text: expect.stringContaining('希望增加历史搜索功能。'),
    }))
  })
})
