export type FeedbackSource = 'about' | 'invite'

interface FeedbackResponse {
  ok: boolean
}

export interface FeedbackPromptState {
  activeMs: number
  dismissedUntil?: number
  submitted?: boolean
}

export const FEEDBACK_PROMPT_ACTIVE_MS = 8 * 60 * 1000
export const FEEDBACK_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
export const FEEDBACK_PROMPT_STORAGE_KEY = 'hex64.feedback-prompt.v1'
export const FEEDBACK_STATE_CHANGED_EVENT = 'hex64:feedback-state-changed'

const FEEDBACK_ENDPOINT = import.meta.env.VITE_FEEDBACK_ENDPOINT?.trim() || '/api/feedback'

export async function submitFeedback({
  submissionId,
  message,
  source,
  signal,
}: {
  submissionId: string
  message: string
  source: FeedbackSource
  signal?: AbortSignal
}): Promise<void> {
  const response = await fetch(FEEDBACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId, message, source }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Feedback request failed with status ${response.status}`)
  }

  const data = await response.json() as Partial<FeedbackResponse>
  if (data.ok !== true) {
    throw new Error('Feedback endpoint returned an invalid response')
  }
}

export function loadFeedbackPromptState(): FeedbackPromptState {
  try {
    const parsed = JSON.parse(localStorage.getItem(FEEDBACK_PROMPT_STORAGE_KEY) ?? '{}') as Partial<FeedbackPromptState>
    return {
      activeMs: Number.isFinite(parsed.activeMs) && (parsed.activeMs ?? 0) > 0
        ? Number(parsed.activeMs)
        : 0,
      dismissedUntil: Number.isFinite(parsed.dismissedUntil)
        ? Number(parsed.dismissedUntil)
        : undefined,
      submitted: parsed.submitted === true,
    }
  } catch {
    return { activeMs: 0 }
  }
}

export function saveFeedbackPromptState(state: FeedbackPromptState): void {
  try {
    localStorage.setItem(FEEDBACK_PROMPT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage 不可用时，本次会话仍可正常使用反馈表单 */
  }
}

export function isFeedbackPromptEligible(
  state: FeedbackPromptState,
  now = Date.now(),
): boolean {
  return !state.submitted &&
    state.activeMs >= FEEDBACK_PROMPT_ACTIVE_MS &&
    (state.dismissedUntil ?? 0) <= now
}

export function snoozeFeedbackPrompt(now = Date.now()): void {
  const state = loadFeedbackPromptState()
  saveFeedbackPromptState({
    ...state,
    dismissedUntil: now + FEEDBACK_PROMPT_SNOOZE_MS,
  })
  notifyFeedbackStateChanged()
}

export function markFeedbackSubmitted(): void {
  const state = loadFeedbackPromptState()
  saveFeedbackPromptState({ ...state, submitted: true })
  notifyFeedbackStateChanged()
}

function notifyFeedbackStateChanged(): void {
  window.dispatchEvent(new Event(FEEDBACK_STATE_CHANGED_EVENT))
}
