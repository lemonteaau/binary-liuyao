import { cn } from '@/lib/cn'

interface HexLinesProps {
  /** 6-bit，bit0 = 初爻 */
  bits: number
  /** 可选动爻掩码 */
  mask?: number
  /** 爻位标签 L1..L6 */
  showLabels?: boolean
  compact?: boolean
}

export function HexLines({
  bits,
  mask = 0,
  showLabels = true,
  compact = false,
}: HexLinesProps) {
  const rows = [5, 4, 3, 2, 1, 0]

  return (
    <div
      className={cn('flex flex-col', compact ? 'gap-[6px]' : 'gap-[10px]')}
      role="img"
      aria-label={ariaLabel(bits, mask)}
    >
      {rows.map((i) => {
        const yang = (bits >> i) & 1
        const mutating = (mask >> i) & 1

        return (
          <div
            key={i}
            className={cn(
              'hex-line flex items-center',
              compact ? 'gap-2' : 'gap-3',
              mutating ? 'mutating' : null,
            )}
          >
            {showLabels && (
              <span className="w-10 shrink-0 text-right text-[14px] text-fog sm:w-16">L{i + 1}</span>
            )}
            <div className={cn('flex flex-1 gap-[14%]', mutating ? 'flux-pulse' : null)}>
              {yang ? (
                <div className="hex-bar w-full" />
              ) : (
                <>
                  <div className="hex-bar w-[43%]" />
                  <div className="hex-bar w-[43%]" />
                </>
              )}
            </div>
            {mutating ? (
              <span className="w-10 shrink-0 text-[14px] font-bold text-flux sm:w-16">
                <span className="sm:hidden">◉ 动</span>
                <span className="hidden tracking-widest sm:inline">◉ 翻转</span>
              </span>
            ) : showLabels ? (
              <span className="w-10 shrink-0 sm:w-16" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ariaLabel(bits: number, mask: number): string {
  const parts: string[] = []
  for (let i = 5; i >= 0; i--) {
    const yang = (bits >> i) & 1
    const mutating = (mask >> i) & 1
    parts.push(`第 ${i + 1} 爻：${yang ? '阳' : '阴'}${mutating ? '，动爻' : ''}`)
  }
  return parts.join('; ')
}
