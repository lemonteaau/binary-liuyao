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
    const parsed = parseShareLink(new URLSearchParams(url.hash.split('?')[1]))

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

  it('继续接受旧版两参数链接', () => {
    const parsed = parseShareLink(new URLSearchParams('s=101010&m=001000'))

    expect(parsed).toEqual({ primary: 42, mask: 8 })
  })

  it('忽略被篡改的可选元数据', () => {
    const parsed = parseShareLink(new URLSearchParams(
      's=101010&m=001000&t=not-a-time&z=Invalid%2FZone&i=unknown&r=oops&o=-1',
    ))

    expect(parsed).toEqual({ primary: 42, mask: 8 })
  })
})
