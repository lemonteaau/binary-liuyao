/**
 * 数字、时间、汉字三种起卦都是“取数 → 除八得卦、除六得动爻”。
 * 这里把各自的种子整理成同一份三步脚本，供罗盘动画与推演记录共用。
 */
import { BRANCHES, TRIGRAMS } from '@/data/trigrams'
import type { TrigramKey } from '@/data/trigrams'
import { rawLinesFromTrigrams, trigramKeyByRemainder } from '@/features/number/derive'
import type { NumberSeedPart, ParsedNumberSeed } from '@/features/number/derive'
import type { HanziSeed } from '@/features/hanzi/derive'
import type { TimeSeedInfo } from '@/features/time/derive'
import type { LineValue } from '@/types'

export const DERIVE_STEP_LABELS = ['上卦', '下卦', '动爻'] as const
export const DERIVE_LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const

export interface DeriveStep {
  /** 被除数连同来历的写法，如 7+8+29 = 44；直接取数时就是数本身 */
  dividend: string
  /** 被除数（十进制字符串，数字起卦不限长度） */
  total: string
  divisor: 8 | 6
  /** 取余后的序数：卦为先天数 1..8，爻为 1..6；余 0 时取 8 / 6 */
  ordinal: number
  /** 卦名或爻名 */
  result: string
  /** 时间起卦：这一步新计入的地支（0 为子），在罗盘上点亮 */
  branch?: number
}

export interface DeriveScript {
  steps: readonly [DeriveStep, DeriveStep, DeriveStep]
  upperKey: TrigramKey
  lowerKey: TrigramKey
  /** 0 为初爻 */
  movingLine: number
  rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
  /** 罗盘中心待机时显示的字 */
  seedGlyph: string
}

/** 算式里显示的余数：整除时写 0 */
export const shownRemainder = (step: DeriveStep) =>
  step.ordinal === step.divisor ? 0 : step.ordinal

interface StepSource {
  dividend: string
  total: string
  branch?: number
}

/** 算式与结果不同才写出等号 */
const summed = (formula: string, total: string | number): StepSource => ({
  dividend: formula === String(total) ? formula : `${formula} = ${total}`,
  total: String(total),
})

function build(
  sources: readonly [StepSource, StepSource, StepSource],
  upperOrdinal: number,
  lowerOrdinal: number,
  movingLine: number,
  seedGlyph: string,
): DeriveScript {
  const upperKey = trigramKeyByRemainder(upperOrdinal) as TrigramKey
  const lowerKey = trigramKeyByRemainder(lowerOrdinal) as TrigramKey
  return {
    steps: [
      { ...sources[0], divisor: 8, ordinal: upperOrdinal, result: TRIGRAMS[upperKey].name },
      { ...sources[1], divisor: 8, ordinal: lowerOrdinal, result: TRIGRAMS[lowerKey].name },
      { ...sources[2], divisor: 6, ordinal: movingLine + 1, result: DERIVE_LINE_NAMES[movingLine]! },
    ],
    upperKey,
    lowerKey,
    movingLine,
    rawLines: rawLinesFromTrigrams(upperKey, lowerKey, movingLine),
    seedGlyph,
  }
}

const numberPart = (part: NumberSeedPart): StepSource =>
  summed(part.formula, part.value.toString())

export function numberScript(seed: ParsedNumberSeed): DeriveScript {
  return build(
    [numberPart(seed.upper), numberPart(seed.lower), numberPart(seed.moving)],
    seed.upperRemainder,
    seed.lowerRemainder,
    seed.movingLine,
    '数',
  )
}

const ordinalOf = (total: number, base: number) => ((total - 1) % base) + 1

export function timeScript(seed: TimeSeedInfo): DeriveScript {
  const { yearBranchNumber, lunarMonth, lunarDay, hourBranchNumber, upperSum, totalSum } = seed
  return build(
    [
      {
        ...summed(`年支${yearBranchNumber}+月${lunarMonth}+日${lunarDay}`, upperSum),
        branch: yearBranchNumber - 1,
      },
      {
        ...summed(`${upperSum}+时支${hourBranchNumber}`, totalSum),
        branch: hourBranchNumber - 1,
      },
      summed(String(totalSum), totalSum),
    ],
    ordinalOf(upperSum, 8),
    ordinalOf(totalSum, 8),
    ordinalOf(totalSum, 6) - 1,
    BRANCHES[hourBranchNumber - 1] ?? '时',
  )
}

export function hanziScript(seed: HanziSeed): DeriveScript {
  const { upperValue, lowerValue, movingValue } = seed
  let upper: StepSource
  let lower: StepSource
  let moving: StepSource
  if (seed.strategy === 'single-character') {
    upper = { dividend: `「${seed.upperText}」${upperValue} 画`, total: String(upperValue) }
    lower = { dividend: `「${seed.lowerText}」${lowerValue} 画`, total: String(lowerValue) }
    moving = summed(`${upperValue}+${lowerValue}`, movingValue)
  } else if (seed.strategy === 'stroke-count') {
    const split = Math.floor(seed.characters.length / 2)
    const strokes = (from: number, to: number, total: number): StepSource =>
      to - from === 1
        ? { dividend: `${seed.characters[from]} ${total} 画`, total: String(total) }
        : summed(
          seed.characters.slice(from, to).map((character, index) =>
            `${character}${seed.characterStrokes[from + index]}`,
          ).join('+'),
          total,
        )
    upper = strokes(0, split, upperValue)
    lower = strokes(split, seed.characters.length, lowerValue)
    moving = summed(`${upperValue}+${lowerValue}`, movingValue)
  } else {
    upper = { dividend: `前半 ${upperValue} 字`, total: String(upperValue) }
    lower = { dividend: `后半 ${lowerValue} 字`, total: String(lowerValue) }
    moving = { dividend: `共 ${movingValue} 字`, total: String(movingValue) }
  }
  return build(
    [upper, lower, moving],
    seed.upperRemainder,
    seed.lowerRemainder,
    seed.movingLine,
    seed.characters[0] ?? '字',
  )
}
