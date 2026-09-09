interface CounterResponse {
  ordinal: number
}

const COUNTER_ENDPOINT = import.meta.env.VITE_COUNTER_ENDPOINT?.trim() || '/api/hexagram-count'
const COUNTER_GUARD_STORAGE_KEY = 'hex64.counter-guard.v1'
const RAPID_CLAIM_WINDOW_MS = 2 * 60 * 1_000
const RAPID_CLAIM_LIMIT = 10
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1_000

interface CounterGuardState {
  recentAttempts: number[]
  blockedUntil: number
}

export function shouldClaimHexagramOrdinal(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(COUNTER_GUARD_STORAGE_KEY)
    let stored: unknown = null
    if (raw) {
      try {
        stored = JSON.parse(raw)
      } catch {
        // Treat a damaged local value as an empty guard and replace it below.
      }
    }
    const state = readCounterGuardState(stored)

    if (state.blockedUntil > now) return false

    const recentAttempts = state.recentAttempts.filter(
      (timestamp) => timestamp <= now && timestamp > now - RAPID_CLAIM_WINDOW_MS,
    )
    if (recentAttempts.length >= RAPID_CLAIM_LIMIT - 1) {
      saveCounterGuardState({ recentAttempts: [], blockedUntil: now + CLAIM_COOLDOWN_MS })
      return false
    }

    saveCounterGuardState({ recentAttempts: [...recentAttempts, now], blockedUntil: 0 })
    return true
  } catch {
    // A local guard failure must not break otherwise valid counter requests.
    return true
  }
}

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

function readCounterGuardState(value: unknown): CounterGuardState {
  if (!value || typeof value !== 'object') return { recentAttempts: [], blockedUntil: 0 }

  const candidate = value as Partial<CounterGuardState>
  return {
    recentAttempts: Array.isArray(candidate.recentAttempts)
      ? candidate.recentAttempts.filter(
        (timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp),
      )
      : [],
    blockedUntil: typeof candidate.blockedUntil === 'number' && Number.isFinite(candidate.blockedUntil)
      ? candidate.blockedUntil
      : 0,
  }
}

function saveCounterGuardState(state: CounterGuardState): void {
  localStorage.setItem(COUNTER_GUARD_STORAGE_KEY, JSON.stringify(state))
}
