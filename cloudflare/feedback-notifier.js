const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SOURCES = new Set(['about', 'invite'])
const MAX_BODY_BYTES = 8_192
const MAX_MESSAGE_LENGTH = 1_200

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const declaredLength = Number(request.headers.get('Content-Length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return new Response('Request body too large', { status: 413 })
    }

    let feedback
    try {
      feedback = await request.json()
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const submissionId = feedback?.submissionId
    const message = typeof feedback?.message === 'string' ? feedback.message.trim() : ''
    const source = feedback?.source
    if (
      !UUID_V4_PATTERN.test(submissionId) ||
      message.length < 2 ||
      message.length > MAX_MESSAGE_LENGTH ||
      !SOURCES.has(source)
    ) {
      return new Response('Invalid feedback', { status: 400 })
    }

    const sourceLabel = source === 'invite' ? '使用邀请' : '关于页'
    const submittedAt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Australia/Adelaide',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date())

    await env.EMAIL.send({
      to: env.NOTIFICATION_TO,
      from: env.NOTIFICATION_FROM,
      subject: `HEX//64 收到新反馈 · ${sourceLabel}`,
      text: [
        'HEX//64 收到一条新的匿名反馈。',
        '',
        `入口：${sourceLabel}`,
        `时间：${submittedAt}`,
        `提交 ID：${submissionId}`,
        '',
        '反馈内容：',
        message,
      ].join('\n'),
    })

    return Response.json({ ok: true })
  },
}
