import { useEffect, useState } from 'react'

const BOOT_LINES = [
  '系统初始化…',
  '历法同步…',
  '随机源就绪',
  '卦象映射已载入',
  '排盘引擎就绪',
]

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [lineCount, setLineCount] = useState(0)

  useEffect(() => {
    if (lineCount >= BOOT_LINES.length) {
      const t = setTimeout(onDone, 220)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setLineCount((c) => c + 1), lineCount === 0 ? 90 : 150)
    return () => clearTimeout(t)
  }, [lineCount, onDone])

  return (
    <div
      className="crt-power-on absolute inset-0 z-10 flex cursor-pointer flex-col justify-end bg-void p-6"
      onClick={onDone}
      role="status"
      aria-label="系统正在启动"
    >
      <div className="text-base leading-6 text-fog">
        {BOOT_LINES.slice(0, lineCount).map((line, i) => (
          <p key={i} className={i === BOOT_LINES.length - 1 ? 'caret text-signal' : ''}>
            {line}
          </p>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center">
        <span className="flicker-in text-4xl font-bold tracking-[0.3em] text-signal">HEX//64</span>
      </div>
    </div>
  )
}

/** 每个浏览器会话只播一次；动画关闭时直接跳过 */
export function useBootOnce(enabled: boolean): { booting: boolean; finish: () => void } {
  const [booting, setBooting] = useState(() => {
    if (!enabled) return false
    try {
      return !sessionStorage.getItem('hex64.booted')
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!booting) return
    try {
      sessionStorage.setItem('hex64.booted', '1')
    } catch {
      /* ignore */
    }
  }, [booting])

  return { booting, finish: () => setBooting(false) }
}
