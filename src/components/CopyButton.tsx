import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CopyButtonProps {
  label: string
  getText: () => string
  variant?: 'primary' | 'default'
  className?: string
  onCopied?: () => void
  children?: ReactNode
}

type CopyState = 'idle' | 'ok' | 'fail'

export function CopyButton({
  label,
  getText,
  variant = 'default',
  className,
  onCopied,
  children,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const [fallbackText, setFallbackText] = useState<string | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
  }, [])

  async function copy() {
    const text = getText()
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setState('ok')
      setFallbackText(null)
      onCopied?.()
    } catch {
      setState('fail')
      setFallbackText(text)
    }
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null
      setState((current) => (current === 'ok' ? 'idle' : current))
    }, 1600)
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={cn('btn', variant === 'primary' && 'btn-primary', className)}
        aria-live="polite"
      >
        {state === 'ok' ? '[ 已复制 ✓ ]' : state === 'fail' ? '[ 复制失败 ]' : (children ?? label)}
      </button>
      {state === 'fail' && fallbackText !== null && (
        <div className="panel p-3" role="alert">
          <p className="mb-2 text-[0.9375rem] tracking-widest text-flux">
            复制失败 // 请手动选择文本
          </p>
          <textarea
            readOnly
            value={fallbackText}
            onFocus={(e) => e.currentTarget.select()}
            rows={8}
            className="w-full resize-y border border-edge bg-void p-2 font-mono text-[0.9375rem] leading-relaxed text-ink"
          />
        </div>
      )}
    </>
  )
}
