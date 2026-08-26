interface CounterResponse {
  ordinal: number
}

const COUNTER_ENDPOINT = import.meta.env.VITE_COUNTER_ENDPOINT?.trim() || '/api/hexagram-count'

export async function claimHexagramOrdinal(eventId: string, signal?: AbortSignal): Promise<number> {
  const response = await fetch(COUNTER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Counter request failed with status ${response.status}`)
  }

  const data = await response.json() as Partial<CounterResponse>
  if (!Number.isSafeInteger(data.ordinal) || (data.ordinal ?? 0) < 1) {
    throw new Error('Counter returned an invalid ordinal')
  }

  return data.ordinal!
}
