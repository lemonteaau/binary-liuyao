import { useState } from 'react'
import { cn } from '@/lib/cn'
import {
  createReadingShareImage,
  shareOrDownloadImage,
} from '@/lib/share-image'
import type { ChartData } from '@/types'

type ExportState = 'idle' | 'rendering' | 'shared' | 'downloaded' | 'failed'

export function ShareImageButton({
  chart,
  sessionId,
  ordinal,
  className,
}: {
  chart: ChartData
  sessionId?: string
  ordinal?: number | null
  className?: string
}) {
  const [state, setState] = useState<ExportState>('idle')

  async function exportImage() {
    if (state === 'rendering') return
    setState('rendering')
    try {
      const blob = await createReadingShareImage(chart, { sessionId, ordinal })
      const filename = shareImageFilename(chart)
      const result = await shareOrDownloadImage(blob, filename)
      setState(result === 'cancelled' ? 'idle' : result)
    } catch {
      setState('failed')
    }
    window.setTimeout(() => {
      setState((current) => (current === 'rendering' ? current : 'idle'))
    }, 2_000)
  }

  const label = state === 'rendering'
    ? '正在生成…'
    : state === 'shared'
      ? '已分享 ✓'
      : state === 'downloaded'
        ? '已导出 ✓'
        : state === 'failed'
          ? '导出失败'
          : '导出分享图'

  return (
    <button
      type="button"
      className={cn('btn btn-primary', className)}
      onClick={exportImage}
      disabled={state === 'rendering'}
      aria-live="polite"
    >
      <ShareImageIcon />
      <span>{label}</span>
    </button>
  )
}

function ShareImageIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[1em] fill-none stroke-current"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <rect x="3" y="5" width="18" height="15" />
      <path d="m6 16 4-4 3 3 2-2 3 3" />
      <path d="M12 3v8M9 6l3-3 3 3" />
    </svg>
  )
}

function shareImageFilename(chart: ChartData): string {
  const date = chart.calendar.gregorian.slice(0, 10).replaceAll('-', '')
  return `liuyao-${chart.primary.record.chineseName}-${date}.png`
}
