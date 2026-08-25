import type { ChartData } from '@/types'
import { INPUT_METHOD_LABELS } from '@/engine'
import { bitsToString } from '@/engine/binary'

export interface RawTextOptions {
  /** 末尾附加「请根据以上六爻排盘进行分析。」 */
  includeAiInstruction: boolean
}

function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  return code > 0x2e7f ? 2 : 1
}

export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

function padEndWidth(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)))
}

/** "2026-08-24 15:42:37" → { date: "2026-08-24", hhmmss: "15:42:37" } */
function splitGregorian(gregorian: string): { date: string; time: string } {
  const [date = '', time = ''] = gregorian.split(' ')
  return { date, time }
}

export function formatRawText(chart: ChartData, options: RawTextOptions): string {
  const method = INPUT_METHOD_LABELS[chart.inputMethod]
  const { calendar, lines } = chart
  const { date, time } = splitGregorian(calendar.gregorian)
  const [y, mo, d] = date.split('-')
  const [hh, mi] = time.split(':')

  // 六神 / 伏神 / 本卦 / 变卦 四列表格（自上爻至初爻）
  const spiritCells: string[] = []
  const fuCells: string[] = []
  const primaryCells: string[] = []
  const resultCells: string[] = []

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    spiritCells.push(line.primary.spirit ?? '')
    fuCells.push('')
    const marker = line.mutating ? (line.yang ? ' ○' : ' ×') : ''
    const shiYing = line.primary.shiYing ? ` ${line.primary.shiYing}` : ''
    primaryCells.push(
      `${line.primary.relation}${line.primary.najia.stem}${line.primary.najia.branch}${line.primary.najia.element}${shiYing}${marker}`,
    )
    resultCells.push(
      `${line.result.relation}${line.result.najia.stem}${line.result.najia.branch}${line.result.najia.element}`,
    )
  }

  for (const fu of chart.fuShen) {
    const rowIndexFromTop = lines.length - 1 - fu.index
    fuCells[rowIndexFromTop] =
      `${fu.relation}${fu.najia.stem}${fu.najia.branch}${fu.najia.element}`
  }

  const widths = {
    spirit: Math.max(displayWidth('六神'), ...spiritCells.map(displayWidth)),
    fu: Math.max(displayWidth('伏神'), ...fuCells.map(displayWidth)),
    primary: Math.max(displayWidth('本卦'), ...primaryCells.map(displayWidth)),
    result: Math.max(displayWidth('变卦'), ...resultCells.map(displayWidth)),
  }

  const gap = '  '
  const tableLines: string[] = [
    padEndWidth('六神', widths.spirit) + gap +
    padEndWidth('伏神', widths.fu) + gap +
    padEndWidth('本卦', widths.primary) + gap +
    '变卦',
  ]
  for (let row = 0; row < 6; row++) {
    tableLines.push(
      padEndWidth(spiritCells[row]!, widths.spirit) + gap +
      padEndWidth(fuCells[row]!, widths.fu) + gap +
      padEndWidth(primaryCells[row]!, widths.primary) + gap +
      (resultCells[row] ?? ''),
    )
  }

  const attrOf = (info: ChartData['primary']): string =>
    info.attribute ? `${info.palace}${info.attribute}` : info.palace

  const shenshaLines = chart.shensha
    .filter((s) => s.branches.length > 0)
    .map((s) => `${s.name}—${s.branches.join('')}`)

  const out: string[] = []
  out.push(`起卦方式：${method}`)
  out.push('')
  out.push(`公历时间：${y}年${mo}月${d}日 ${hh}时${mi}分`)
  out.push(`农历时间：${calendar.lunarText}日 ${calendar.hourZhi}时`)
  out.push('')
  out.push(`干支：${calendar.ganzhi.year}年 ${calendar.ganzhi.month}月 ${calendar.ganzhi.day}日 ${calendar.ganzhi.hour}时`)
  out.push(`日空：${calendar.xunKong.join('')}`)
  out.push('')
  if (shenshaLines.length > 0) {
    out.push('神煞：')
    out.push(...shenshaLines)
    out.push('')
  }
  out.push(`卦身：${chart.guaShen.branch}`)
  out.push('')
  out.push(`本卦：${chart.primary.record.chineseName}（${attrOf(chart.primary)}）`)
  out.push(`变卦：${chart.result.record.chineseName}（${attrOf(chart.result)}）`)
  out.push('')
  out.push(...tableLines)
  out.push('')
  out.push('Binary:')
  out.push(`Primary: ${chart.primary.binary}`)
  out.push(`Mutation: ${bitsToString(chart.mutationMask)}`)
  out.push(`Result: ${chart.result.binary}`)
  out.push(`Engine: ${chart.ruleVersion}`)

  if (options.includeAiInstruction) {
    out.push('')
    out.push('请根据以上六爻排盘进行分析。')
  }

  return out.join('\n')
}
