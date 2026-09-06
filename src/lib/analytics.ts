type UmamiEventData = Record<string, string | number | boolean>

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: UmamiEventData) => void
    }
  }
}

export function trackEvent(eventName: string, data?: UmamiEventData): void {
  try {
    window.umami?.track(eventName, data)
  } catch {
    // Analytics must never interrupt the user's action.
  }
}
