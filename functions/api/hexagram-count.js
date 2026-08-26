const INITIAL_COUNT = 166
const EVENT_ID_PATTERN = /^[0-9a-f-]{36}$/i
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
}

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT value AS ordinal FROM hexagram_counter_state WHERE id = 1',
    ).first()
    return json({ ordinal: row?.ordinal ?? INITIAL_COUNT })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let eventId
  try {
    const body = await request.json()
    eventId = body?.eventId
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (typeof eventId !== 'string' || !EVENT_ID_PATTERN.test(eventId)) {
    return json({ error: 'Invalid eventId' }, 400)
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}
