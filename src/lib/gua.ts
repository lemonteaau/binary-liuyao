import { HEXAGRAMS, PURE_BITS, hexagramByBits, hexagramByKingWen } from '@/data/hexagrams'
import { TRIGRAMS, TRIGRAM_KEYS, type TrigramKey } from '@/data/trigrams'
import { zhouyiTextByKingWen, type ZhouyiHexagramText } from '@/data/zhouyi'
import { fuShenOf } from '@/engine/fushen'
import { guaShenOf } from '@/engine/gua-shen'
import { hexStateInfoOf, placementOf, shiYingOf } from '@/engine/hexagrams'
import { najiaForHexagram } from '@/engine/najia'
import { relationOf } from '@/engine/six-relations'
import type { Branch, Element, FuShenEntry, HexStateInfo, HexagramRecord, NajiaLine, SixRelation } from '@/types'

/** 六十四卦静态页：只含与起卦时间无关的内容（不含六神、旬空、神煞）。 */
export const GUA_INDEX_PATH = '/gua'
export const GUA_NUMBERS = Array.from({ length: 64 }, (_, index) => index + 1)

export function guaPath(kingWenNumber: number): string {
  return `${GUA_INDEX_PATH}/${kingWenNumber}`
}

/** `/gua/13` → 13；其他路径返回 null。 */
export function guaNumberFromPath(pathname: string): number | null {
  const match = /^\/gua\/([1-9]\d?)$/.exec(pathname)
  const number = match ? Number(match[1]) : NaN
  return number >= 1 && number <= 64 ? number : null
}

/** 「离宫归魂卦」「坤宫首卦」：首卦本身带「卦」字 */
export function palaceRankLabel(state: HexStateInfo): string {
  return `${state.palace}${state.palaceRank}${state.palaceRank === '首卦' ? '' : '卦'}`
}

export interface GuaLine {
  /** 0 = 初爻 */
  index: number
  yang: boolean
  najia: NajiaLine
  relation: SixRelation
  shiYing: '世' | '应' | null
}

export interface GuaProfile {
  record: HexagramRecord
  state: HexStateInfo
  classic: ZhouyiHexagramText
  upper: TrigramKey
  lower: TrigramKey
  palaceElement: Element
  lines: GuaLine[]
  fuShen: FuShenEntry[]
  guaShen: Branch
  /** 错卦（六爻全反） */
  cuo: HexagramRecord
  /** 综卦（上下颠倒） */
  zong: HexagramRecord
  /** 互卦（二三四爻为下卦，三四五爻为上卦） */
  hu: HexagramRecord
}

function reverseSixBits(bits: number): number {
  let reversed = 0
  for (let i = 0; i < 6; i++) reversed |= ((bits >> i) & 1) << (5 - i)
  return reversed
}

export function guaProfile(kingWenNumber: number): GuaProfile {
  const record = hexagramByKingWen(kingWenNumber)
  if (!record) throw new Error(`no hexagram for King Wen number ${kingWenNumber}`)
  const { bits } = record
  const { palaceKey, rank } = placementOf(bits)
  const palaceElement = TRIGRAMS[palaceKey].element
  const { shi, ying } = shiYingOf(rank)
  const najia = najiaForHexagram(record)
  const lines = najia.map((line, index): GuaLine => ({
    index,
    yang: Boolean((bits >> index) & 1),
    najia: line,
    relation: relationOf(line.element, palaceElement),
    shiYing: index === shi ? '世' : index === ying ? '应' : null,
  }))

  return {
    record,
    state: hexStateInfoOf(bits),
    classic: zhouyiTextByKingWen(kingWenNumber),
    upper: record.upperKey,
    lower: record.lowerKey,
    palaceElement,
    lines,
    fuShen: fuShenOf(PURE_BITS[palaceKey], palaceElement, lines.map((line) => line.relation)),
    guaShen: guaShenOf(shi, lines[shi]!.yang),
    cuo: hexagramByBits(bits ^ 0b111111)!,
    zong: hexagramByBits(reverseSixBits(bits))!,
    hu: hexagramByBits(((bits >> 1) & 0b111) | (((bits >> 2) & 0b111) << 3))!,
  }
}

/** 京房八宫：每宫自首卦至归魂的八卦。 */
export function palaceGroups(): { palaceKey: TrigramKey; members: HexagramRecord[] }[] {
  return TRIGRAM_KEYS.map((palaceKey) => ({
    palaceKey,
    members: HEXAGRAMS
      .filter((record) => placementOf(record.bits).palaceKey === palaceKey)
      .sort((a, b) => placementOf(a.bits).rank - placementOf(b.bits).rank),
  }))
}
