const INITIAL_COUNT = 166
const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 512
const DEFAULT_LIMITS = {
  minute: 30,
  hour: 200,
  day: 500,
}
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT value AS ordinal FROM hexagram_counter_state WHERE id = 1',
    ).first()
    return json({ ordinal: row?.ordinal ?? INITIAL_COUNT })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })
  }

  if (!isAllowedRequestOrigin(request, env.COUNTER_ALLOWED_ORIGINS)) {
    return json({ error: 'Forbidden origin' }, 403)
  }

  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415)
  }

  let eventId
  try {
    const bodyText = await readBody(request, MAX_BODY_BYTES)
    const body = JSON.parse(bodyText)
    eventId = body?.eventId
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return json({ error: 'Request body too large' }, 413)
    }
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (!isValidEventId(eventId)) {
    return json({ error: 'Invalid eventId' }, 400)
  }

  // Replaying an existing event is idempotent and does not consume the guard.
  const existing = await env.DB.prepare(
    'SELECT ordinal FROM hexagram_counter_events WHERE event_id = ?1',
  )
    .bind(eventId)
    .first()

  if (existing && typeof existing.ordinal === 'number') {
    return json({ ordinal: existing.ordinal })
  }

  const activity = await env.DB.prepare(`
    SELECT
      COUNT(CASE WHEN created_at >= datetime('now', '-1 minute') THEN 1 END) AS minute_count,
      COUNT(CASE WHEN created_at >= datetime('now', '-1 hour') THEN 1 END) AS hour_count,
      COUNT(*) AS day_count
    FROM hexagram_counter_events
    WHERE created_at >= datetime('now', '-1 day')
  `).first()
  const limits = readCounterLimits(env)

  if (
    Number(activity?.minute_count ?? 0) >= limits.minute ||
    Number(activity?.hour_count ?? 0) >= limits.hour ||
    Number(activity?.day_count ?? 0) >= limits.day
  ) {
    return json(
      { error: 'Counter temporarily rate limited' },
      429,
      { 'Retry-After': '60' },
    )
  }

  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO hexagram_counter_events (event_id, ordinal)
      SELECT ?1, value + 1
      FROM hexagram_counter_state
      WHERE id = 1
    `).bind(eventId),
    env.DB.prepare(`
      UPDATE hexagram_counter_state
      SET value = MAX(
        value,
        COALESCE(
          (SELECT ordinal FROM hexagram_counter_events WHERE event_id = ?1),
          value
        )
      )
      WHERE id = 1
    `).bind(eventId),
    env.DB.prepare(
      'SELECT ordinal FROM hexagram_counter_events WHERE event_id = ?1',
    ).bind(eventId),
  ])
  const row = results[2]?.results?.[0]

  if (!row || typeof row.ordinal !== 'number') {
    return json({ error: 'Counter unavailable' }, 503)
  }

  return json({ ordinal: row.ordinal })
}

export function isValidEventId(eventId) {
  return typeof eventId === 'string' && EVENT_ID_PATTERN.test(eventId)
}

export function isAllowedRequestOrigin(request, configuredOrigins = '') {
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

export function readCounterLimits(env) {
  return {
    minute: positiveInteger(env.COUNTER_MAX_PER_MINUTE, DEFAULT_LIMITS.minute),
    hour: positiveInteger(env.COUNTER_MAX_PER_HOUR, DEFAULT_LIMITS.hour),
    day: positiveInteger(env.COUNTER_MAX_PER_DAY, DEFAULT_LIMITS.day),
  }
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
