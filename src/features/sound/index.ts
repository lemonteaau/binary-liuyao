/**
 * 起卦音效的开关与入口，默认关闭。
 * 打开后才创建 AudioContext，并按需加载合成与播放代码；关闭时所有调用都是空操作。
 * 浏览器只允许在用户操作后发声：页面加载时音效已开，就等第一次点按或按键再启动。
 */
import type { FormedKind, SoundEngine } from './engine'

export type { FormedKind }

const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const
/** 刚请求恢复的 AudioContext 视为可用，免得点按当下的第一声被吞掉 */
const RESUME_GRACE_MS = 400

let enabled = false
let context: AudioContext | null = null
let engine: SoundEngine | null = null
let loading: Promise<void> | null = null
let resumedAt = -Infinity
let armed = false

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return window.AudioContext ?? legacy ?? null
}

/** 创建或恢复 AudioContext；须在用户操作的回调里调用 */
function start() {
  if (!enabled) return
  if (!context) {
    const Context = audioContextClass()
    if (!Context) return
    try {
      context = new Context()
    } catch {
      return
    }
  }
  const ctx = context
  if (ctx.state !== 'running') {
    resumedAt = performance.now()
    ctx.resume().then(() => {
      if (ctx.state === 'running') disarm()
    }, () => undefined)
  } else {
    disarm()
  }
  if (!engine && !loading) {
    loading = import('./engine')
      .then(({ SoundEngine }) => {
        if (context === ctx) engine = new SoundEngine(ctx)
      })
      .catch(() => undefined)
      .finally(() => {
        loading = null
      })
  }
}

function onGesture() {
  start()
}

function arm() {
  if (armed || typeof document === 'undefined') return
  armed = true
  for (const type of GESTURES) document.addEventListener(type, onGesture, { capture: true, passive: true })
}

function disarm() {
  if (!armed) return
  armed = false
  for (const type of GESTURES) document.removeEventListener(type, onGesture, { capture: true })
}

/** 跟随设置开关；打开后在下一次用户操作时启动 */
export function setSoundEnabled(on: boolean) {
  enabled = on
  if (on) {
    if (context?.state !== 'running') arm()
    return
  }
  disarm()
  engine?.silence()
  if (context?.state === 'running') void context.suspend().catch(() => undefined)
}

/** 在设置页点“开”的当下调用：立即启动并放一声确认音 */
export function enableSoundNow() {
  enabled = true
  start()
  cue((e) => e.preview())
}

function ready(): SoundEngine | null {
  if (!enabled || !engine || !context) return null
  const running = context.state === 'running' || performance.now() - resumedAt < RESUME_GRACE_MS
  return running ? engine : null
}

/** 引擎还在加载时，这么久以内的提示音等加载完再补上，再晚就不放了 */
const LATE_CUE_MS = 500

function cue(play: (engine: SoundEngine) => void) {
  if (enabled && !engine && loading) {
    const asked = performance.now()
    void loading.then(() => {
      if (performance.now() - asked < LATE_CUE_MS) cue(play)
    })
    return
  }
  const e = ready()
  if (!e) return
  try {
    play(e)
  } catch {
    /* 声音出错不影响起卦 */
  }
}

export const sound = {
  tap: () => cue((e) => e.tap()),
  coinClink: () => cue((e) => e.coinClink()),
  coinToss: () => cue((e) => e.coinToss()),
  coinImpact: (coin: number, bounce: number, strength: number) => cue((e) => e.coinImpact(coin, bounce, strength)),
  coinWobble: (coin: number, seconds: number) => cue((e) => e.coinWobble(coin, seconds)),
  coinSettle: (coin: number) => cue((e) => e.coinSettle(coin)),
  lineFly: (seconds: number) => cue((e) => e.lineFly(seconds)),
  lineLand: (line: number) => cue((e) => e.lineLand(line)),
  formed: (kind: FormedKind) => cue((e) => e.formed(kind)),
  dialTick: (step: number) => cue((e) => e.dialTick(step)),
  dialCount: (line: number) => cue((e) => e.dialCount(line)),
  dialLock: (step: number) => cue((e) => e.dialLock(step)),
  bit: () => cue((e) => e.bit()),
  entropyLine: (line: number) => cue((e) => e.entropyLine(line)),
  transition: () => cue((e) => e.transition()),
  /** 跳过或重置动画时，掐掉已排队的声音 */
  silence: () => engine?.silence(),
}
