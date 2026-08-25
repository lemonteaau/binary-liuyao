import { TRIGRAMS, TRIGRAM_KEYS, type TrigramKey } from './trigrams'
import type { HexagramRecord } from '@/types'

// 8x8 King Wen matrix. Rows = lower trigram, columns = upper trigram,
// both in TRIGRAM_KEYS order (乾 兑 离 震 巽 坎 艮 坤).
// Cell format: "kingWenNumber|fullName"
const MATRIX: Record<TrigramKey, Record<TrigramKey, string>> = {
  qian: {
    qian: '1|乾为天', dui: '43|泽天夬', li: '14|火天大有', zhen: '34|雷天大壮',
    xun: '9|风天小畜', kan: '5|水天需', gen: '26|山天大畜', kun: '11|地天泰',
  },
  dui: {
    qian: '10|天泽履', dui: '58|兑为泽', li: '38|火泽睽', zhen: '54|雷泽归妹',
    xun: '61|风泽中孚', kan: '60|水泽节', gen: '41|山泽损', kun: '19|地泽临',
  },
  li: {
    qian: '13|天火同人', dui: '49|泽火革', li: '30|离为火', zhen: '55|雷火丰',
    xun: '37|风火家人', kan: '63|水火既济', gen: '22|山火贲', kun: '36|地火明夷',
  },
  zhen: {
    qian: '25|天雷无妄', dui: '17|泽雷随', li: '21|火雷噬嗑', zhen: '51|震为雷',
    xun: '42|风雷益', kan: '3|水雷屯', gen: '27|山雷颐', kun: '24|地雷复',
  },
  xun: {
    qian: '44|天风姤', dui: '28|泽风大过', li: '50|火风鼎', zhen: '32|雷风恒',
    xun: '57|巽为风', kan: '48|水风井', gen: '18|山风蛊', kun: '46|地风升',
  },
  kan: {
    qian: '6|天水讼', dui: '47|泽水困', li: '64|火水未济', zhen: '40|雷水解',
    xun: '59|风水涣', kan: '29|坎为水', gen: '4|山水蒙', kun: '7|地水师',
  },
  gen: {
    qian: '33|天山遁', dui: '31|泽山咸', li: '56|火山旅', zhen: '62|雷山小过',
    xun: '53|风山渐', kan: '39|水山蹇', gen: '52|艮为山', kun: '15|地山谦',
  },
  kun: {
    qian: '12|天地否', dui: '45|泽地萃', li: '35|火地晋', zhen: '16|雷地豫',
    xun: '20|风地观', kan: '8|水地比', gen: '23|山地剥', kun: '2|坤为地',
  },
}

function shortNameOf(full: string): string {
  const weiIndex = full.indexOf('为')
  if (weiIndex > 0 && full.length === 4) return full.slice(weiIndex + 1)
  return full.slice(2)
}

function buildTable(): HexagramRecord[] {
  const list: HexagramRecord[] = []
  // MATRIX 以 [下卦][上卦] 索引（转录自传统八宫矩阵）
  for (const lowerKey of TRIGRAM_KEYS) {
    for (const upperKey of TRIGRAM_KEYS) {
      const [kwStr, name] = MATRIX[lowerKey][upperKey].split('|') as [string, string]
      list.push({
        kingWenNumber: Number(kwStr),
        chineseName: name!,
        shortName: shortNameOf(name),
        upperKey,
        lowerKey,
        bits: (TRIGRAMS[upperKey].bits << 3) | TRIGRAMS[lowerKey].bits,
      })
    }
  }
  return list
}

export const HEXAGRAMS: HexagramRecord[] = buildTable()

/** bits(6-bit int, LSB=初爻) → 卦记录 */
export function hexagramByBits(bits: number): HexagramRecord | undefined {
  return HEXAGRAMS.find((h) => h.bits === bits)
}

/** 文王卦序号 → 卦记录 */
export function hexagramByKingWen(kw: number): HexagramRecord | undefined {
  return HEXAGRAMS.find((h) => h.kingWenNumber === kw)
}

/** 八纯卦（各宫首卦）bits */
export const PURE_BITS: Record<TrigramKey, number> = Object.fromEntries(
  TRIGRAM_KEYS.map((k) => [k, (TRIGRAMS[k].bits << 3) | TRIGRAMS[k].bits]),
) as Record<TrigramKey, number>
