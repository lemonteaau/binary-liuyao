import type { InputMethod } from '@/types'

type UmamiEventData = Record<string, string | number | boolean>

const DIVINATION_METHOD_LABELS: Record<InputMethod, string> = {
  coin: '摇币起卦',
  entropy: '电脑起卦',
  manual: '手动排卦',
  hexagram: '卦名起卦',
  number: '数字起卦',
  time: '时间起卦',
  hanzi: '汉字起卦',
  link: '分享链接',
}

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

export function trackDivinationEvent(eventName: string, method: InputMethod): void {
  trackEvent(eventName, { 起卦方式: DIVINATION_METHOD_LABELS[method] })
}
