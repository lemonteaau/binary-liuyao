/**
 * Web Audio 播放端：波形首次用到时合成并缓存，经声像与混响送到总线。
 * 只在用户打开音效后才被动态加载。
 */
import { LINE_NOTES, NOTE, bell, blip, chime, clink, ratchet, seeded, tap, thump, whoosh, wobble, zip } from './synth'

type Make = (sampleRate: number) => Float32Array

interface Voice {
  /** 相对现在延后的秒数 */
  delay?: number
  gain?: number
  pan?: number
  /** 送往混响的比例 */
  reverb?: number
  /** 从波形的第几秒开始放 */
  offset?: number
}

/** 三枚铜钱由左至右的声像 */
const COIN_PAN = [-0.55, 0, 0.55] as const
/** 转停波形的长度：铜钱在这一秒平躺 */
const WOBBLE_SPAN = 0.62
const FORMED_CHIMES = {
  coin: [NOTE.E5, NOTE.A5],
  derive: [NOTE.D5, NOTE.A5],
  entropy: [NOTE.E5, NOTE.A5],
} as const

export type FormedKind = keyof typeof FORMED_CHIMES

const coinBase = (coin: number) => 2800 + 220 * coin

export class SoundEngine {
  private readonly output: GainNode
  private readonly send: GainNode
  private readonly cache = new Map<string, AudioBuffer>()
  private readonly voices = new Set<AudioBufferSourceNode>()
  private readonly rand = seeded(Date.now())
  private rattle = 0

  constructor(private readonly ctx: AudioContext) {
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.ratio.value = 6
    limiter.connect(ctx.destination)
    this.output = ctx.createGain()
    this.output.gain.value = 0.75
    this.output.connect(limiter)
    const reverb = ctx.createConvolver()
    reverb.buffer = this.impulse(1.5)
    reverb.connect(this.output)
    this.send = ctx.createGain()
    this.send.connect(reverb)
  }

  /** 停下所有仍在发声或已排队的声音 */
  silence() {
    for (const voice of this.voices) {
      try {
        voice.stop()
      } catch {
        /* 尚未开始或已结束的声音忽略 */
      }
    }
    this.voices.clear()
  }

  tap() {
    this.play('tap', tap, { gain: 0.3, reverb: 0.15 })
  }

  /** 打开音效时的确认音 */
  preview() {
    this.play('preview', (sr) => chime(sr, [NOTE.A4, NOTE.E5]), { gain: 0.3, reverb: 0.5 })
  }

  /** 摇动中铜钱互撞 */
  coinClink() {
    for (let i = 0; i < 2; i++) {
      const k = this.rattle++ % 8
      this.play(`rattle-${k}`, (sr) => clink(sr, 200 + k, 3100 + 500 * (k % 3), 0.07, 0.4), {
        delay: i * 0.028,
        gain: 0.2 - i * 0.06,
        pan: (this.rand() - 0.5) * 0.6,
      })
    }
  }

  coinToss() {
    this.play('toss-air', (sr) => whoosh(sr, 0.5, 9), { gain: 0.28, reverb: 0.2 })
    this.play('toss-ring', (sr) => clink(sr, 77, 3400, 0.45, 2.2), { gain: 0.16, reverb: 0.5 })
  }

  /** 铜钱触地；bounce 为第几次触地（0 为落地），strength 为 0..1 的力度 */
  coinImpact(coin: number, bounce: number, strength: number) {
    const pan = COIN_PAN[coin] ?? 0
    const level = 0.55 + 0.45 * strength
    if (bounce === 0) {
      this.play(`land-${coin}`, (sr) => clink(sr, 10 + coin, 2700 + 250 * coin, 0.3, 1.3), { gain: 0.5 * level, pan, reverb: 0.25 })
    } else {
      this.play(`bounce-${coin}`, (sr) => clink(sr, 20 + coin, 2900 + 250 * coin, 0.2, 0.9), { gain: 0.3 * level, pan, reverb: 0.2 })
    }
  }

  /** 铜钱开始打转，seconds 秒后平躺 */
  coinWobble(coin: number, seconds: number) {
    if (seconds <= 0.05) return
    this.play(`wobble-${coin}`, (sr) => wobble(sr, coin + 1, WOBBLE_SPAN, coinBase(coin)), {
      delay: Math.max(0, seconds - WOBBLE_SPAN),
      offset: Math.max(0, WOBBLE_SPAN - seconds),
      gain: 0.42,
      pan: COIN_PAN[coin] ?? 0,
      reverb: 0.2,
    })
  }

  /** 铜钱平躺的最后一声 */
  coinSettle(coin: number) {
    this.play(`settle-${coin}`, (sr) => clink(sr, 99 + coin, coinBase(coin) * 0.82, 0.3, 1.2), {
      gain: 0.38,
      pan: COIN_PAN[coin] ?? 0,
      reverb: 0.2,
    })
  }

