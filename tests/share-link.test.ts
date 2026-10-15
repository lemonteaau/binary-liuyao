import { describe, expect, it } from 'vitest'
import { generateChart } from '@/engine'
import { buildShareUrl, parseShareLink } from '@/lib/share-link'

describe('分享链接', () => {
  it('保留完整排盘所需的时间、时区、起卦方式与记录信息', () => {
    const original = generateChart({
      inputMethod: 'coin',
      rawLines: [6, 9, 8, 8, 7, 8],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })

    const url = new URL(buildShareUrl(original, 'https://example.com/app/', {
      readingId: 'A1B2C3',
      ordinal: 864,
    }))
    expect(url.pathname).toBe('/app/result')
    expect(url.search).toBe('')
    const parsed = parseShareLink(new URLSearchParams(url.hash.slice(1)))

    expect(parsed).toMatchObject({
      primary: original.primary.bits,
      mask: original.mutationMask,
      timezone: 'Asia/Shanghai',
      inputMethod: 'coin',
      readingId: 'A1B2C3',
      ordinal: 864,
    })
    expect(parsed?.when?.toISOString()).toBe('2026-08-24T06:42:37.000Z')

    const restored = generateChart({
      inputMethod: parsed!.inputMethod!,
      rawLines: [6, 9, 8, 8, 7, 8],
      when: parsed!.when,
      timezone: parsed!.timezone,
    })
    expect(restored).toEqual(original)
  })

  it('可选带上所问之事，解析时去掉首尾空白并限制长度', () => {
    const chart = generateChart({
      inputMethod: 'coin',
      rawLines: [6, 9, 8, 8, 7, 8],
      when: new Date('2026-08-24T14:42:37+08:00'),
      timezone: 'Asia/Shanghai',
    })
    const parse = (url: string) => parseShareLink(new URLSearchParams(new URL(url).hash.slice(1)))

    const withQuestion = buildShareUrl(chart, 'https://example.com/', { question: '  面试能否通过 & 何时有结果  ' })
    expect(new URL(withQuestion).search).toBe('')
    expect(parse(withQuestion)?.question).toBe('面试能否通过 & 何时有结果')

    expect(parse(buildShareUrl(chart, 'https://example.com/', { question: '   ' }))).not.toHaveProperty('question')
    expect(parseShareLink(new URLSearchParams(`s=101010&m=001000&q=${'问'.repeat(300)}`))?.question)
      .toHaveLength(200)
  })

  it('继续接受旧版两参数链接', () => {
    const parsed = parseShareLink(new URLSearchParams('s=101010&m=001000'))

    expect(parsed).toEqual({ primary: 42, mask: 8 })
  })

  it('接受汉字起卦方式元数据', () => {
    const parsed = parseShareLink(new URLSearchParams('s=101010&m=001000&i=hanzi'))

    expect(parsed?.inputMethod).toBe('hanzi')
  })

  it('忽略被篡改的可选元数据', () => {
    const parsed = parseShareLink(new URLSearchParams(
      's=101010&m=001000&t=not-a-time&z=Invalid%2FZone&i=unknown&r=oops&o=-1',
    ))

    expect(parsed).toEqual({ primary: 42, mask: 8 })
  })
})
