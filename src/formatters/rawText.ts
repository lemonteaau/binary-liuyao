import type { ChartData } from '@/types'
import { INPUT_METHOD_LABELS } from '@/engine'

export interface RawTextOptions {
  /** 末尾附加「请根据以上六爻排盘进行分析。」 */
  includeAiInstruction: boolean
}

const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const

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

  // 各爻逐条描述（自上爻至初爻），纯文本、非表格
  const lineLines: string[] = []
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    const p = line.primary
    const parts: string[] = []
    if (p.spirit) parts.push(p.spirit)
    parts.push(`${p.relation}${p.najia.stem}${p.najia.branch}${p.najia.element}`)
    const fu = chart.fuShen.find((f) => f.index === i)
    if (fu) {
      parts.push(`伏神${fu.relation}${fu.najia.stem}${fu.najia.branch}${fu.najia.element}`)
    }
    if (p.shiYing) parts.push(p.shiYing)
    parts.push(line.yang ? (line.mutating ? '老阳动' : '少阳') : (line.mutating ? '老阴动' : '少阴'))
    if (line.mutating) {
      const r = line.result
      parts.push('变')
      parts.push(`${r.relation}${r.najia.stem}${r.najia.branch}${r.najia.element}`)
    }
    lineLines.push(`${LINE_NAMES[i]}：${parts.join(' ')}`)
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
  out.push('卦爻：')
  out.push(...lineLines)

  if (options.includeAiInstruction) {
    out.push('')
    out.push('请根据以上六爻排盘进行分析。')
  }

  return out.join('\n')
}
