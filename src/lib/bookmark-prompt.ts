export interface BookmarkPromptState {
  visitCount: number
  completedReadingCount: number
  dismissed?: boolean
}

export const BOOKMARK_PROMPT_VISIT_DELAY_MS = 15_000
export const BOOKMARK_PROMPT_STORAGE_KEY = 'hex64.bookmark-prompt.v1'
export const BOOKMARK_PROMPT_SESSION_KEY = 'hex64.bookmark-prompt-session.v1'
export const BOOKMARK_PROMPT_STATE_CHANGED_EVENT = 'hex64:bookmark-prompt-state-changed'

export function loadBookmarkPromptState(): BookmarkPromptState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(BOOKMARK_PROMPT_STORAGE_KEY) ?? '{}',
    ) as Partial<BookmarkPromptState>

    return {
      visitCount: positiveInteger(parsed.visitCount),
      completedReadingCount: positiveInteger(parsed.completedReadingCount),
      dismissed: parsed.dismissed === true,
    }
  } catch {
    return { visitCount: 0, completedReadingCount: 0 }
  }
}

export function saveBookmarkPromptState(state: BookmarkPromptState): void {
  try {
    localStorage.setItem(BOOKMARK_PROMPT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage 不可用时不显示推广提示，不影响起卦 */
  }
}

export function registerBookmarkPromptVisit(): BookmarkPromptState {
  const state = loadBookmarkPromptState()
  if (state.dismissed) return state

  try {
    if (sessionStorage.getItem(BOOKMARK_PROMPT_SESSION_KEY)) return state
    sessionStorage.setItem(BOOKMARK_PROMPT_SESSION_KEY, '1')
  } catch {
    return state
  }

  const next = { ...state, visitCount: state.visitCount + 1 }
  saveBookmarkPromptState(next)
  notifyBookmarkPromptStateChanged()
  return next
}

export function recordBookmarkPromptReading(): BookmarkPromptState {
  const state = loadBookmarkPromptState()
  if (state.dismissed) return state

  const next = {
    ...state,
    completedReadingCount: state.completedReadingCount + 1,
  }
  saveBookmarkPromptState(next)
  notifyBookmarkPromptStateChanged()
  return next
}

export function syncBookmarkPromptReadingCount(count: number): BookmarkPromptState {
  const state = loadBookmarkPromptState()
  if (state.dismissed) return state

  const completedReadingCount = Math.max(
    state.completedReadingCount,
    positiveInteger(count),
  )
  if (completedReadingCount === state.completedReadingCount) return state

  const next = { ...state, completedReadingCount }
  saveBookmarkPromptState(next)
  notifyBookmarkPromptStateChanged()
  return next
}

export function isBookmarkPromptEligible(state: BookmarkPromptState): boolean {
  return !state.dismissed &&
    (state.completedReadingCount >= 2 || state.visitCount >= 2)
}

export function dismissBookmarkPrompt(): void {
  const state = loadBookmarkPromptState()
  saveBookmarkPromptState({ ...state, dismissed: true })
  notifyBookmarkPromptStateChanged()
}

function positiveInteger(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0
}

function notifyBookmarkPromptStateChanged(): void {
  window.dispatchEvent(new Event(BOOKMARK_PROMPT_STATE_CHANGED_EVENT))
}
