import type { Branch, ChartData, ShenShaEntry } from '@/types'

/** 结果页与分享图共用的爻位名称，自初爻至上爻 */
export const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const

const LINE_SHORT_NAMES = ['初', '二', '三', '四', '五', '上'] as const

/** 地支是否落在日旬空亡。只做事实标注，不判吉凶。 */
export function isXunKong(chart: ChartData, branch: Branch): boolean {
  return chart.calendar.xunKong.includes(branch)
}

/**
 * 神煞地支在卦中所临之处：本卦六爻、伏神、动爻化出的变爻，
 * 如“初、三爻 · 三爻伏神 · 二爻变”；卦中都没有时返回 null。
 */
export function shenshaPosition(entry: ShenShaEntry, chart: ChartData): string | null {
  const matches = (branch: Branch) => entry.branches.includes(branch)
  const byIndex = <T extends { index: number }>(items: T[]) => [...items].sort((a, b) => a.index - b.index)
  const parts: string[] = []

  const onLines = byIndex(chart.lines).filter((line) => matches(line.primary.najia.branch))
  if (onLines.length > 0) {
    parts.push(`${onLines.map((line) => LINE_SHORT_NAMES[line.index]).join('、')}爻`)
  }
  for (const fuShen of byIndex(chart.fuShen)) {
    if (matches(fuShen.najia.branch)) parts.push(`${LINE_NAMES[fuShen.index]}伏神`)
  }
  for (const line of byIndex(chart.lines)) {
    if (line.mutating && matches(line.result.najia.branch)) parts.push(`${LINE_NAMES[line.index]}变`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}
