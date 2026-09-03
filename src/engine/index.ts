import { buildCalendar } from '@/calendar/solar-lunar'
import { PURE_BITS, hexagramByBits } from '@/data/hexagrams'
import { TRIGRAMS } from '@/data/trigrams'
import type {
  Branch, ChartData, ChartLine, InputMethod, LineValue, Stem,
} from '@/types'
import {
  bitsToString, lineIsMutating, lineIsYang,
  rawLinesToMutationMask, rawLinesToPrimaryBits, resultBitsOf,
} from './binary'
import { guaShenOf } from './gua-shen'
import { fuShenOf } from './fushen'
import { hexStateInfoOf, placementOf, shiYingOf } from './hexagrams'
import { najiaForHexagram } from './najia'
import { relationOf } from './six-relations'
import { sixSpiritsOf } from './six-spirits'
import { calculateShenSha } from './shensha'

export interface GenerateChartParams {
  inputMethod: InputMethod
  rawLines: readonly [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
  /** 缺省取当前时刻 */
  when?: Date
  /** IANA 时区，缺省 UTC（UI 层应传入用户时区） */
  timezone?: string
}

export const INPUT_METHOD_LABELS: Record<InputMethod, string> = {
  entropy: '电脑起卦',
  coin: '摇币起卦',
  manual: '手动排卦',
  hexagram: '卦名起卦',
  number: '数字起卦',
  time: '时间起卦',
  hanzi: '汉字起卦',
  link: '分享链接',
}

/**
 * 核心排盘入口。Engine 与 UI 完全分离，可复用于 CLI / API。
 */
export function generateChart(params: GenerateChartParams): ChartData {
  const when = params.when ?? new Date()
  const timezone = params.timezone ?? 'UTC'

  const calendar = buildCalendar(when, timezone)

  const primaryBits = rawLinesToPrimaryBits(params.rawLines)
  const mutationMask = rawLinesToMutationMask(params.rawLines)
  const resultBits = resultBitsOf(primaryBits, mutationMask)

  const primary = hexStateInfoOf(primaryBits)
  const result = hexStateInfoOf(resultBits)

  const primaryRecord = hexagramByBits(primaryBits)!
  const resultRecord = hexagramByBits(resultBits)!
  const primaryNajia = najiaForHexagram(primaryRecord)
  const resultNajia = najiaForHexagram(resultRecord)

  const palaceKey = placementOf(primaryBits).palaceKey
  const palaceElement = TRIGRAMS[palaceKey].element

  const spirits = sixSpiritsOf(calendar.ganzhi.day[0] as Stem)
  const { shi, ying } = shiYingOf(placementOf(primaryBits).rank)

  const lines: ChartLine[] = params.rawLines.map((value, index) => ({
    index,
    value,
    yang: lineIsYang(value),
    mutating: lineIsMutating(value),
    primary: {
      najia: primaryNajia[index]!,
      relation: relationOf(primaryNajia[index]!.element, palaceElement),
      spirit: spirits[index],
      shiYing:
        index === shi ? '世' : index === ying ? '应' : null,
    },
    result: {
      najia: resultNajia[index]!,
      relation: relationOf(resultNajia[index]!.element, palaceElement),
    },
  }))

  const relationsOnLines = lines.map((l) => l.primary.relation)
  const fuShen = fuShenOf(PURE_BITS[palaceKey]!, palaceElement, relationsOnLines)

  const guaShenBranch = guaShenOf(shi, lineIsYang(params.rawLines[shi]!))
  const guaShen = {
    branch: guaShenBranch,
    onHexagram: lines.some((l) => l.primary.najia.branch === guaShenBranch),
  }

  const ganzhi = calendar.ganzhi
  const shensha = calculateShenSha({
    dayStem: ganzhi.day[0] as Stem,
    dayBranch: ganzhi.day[1] as Branch,
    monthBranch: ganzhi.month[1] as Branch,
    yearBranch: ganzhi.year[1] as Branch,
  })

  return {
    inputMethod: params.inputMethod,
    createdAt: calendar.gregorian,
    calendar,
    lines,
    primary,
    mutationMask,
    result,
    fuShen,
    guaShen,
    shensha,
  }
}

export { bitsToString }
