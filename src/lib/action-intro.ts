import type { InputMethod } from '@/types'

/**
 * 起卦引导（操作提示从舞台中央缩回操作栏）按舞台分别计数：
 * 摇币、电脑起卦各用各的；数字、时间、汉字共用同一个罗盘，学会一个就都会了。
 */
export type ActionIntroGroup = 'coin' | 'entropy' | 'derive'

export const ACTION_INTRO_STORAGE_KEY = 'hex64.action-intro.v1'
/** 用某个舞台完成这么多次排盘后，不再对它弹出引导 */
export const ACTION_INTRO_MAX_READINGS = 3

type Counts = Record<ActionIntroGroup, number>

export function actionIntroGroupOf(method: InputMethod): ActionIntroGroup | null {
  if (method === 'coin' || method === 'entropy') return method
  if (method === 'number' || method === 'time' || method === 'hanzi') return 'derive'
  return null
}

const count = (value: unknown) => (Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0)

function loadCounts(): Counts {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTION_INTRO_STORAGE_KEY) ?? '{}') as Partial<Counts> | null
    return { coin: count(parsed?.coin), entropy: count(parsed?.entropy), derive: count(parsed?.derive) }
  } catch {
    return { coin: 0, entropy: 0, derive: 0 }
  }
}

function saveCounts(counts: Counts): void {
  try {
    localStorage.setItem(ACTION_INTRO_STORAGE_KEY, JSON.stringify(counts))
  } catch {
    /* storage 不可用时引导照常出现，不影响起卦 */
  }
}

export function recordActionIntroReading(method: InputMethod): void {
  const group = actionIntroGroupOf(method)
  if (!group) return
  const counts = loadCounts()
  saveCounts({ ...counts, [group]: counts[group] + 1 })
}

/** 老用户已有的本地历史按起卦方式计入次数 */
export function syncActionIntroReadings(methods: readonly InputMethod[]): void {
  const counts = loadCounts()
  const local: Counts = { coin: 0, entropy: 0, derive: 0 }
  for (const method of methods) {
    const group = actionIntroGroupOf(method)
    if (group) local[group]++
  }
  const next: Counts = {
    coin: Math.max(counts.coin, local.coin),
    entropy: Math.max(counts.entropy, local.entropy),
    derive: Math.max(counts.derive, local.derive),
  }
  if (next.coin !== counts.coin || next.entropy !== counts.entropy || next.derive !== counts.derive) {
    saveCounts(next)
  }
}

export function actionIntroRetired(group: ActionIntroGroup): boolean {
  return loadCounts()[group] >= ACTION_INTRO_MAX_READINGS
}
