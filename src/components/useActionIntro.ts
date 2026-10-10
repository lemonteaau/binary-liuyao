import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { actionIntroRetired } from '@/lib/action-intro'
import type { ActionIntroGroup } from '@/lib/action-intro'
import { motionEnabled } from '@/lib/motion'

const DELAY_MS = 320
const DURATION_MS = 1850
/** 在舞台中央停留到整段时长的这个比例，再收回操作栏 */
const HOLD_UNTIL = 0.56
const MAX_SCALE = 1.35

/**
 * 可以起卦时，把操作提示先略微放大、衬成一块按钮显示在舞台中央，再缩回操作栏原位：
 * 让第一次来的人一眼看出“点这里开始”，也看清这行字平时待在哪里。同一种舞台用熟之后不再出现。
 */
export function useActionIntro(
  labelRef: RefObject<HTMLElement | null>,
  group: ActionIntroGroup,
  ready: boolean,
  delay = DELAY_MS,
) {
  // 每次打开面板只完整演一遍：输入框里改来改去不会反复弹出
  const playedRef = useRef(false)

  useEffect(() => {
    const label = labelRef.current
    const stage = label?.closest('.coin-console')?.querySelector('.coin-stage')
    if (!ready || playedRef.current || !label || !stage) return
    if (!motionEnabled() || typeof label.animate !== 'function' || actionIntroRetired(group)) return
    const from = stage.getBoundingClientRect()
    const to = label.getBoundingClientRect()
    if (!from.width || !from.height || !to.width || !to.height) return

    const scale = Math.max(1, Math.min(MAX_SCALE, (from.width * 0.7) / to.width, (from.height * 0.3) / to.height))
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    const centered = `translate(${dx}px, ${dy}px)`
    const plate = {
      backgroundColor: 'rgba(4, 8, 7, 0.88)',
      outlineColor: 'rgba(61, 245, 198, 0.75)',
      boxShadow: '0 0 26px rgba(61, 245, 198, 0.28)',
    }
    const bare = {
      backgroundColor: 'rgba(4, 8, 7, 0)',
      outlineColor: 'rgba(61, 245, 198, 0)',
      boxShadow: '0 0 0 rgba(61, 245, 198, 0)',
    }
    const animation = label.animate(
      [
        { ...plate, opacity: 0, transform: `${centered} scale(${scale * 1.12})`, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { ...plate, opacity: 1, transform: `${centered} scale(${scale})`, offset: 0.14 },
        { ...plate, opacity: 1, transform: `${centered} scale(${scale})`, offset: HOLD_UNTIL, easing: 'cubic-bezier(0.65, 0, 0.2, 1)' },
        { ...bare, opacity: 1, transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: DURATION_MS, delay, fill: 'backwards' },
    )
    // 落回操作栏时整条闪一下，把视线留在那里
    const bar = label.parentElement
    animation.finished
      .then(() => {
        playedRef.current = true
        return bar?.animate(
          [{ backgroundColor: 'rgba(61, 245, 198, 0.22)' }, { backgroundColor: 'rgba(61, 245, 198, 0)' }],
          { duration: 700, easing: 'ease-out' },
        )
      })
      .catch(() => undefined)

    return () => animation.cancel()
  }, [labelRef, group, ready, delay])
}
