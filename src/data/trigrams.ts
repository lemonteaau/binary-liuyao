import type { Branch, Element, Stem } from '@/types'

export interface TrigramData {
  key: string
  name: string
  symbol: string
  /** 3-bit int, LSB = 该卦初爻 (初爻在下) */
  bits: number
  element: Element
  /** 内卦三爻地支，自下而上 L1 L2 L3 */
  inner: [Branch, Branch, Branch]
  /** 外卦三爻地支，自下而上 L4 L5 L6 */
  outer: [Branch, Branch, Branch]
  /** 内卦纳干 / 外卦纳干（乾甲壬、坤乙癸） */
  stemInner: Stem
  stemOuter: Stem
}

/** 下卦/上卦共用的列序：乾 兑 离 震 巽 坎 艮 坤 */
export const TRIGRAM_KEYS = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'] as const
export type TrigramKey = (typeof TRIGRAM_KEYS)[number]

export const TRIGRAMS: Record<TrigramKey, TrigramData> = {
  qian: {
    key: 'qian', name: '乾', symbol: '天', bits: 0b111, element: '金',
    inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'],
    stemInner: '甲', stemOuter: '壬',
  },
  dui: {
    key: 'dui', name: '兑', symbol: '泽', bits: 0b011, element: '金',
    inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'],
    stemInner: '丁', stemOuter: '丁',
  },
  li: {
    key: 'li', name: '离', symbol: '火', bits: 0b101, element: '火',
    inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'],
    stemInner: '己', stemOuter: '己',
  },
  zhen: {
    key: 'zhen', name: '震', symbol: '雷', bits: 0b001, element: '木',
    inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'],
    stemInner: '庚', stemOuter: '庚',
  },
  xun: {
    key: 'xun', name: '巽', symbol: '风', bits: 0b110, element: '木',
    inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'],
    stemInner: '辛', stemOuter: '辛',
  },
  kan: {
    key: 'kan', name: '坎', symbol: '水', bits: 0b010, element: '水',
    inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'],
    stemInner: '戊', stemOuter: '戊',
  },
  gen: {
    key: 'gen', name: '艮', symbol: '山', bits: 0b100, element: '土',
    inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'],
    stemInner: '丙', stemOuter: '丙',
  },
  kun: {
    key: 'kun', name: '坤', symbol: '地', bits: 0b000, element: '土',
    inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'],
    stemInner: '乙', stemOuter: '癸',
  },
}

export const BRANCH_ELEMENTS: Record<Branch, Element> = {
  子: '水', 亥: '水',
  寅: '木', 卯: '木',
  巳: '火', 午: '火',
  申: '金', 酉: '金',
  辰: '土', 戌: '土', 丑: '土', 未: '土',
}

/** 地支按序，index 0 = 子 */
export const BRANCHES: Branch[] = [
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
]

export const ELEMENTS: Element[] = ['金', '木', '水', '火', '土']

const ELEMENT_INDEX: Record<Element, number> = {
  金: 0, 木: 1, 水: 2, 火: 3, 土: 4,
}

const SHENG: Record<number, number> = {
  // index generates (index+1) % 5 following 金水木火土 cycle
  0: 2, // 金生水
  2: 1, // 水生木
  1: 3, // 木生火
  3: 4, // 火生土
  4: 0, // 土生金
}

/** me 生成 target ? */
export function generates(me: Element, target: Element): boolean {
  return SHENG[ELEMENT_INDEX[me]] === ELEMENT_INDEX[target]
}

const KE: Record<number, number> = {
  0: 1, // 金克木
  1: 4, // 木克土
  4: 2, // 土克水
  2: 3, // 水克火
  3: 0, // 火克金
}

/** me 克 target ? */
export function overcomes(me: Element, target: Element): boolean {
  return KE[ELEMENT_INDEX[me]] === ELEMENT_INDEX[target]
}
