interface CounterResponse {
  ordinal: number
}

const COUNTER_ENDPOINT = import.meta.env.VITE_COUNTER_ENDPOINT?.trim() || '/api/hexagram-count'

async function ordinalFrom(response: Response): Promise<number> {
  if (!response.ok) {
    throw new Error(`Counter request failed with status ${response.status}`)
  }

  const data = await response.json() as Partial<CounterResponse>
  if (!Number.isSafeInteger(data.ordinal) || (data.ordinal ?? 0) < 1) {
    throw new Error('Counter returned an invalid ordinal')
  }

  return data.ordinal!
}

export async function getCurrentHexagramOrdinal(signal?: AbortSignal): Promise<number> {
  const response = await fetch(COUNTER_ENDPOINT, {
    method: 'GET',
    signal,
  })

  return ordinalFrom(response)
}

export async function claimHexagramOrdinal(eventId: string, signal?: AbortSignal): Promise<number> {
  const response = await fetch(COUNTER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
    signal,
  })

  return ordinalFrom(response)
}
