const MAX_BODY_BYTES = 8_192
const MAX_MESSAGE_LENGTH = 1_200
const SOURCES = new Set(['about', 'invite'])
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_LIMITS = {
  minute: 15,
  hour: 100,
  day: 500,
}
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' })
  }

  if (!isAllowedRequestOrigin(request, env.FEEDBACK_ALLOWED_ORIGINS)) {
    return json({ error: 'Forbidden origin' }, 403)
  }

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415)
  }

  let submission
  try {
    submission = parseSubmission(JSON.parse(await readBody(request, MAX_BODY_BYTES)))
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return json({ error: 'Request body too large' }, 413)
    }
    return json({ error: 'Invalid feedback' }, 400)
  }

  if (!submission) {
    return json({ error: 'Invalid feedback' }, 400)
  }

  const existing = await env.DB.prepare(
    'SELECT 1 AS found FROM feedback_submissions WHERE submission_id = ?1',
  )
    .bind(submission.submissionId)
    .first()

  if (existing) return json({ ok: true })

  const activity = await env.DB.prepare(`
    SELECT
      COUNT(CASE WHEN created_at >= datetime('now', '-1 minute') THEN 1 END) AS minute_count,
      COUNT(CASE WHEN created_at >= datetime('now', '-1 hour') THEN 1 END) AS hour_count,
      COUNT(*) AS day_count
    FROM feedback_submissions
    WHERE created_at >= datetime('now', '-1 day')
  `).first()
  const limits = readFeedbackLimits(env)

  if (
    Number(activity?.minute_count ?? 0) >= limits.minute ||
    Number(activity?.hour_count ?? 0) >= limits.hour ||
    Number(activity?.day_count ?? 0) >= limits.day
  ) {
    return json(
      { error: 'Feedback temporarily rate limited' },
      429,
      { 'Retry-After': '60' },
    )
  }

  const insertResult = await env.DB.prepare(`
    INSERT OR IGNORE INTO feedback_submissions (submission_id, message, source)
    VALUES (?1, ?2, ?3)
  `)
    .bind(submission.submissionId, submission.message, submission.source)
    .run()

  const inserted = Number(insertResult?.meta?.changes ?? 1) > 0
  if (inserted && env.FEEDBACK_NOTIFIER && typeof waitUntil === 'function') {
    waitUntil(
      sendFeedbackNotification(env.FEEDBACK_NOTIFIER, submission)
        .catch((error) => console.error('Feedback email notification failed', error)),
    )
  }

  return json({ ok: true }, 201)
}

async function sendFeedbackNotification(notifier, submission) {
  const response = await notifier.fetch('https://feedback-notifier.internal/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  })

  if (!response.ok) {
    throw new Error(`Notifier returned status ${response.status}`)
  }
}

export function parseSubmission(body) {
  if (!body || typeof body !== 'object') return null

  const submissionId = body.submissionId
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const source = body.source

  if (!UUID_V4_PATTERN.test(submissionId)) return null
  if (message.length < 2 || message.length > MAX_MESSAGE_LENGTH) return null
  if (!SOURCES.has(source)) return null

  return { submissionId, message, source }
}

export function readFeedbackLimits(env) {
  return {
    minute: positiveInteger(env.FEEDBACK_MAX_PER_MINUTE, DEFAULT_LIMITS.minute),
    hour: positiveInteger(env.FEEDBACK_MAX_PER_HOUR, DEFAULT_LIMITS.hour),
    day: positiveInteger(env.FEEDBACK_MAX_PER_DAY, DEFAULT_LIMITS.day),
  }
}

function isAllowedRequestOrigin(request, configuredOrigins = '') {
  const origin = request.headers.get('Origin')
  if (!origin) return false

  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
    return false
  }

  const requestOrigin = new URL(request.url).origin
  const allowedOrigins = new Set(
    String(configuredOrigins)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  allowedOrigins.add(requestOrigin)

  return allowedOrigins.has(origin)
}

async function readBody(request, maxBytes) {
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BodyTooLargeError()
  }

  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let body = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    byteLength += value.byteLength
    if (byteLength > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError()
    }
    body += decoder.decode(value, { stream: true })
  }

  return body + decoder.decode()
}

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

class BodyTooLargeError extends Error {}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}
