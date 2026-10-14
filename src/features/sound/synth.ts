/**
 * 起卦音效的波形合成：纯函数，按采样率生成单声道波形，不依赖 Web Audio，可在测试中直接运行。
 * 铜钱用非谐泛音叠加；欧拉盘收尾是越来越密的碰撞；成卦用五声音阶的钟音。
 */

export const NOTE = {
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392,
  A4: 440,
  D5: 587.33,
  E5: 659.26,
  A5: 880,
} as const

/** 初爻到上爻依次升高的五声音阶 */
export const LINE_NOTES = [NOTE.A3, NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4] as const

/** 可复现的伪随机数（mulberry32） */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const frames = (sr: number, seconds: number) => Math.max(1, Math.round(sr * seconds))

function noise(sr: number, seconds: number, seed: number): Float32Array {
  const rand = seeded(seed)
  const out = new Float32Array(frames(sr, seconds))
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1
  return out
}

/** 频率随时间变化的正弦；freq 为起止频率时按几何级数滑音 */
function tone(sr: number, seconds: number, freq: number | readonly [number, number]): Float32Array {
  const n = frames(sr, seconds)
  const out = new Float32Array(n)
  const [from, to] = typeof freq === 'number' ? [freq, freq] : freq
  let phase = 0
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(phase)
    phase += (2 * Math.PI * from * (to / from) ** (i / n)) / sr
  }
  return out
}

/** RBJ 双二阶滤波 */
function filter(x: Float32Array, sr: number, type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q = Math.SQRT1_2): Float32Array {
  const w = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  let b0: number
  let b1: number
  let b2: number
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2
    b1 = 1 - cos
    b2 = b0
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = b0
  } else {
    b0 = alpha
    b1 = 0
    b2 = -alpha
  }
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  const out = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1
    x1 = x[i]!
    y2 = y1
    y1 = y
    out[i] = y
  }
  return out
}

function band(x: Float32Array, sr: number, low: number, high: number): Float32Array {
  const center = Math.sqrt(low * high)
  return filter(x, sr, 'bandpass', center, center / (high - low))
}

/** 指数衰减包络，原地相乘 */
function decay(x: Float32Array, sr: number, tau: number, gain = 1): Float32Array {
  for (let i = 0; i < x.length; i++) x[i]! *= gain * Math.exp(-i / (sr * tau))
  return x
}

/** 首尾短淡入淡出，防止爆音 */
function edges(x: Float32Array, sr: number, fadeIn = 0.001, fadeOut = 0.008): Float32Array {
  const a = Math.min(frames(sr, fadeIn), x.length >> 1)
  const b = Math.min(frames(sr, fadeOut), x.length >> 1)
  for (let i = 0; i < a; i++) x[i]! *= i / a
  for (let i = 0; i < b; i++) x[x.length - 1 - i]! *= i / b
  return x
}

function mixInto(target: Float32Array, source: Float32Array, at: number, gain = 1) {
  const end = Math.min(target.length, at + source.length)
  for (let i = Math.max(0, at); i < end; i++) target[i]! += source[i - at]! * gain
}

/** 界面点按 */
export function tap(sr: number): Float32Array {
  const out = decay(tone(sr, 0.03, 1800), sr, 0.007, 0.8)
  mixInto(out, filter(noise(sr, 0.004, 1), sr, 'highpass', 3000), 0, 0.6)
  return edges(out, sr, 0.0005, 0.004)
}

/** 一记铜钱撞击：五个非谐泛音，ring 越大余音越长 */
export function clink(sr: number, seed: number, base = 2900, seconds = 0.3, ring = 1): Float32Array {
  const rand = seeded(seed)
  const root = base * (0.94 + rand() * 0.12)
  const partials = [
    [1, 1, 0.09],
    [1.47, 0.7, 0.07],
    [2.09, 0.55, 0.05],
    [2.56, 0.4, 0.04],
    [3.61, 0.3, 0.03],
  ] as const
  const out = new Float32Array(frames(sr, seconds))
  for (const [ratio, amp, tau] of partials) {
    const partial = decay(tone(sr, seconds, root * ratio * (0.99 + rand() * 0.02)), sr, tau * ring, amp / 3)
    mixInto(out, partial, 0)
  }
  mixInto(out, filter(noise(sr, 0.002, seed + 7), sr, 'highpass', 4000), 0, 0.5)
  return edges(out, sr, 0.0005, 0.01)
}

