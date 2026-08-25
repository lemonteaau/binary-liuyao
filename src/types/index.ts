// Core domain types for HEX//64.
// Bit convention (fixed): bit i = line i+1 (i.e. 初爻 = bit 0 / LSB).
// Display strings are MSB-first: "L6 L5 L4 L3 L2 L1".

/** Traditional raw line value from the three-coin method. */
export type LineValue = 6 | 7 | 8 | 9

export type InputMethod = 'entropy' | 'coin' | 'manual' | 'hexagram' | 'number' | 'time' | 'link'

export interface TrigramInfo {
  key: string
  /** 三画卦名，如 "乾" */
  name: string
  /** 八卦象，如 "天" */
  symbol: string
  /** 3-bit int, LSB = 该卦初爻 */
  bits: number
  element: Element
}

export type Element = '金' | '木' | '水' | '火' | '土'

export type Branch =
  | '子' | '丑' | '寅' | '卯' | '辰' | '巳'
  | '午' | '未' | '申' | '酉' | '戌' | '亥'

export type Stem =
  | '甲' | '乙' | '丙' | '丁' | '戊'
  | '己' | '庚' | '辛' | '壬' | '癸'

export type SixRelation = '父母' | '兄弟' | '子孙' | '妻财' | '官鬼'

export type SixSpirit = '青龙' | '朱雀' | '勾陈' | '腾蛇' | '白虎' | '玄武'

export type PalaceRank =
  | '首卦' | '一世' | '二世' | '三世' | '四世' | '五世' | '游魂' | '归魂'

export type TrigramKeyLiteral = 'qian' | 'dui' | 'li' | 'zhen' | 'xun' | 'kan' | 'gen' | 'kun'

export interface HexagramRecord {
  /** King Wen sequence number 1..64 */
  kingWenNumber: number
  /** full name e.g. "水雷屯" */
  chineseName: string
  /** single-char core name e.g. "屯" */
  shortName: string
  upperKey: TrigramKeyLiteral
  lowerKey: TrigramKeyLiteral
  /** 6-bit int, LSB = 初爻 */
  bits: number
}

export interface NajiaLine {
  stem: Stem
  branch: Branch
  element: Element
}

export interface ChartLine {
  /** 0-based, 0 = 初爻 */
  index: number
  value: LineValue
  yang: boolean
  mutating: boolean
  primary: {
    najia: NajiaLine
    relation: SixRelation
    spirit?: SixSpirit
    shiYing: '世' | '应' | null
  }
  result: {
    najia: NajiaLine
    relation: SixRelation
  }
}

export interface FuShenEntry {
  /** position in hexagram (0-based) where it is listed */
  index: number
  relation: SixRelation
  najia: NajiaLine
}

export interface ShenShaEntry {
  id: string
  name: string
  branches: Branch[]
}

export interface CalendarData {
  timezone: string
  utcOffset: string
  gregorian: string
  lunarText: string
  ganzhi: { year: string; month: string; day: string; hour: string }
  hourZhi: Branch
  xunKong: [Branch, Branch]
}

export interface HexStateInfo {
  bits: number
  binary: string
  record: HexagramRecord
  palace: string
  palaceRank: PalaceRank
  attribute: '六冲' | '六合' | null
}

export interface ChartData {
  inputMethod: InputMethod
  createdAt: string
  calendar: CalendarData
  lines: ChartLine[]
  primary: HexStateInfo
  mutationMask: number
  result: HexStateInfo
  fuShen: FuShenEntry[]
  guaShen: { branch: Branch; onHexagram: boolean }
  shensha: ShenShaEntry[]
}
