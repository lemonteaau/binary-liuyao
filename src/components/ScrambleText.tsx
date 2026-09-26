import { useEffect, useState } from 'react'
import { motionEnabled } from '@/lib/motion'

const GLYPHS = '乾坤震巽坎离艮兑天地雷风水火山泽阴阳动静爻卦'

function scrambled(text: string, resolved: number): string {
  return [...text]
    .map((char, index) =>
      index < resolved || char === ' ' || char === '·'
        ? char
        : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    )
    .join('')
}

/** 终端式解码：先滚动随机卦字，再自左向右定格为原文 */
export function ScrambleText({
  text,
  className,
  delay = 0,
  duration = 520,
}: {
  text: string
  className?: string
  delay?: number
  duration?: number
}) {
  const [frame, setFrame] = useState<string | null>(() =>
    motionEnabled() ? scrambled(text, 0) : null,
  )

  useEffect(() => {
    if (!motionEnabled()) return
    const length = [...text].length
    const start = performance.now() + delay
    let last = 0
    let raf = window.requestAnimationFrame(function tick(now) {
      const progress = (now - start) / duration
      if (progress >= 1) {
        setFrame(null)
        return
      }
      // 约 22 fps 换字，保留终端刷新的颗粒感
      if (now - last > 45) {
        last = now
        setFrame(scrambled(text, Math.floor(Math.max(0, progress) * (length + 1))))
      }
      raf = window.requestAnimationFrame(tick)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [text, delay, duration])

  return <span className={className}>{frame ?? text}</span>
}
