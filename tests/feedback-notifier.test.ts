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
    const mail = env.EMAIL.send.mock.calls[0]?.[0]
    expect(mail.text).not.toContain('联系方式')
    expect(mail).not.toHaveProperty('replyTo')
  })

  it('留了邮箱时写入正文并设为 Reply-To', async () => {
    const env = environment()
    await worker.fetch(validRequest({ contact: 'reader@example.com' }), env)

    const mail = env.EMAIL.send.mock.calls[0]?.[0]
    expect(mail.subject).toBe('HEX//64 收到新反馈 · 关于页 · 留了联系方式')
    expect(mail.replyTo).toBe('reader@example.com')
    expect(mail.text).toContain('联系方式：reader@example.com（直接回复这封邮件即可）')
  })

  it('非邮箱联系方式只写入正文，不设 Reply-To', async () => {
    const env = environment()
    await worker.fetch(validRequest({ contact: '微信 wxid_hex64\nBcc: x@example.com' }), env)

    const mail = env.EMAIL.send.mock.calls[0]?.[0]
    expect(mail).not.toHaveProperty('replyTo')
    expect(mail.text).toContain('联系方式：微信 wxid_hex64 Bcc: x@example.com\n')
  })
})