  lineFly(seconds: number) {
    this.play(`fly-${Math.round(seconds * 100)}`, (sr) => zip(sr, seconds), { gain: 0.12, pan: 0.3 })
  }

  /** 第 line 爻落入记录（0 为初爻） */
  lineLand(line: number) {
    const freq = LINE_NOTES[line] ?? NOTE.A4
    this.play(`line-${line}`, (sr) => bell(sr, freq), { gain: 0.3, pan: 0.35, reverb: 0.5 })
    this.play(`line-blip-${line}`, (sr) => blip(sr, freq * 4, 0.04, 0.012), { gain: 0.1, pan: 0.35 })
  }

  /** 卦成 */
  formed(kind: FormedKind) {
    this.play('thump', (sr) => thump(sr), { gain: 0.45 })
    this.play(`formed-${kind}`, (sr) => chime(sr, FORMED_CHIMES[kind]), { delay: 0.05, gain: 0.28, reverb: 0.6 })
  }

  /** 罗盘一个卦位转过盘顶 */
  dialTick(step: number) {
    const k = step % 14
    this.play(`ratchet-${k}`, (sr) => ratchet(sr, k, 1400 + 30 * k), { gain: 0.2, pan: 0.25 * Math.sin(step) })
  }

  /** 自初爻数到动爻，第 line 下 */
  dialCount(line: number) {
    this.play(`count-${line}`, (sr) => blip(sr, 880 * 2 ** (line / 6), 0.03, 0.01), { gain: 0.14 })
  }

  /** 上卦、下卦、动爻依次得出 */
  dialLock(step: number) {
    const freq = [NOTE.E4, NOTE.G4, NOTE.A4][step] ?? NOTE.A4
    this.play('lock', (sr) => clink(sr, 50, 1900, 0.12, 0.5), { gain: 0.26, reverb: 0.2 })
    this.play(`lock-bell-${step}`, (sr) => bell(sr, freq), { gain: 0.3, reverb: 0.5 })
  }

  /** 电脑起卦取定一个随机位 */
  bit() {
    const k = Math.floor(this.rand() * 3)
    this.play(`bit-${k}`, (sr) => blip(sr, [2093, 2637, 3136][k]!, 0.035, 0.009), { gain: 0.13, pan: (this.rand() - 0.5) * 1.4 })
  }

  /** 电脑起卦凝成第 line 爻 */
  entropyLine(line: number) {
    this.play('condense', (sr) => whoosh(sr, 0.16, 40, [2000, 7000], [300, 900]), { gain: 0.2 })
    this.play(`line-${line}`, (sr) => bell(sr, LINE_NOTES[line] ?? NOTE.A4), { delay: 0.08, gain: 0.28, reverb: 0.5 })
  }

  /** 进入排盘结果 */
  transition() {
    this.play('transition', (sr) => whoosh(sr, 0.45, 51), { gain: 0.22, reverb: 0.3 })
  }

  private play(key: string, make: Make, { delay = 0, gain = 1, pan = 0, reverb = 0, offset = 0 }: Voice = {}) {
    const { ctx } = this
    const source = ctx.createBufferSource()
    source.buffer = this.buffer(key, make)
    const level = ctx.createGain()
    level.gain.value = gain
    source.connect(level)
    let node: AudioNode = level
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner()
      panner.pan.value = pan
      node = level.connect(panner)
    }
    node.connect(this.output)
    if (reverb) {
      const wet = ctx.createGain()
      wet.gain.value = reverb
      node.connect(wet).connect(this.send)
    }
    this.voices.add(source)
    source.onended = () => this.voices.delete(source)
    source.start(ctx.currentTime + delay, offset)
  }

  private buffer(key: string, make: Make): AudioBuffer {
    const cached = this.cache.get(key)
    if (cached) return cached
    const data = make(this.ctx.sampleRate)
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate)
    buffer.getChannelData(0).set(data)
    this.cache.set(key, buffer)
    return buffer
  }

  /** 双声道指数衰减噪声，逐渐变暗，作为混响的冲激响应 */
  private impulse(seconds: number): AudioBuffer {
    const { sampleRate } = this.ctx
    const length = Math.round(sampleRate * seconds)
    const buffer = this.ctx.createBuffer(2, length, sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const rand = seeded(7 + channel)
      const data = buffer.getChannelData(channel)
      let smooth = 0
      let energy = 0
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate
        const darken = 0.25 + 0.7 * Math.exp(-t / 0.4)
        smooth += ((rand() * 2 - 1) - smooth) * darken
        data[i] = smooth * Math.exp((-6.9 * t) / seconds)
        energy += data[i]! ** 2
      }
      const norm = 1 / Math.sqrt(energy)
      for (let i = 0; i < length; i++) data[i]! *= norm
    }
    return buffer
  }
}