/**
 * 欧拉盘式的转停：碰撞越来越密，到 span 秒处戛然而止。
 * 波形的第 span 秒对应铜钱平躺的瞬间，播放时据此对齐。
 */
export function wobble(sr: number, seed: number, span: number, base: number): Float32Array {
  const out = new Float32Array(frames(sr, span + 0.06))
  let t = 0
  let gap = 0.085
  let k = 0
  while (t < span) {
    mixInto(out, clink(sr, seed * 31 + k, base, 0.05, 0.35), Math.round(t * sr), 0.35 + (0.4 * t) / span)
    gap = Math.max(0.013, gap * 0.86)
    t += gap
    k++
  }
  return out
}

/** 气流声：两段带通噪声交叉渐变，rise 为由低到高 */
export function whoosh(
  sr: number,
  seconds: number,
  seed: number,
  low: readonly [number, number] = [300, 900],
  high: readonly [number, number] = [1800, 6000],
  rise = true,
): Float32Array {
  const source = noise(sr, seconds, seed)
  const a = band(source, sr, low[0], low[1])
  const b = band(source, sr, high[0], high[1])
  const out = new Float32Array(source.length)
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length
    const m = rise ? p : 1 - p
    out[i] = (a[i]! * (1 - m) + b[i]! * m) * Math.sin(Math.PI * p) ** 2
  }
  return out
}

/** 爻线飞入记录时的上滑音 */
export function zip(sr: number, seconds: number): Float32Array {
  const out = tone(sr, seconds, [500, 1500])
  const air = band(noise(sr, seconds, 3), sr, 1500, 5000)
  for (let i = 0; i < out.length; i++) {
    out[i] = (out[i]! * 0.6 + air[i]! * 0.25) * Math.sin((Math.PI * i) / out.length) ** 1.4
  }
  return out
}

/** 钟音：非谐泛音，高泛音衰减更快 */
export function bell(sr: number, freq: number, seconds = 0.9, tau = 0.45): Float32Array {
  const ratios = [1, 2, 2.76, 5.4, 8.93]
  const amps = [1, 0.6, 0.4, 0.25, 0.12]
  const total = amps.reduce((sum, amp) => sum + amp, 0)
  const out = new Float32Array(frames(sr, seconds))
  ratios.forEach((ratio, i) => {
    mixInto(out, decay(tone(sr, seconds, freq * ratio), sr, tau / ratio ** 0.7, amps[i]! / total), 0)
  })
  return edges(out, sr, 0.002, 0.02)
}

/** 先后敲响的几个钟音 */
export function chime(sr: number, notes: readonly number[], seconds = 1.3, gap = 0.09): Float32Array {
  const out = new Float32Array(frames(sr, seconds + gap * notes.length))
  notes.forEach((freq, i) => mixInto(out, bell(sr, freq, seconds, 0.7), Math.round(i * gap * sr)))
  return out
}

/** 短促的提示音 */
export function blip(sr: number, freq: number, seconds = 0.05, tau = 0.015): Float32Array {
  const out = decay(tone(sr, seconds, freq), sr, tau)
  mixInto(out, decay(tone(sr, seconds, freq * 2), sr, tau * 0.6, 0.3), 0)
  return edges(out, sr, 0.001, 0.005)
}

/** 罗盘转过一个卦位的棘轮声 */
export function ratchet(sr: number, seed: number, freq: number): Float32Array {
  const out = decay(band(noise(sr, 0.012, seed), sr, 1800, 5000), sr, 0.003)
  mixInto(out, decay(tone(sr, 0.012, freq), sr, 0.003, 0.5), 0)
  return edges(out, sr, 0.0005, 0.002)
}

/** 下沉的低频重音 */
export function thump(sr: number, seconds = 0.7, from = 62, to = 34): Float32Array {
  return edges(decay(tone(sr, seconds, [from, to]), sr, 0.22), sr, 0.002, 0.05)
}
