import { describe, expect, it } from 'vitest'
import { enableSoundNow, setSoundEnabled, sound } from '@/features/sound'
import { LINE_NOTES, bell, blip, chime, clink, ratchet, seeded, tap, thump, whoosh, wobble, zip } from '@/features/sound/synth'

const SR = 48000

function stats(wave: Float32Array) {
  let peak = 0
  let energy = 0
  for (const v of wave) {
    expect(Number.isFinite(v)).toBe(true)
    peak = Math.max(peak, Math.abs(v))
    energy += v * v
  }
  return { peak, rms: Math.sqrt(energy / wave.length) }
}

describe('音效合成', () => {
  const waves: Record<string, Float32Array> = {
    tap: tap(SR),
    clink: clink(SR, 1),
    wobble: wobble(SR, 1, 0.62, 2800),
    whoosh: whoosh(SR, 0.5, 9),
    zip: zip(SR, 0.62),
    bell: bell(SR, LINE_NOTES[0]),
    chime: chime(SR, [659.26, 880]),
    blip: blip(SR, 2093),
    ratchet: ratchet(SR, 3, 1400),
    thump: thump(SR),
  }

  // Web Audio 是浮点流水线，单个波形略超 1 不会削波；响度由各提示音的增益和总线上的限幅器控制
  it.each(Object.keys(waves))('%s 有声、峰值有界、首尾不爆音', (name) => {
    const wave = waves[name]!
    const { peak, rms } = stats(wave)
    expect(rms).toBeGreaterThan(1e-4)
    expect(peak).toBeLessThan(1.5)
    expect(Math.abs(wave[0]!)).toBeLessThan(0.05)
    expect(Math.abs(wave[wave.length - 1]!)).toBeLessThan(0.05)
  })

  it('同一种子得到同一波形，按采样率决定长度', () => {
    expect(clink(SR, 5)).toEqual(clink(SR, 5))
    expect(clink(SR, 5)).not.toEqual(clink(SR, 6))
    expect(clink(44100, 5, 2900, 0.3).length).toBe(13230)
    expect(seeded(1)()).toBe(seeded(1)())
  })

  it('转停波形越到后面碰撞越密、越响', () => {
    const wave = wobble(SR, 2, 0.62, 2800)
    const level = (from: number, to: number) => stats(wave.subarray(Math.round(from * SR), Math.round(to * SR))).rms
    expect(level(0.45, 0.6)).toBeGreaterThan(level(0, 0.15))
  })
})

describe('音效开关', () => {
  it('没有 Web Audio 的环境下开关与各个提示音都是空操作', () => {
    setSoundEnabled(true)
    enableSoundNow()
    expect(() => {
      sound.tap()
      sound.coinImpact(0, 0, 1)
      sound.coinWobble(2, 0.5)
      sound.lineLand(5)
      sound.formed('coin')
      sound.silence()
    }).not.toThrow()
    setSoundEnabled(false)
  })
})
