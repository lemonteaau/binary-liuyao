import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { claimSupportNudge, recordSupportClick } from '@/lib/support-nudge'
import type { SupportNudgeKind } from '@/lib/support-nudge'

const ENTRY_LABELS: Record<SupportNudgeKind, string> = {
  outcome: '应验记录',
  milestone: '排盘里程碑',
  ordinal: '起卦序号',
  'ai-guide': 'AI教程',
  export: '导出备份',
}

/** 一行不打断操作的打赏提示；是否出现由 claimSupportNudge 统一限频。 */
export function SupportNudge({
  kind,
  occurrence,
  children,
  className = '',
}: {
  kind: SupportNudgeKind
  occurrence: string
  children: ReactNode
  className?: string
}) {
  const [visible] = useState(() => claimSupportNudge(kind, occurrence))
  if (!visible) return null

  return (
    <p className={`support-nudge ${className}`}>
      {children}
      <Link
        to="/about?support=1"
        className="support-nudge-link"
        onClick={() => recordSupportClick(ENTRY_LABELS[kind])}
      >
        支持作者 →
      </Link>
    </p>
  )
}
