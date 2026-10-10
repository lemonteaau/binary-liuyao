// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  ACTION_INTRO_MAX_READINGS,
  ACTION_INTRO_STORAGE_KEY,
  actionIntroGroupOf,
  actionIntroRetired,
  recordActionIntroReading,
  syncActionIntroReadings,
} from '@/lib/action-intro'

afterEach(() => localStorage.clear())

describe('起卦引导的退场', () => {
  it('数字、时间、汉字共用罗盘；摇币与电脑起卦各算各的；录入类方式没有引导', () => {
    expect(actionIntroGroupOf('number')).toBe('derive')
    expect(actionIntroGroupOf('time')).toBe('derive')
    expect(actionIntroGroupOf('hanzi')).toBe('derive')
    expect(actionIntroGroupOf('coin')).toBe('coin')
    expect(actionIntroGroupOf('entropy')).toBe('entropy')
    expect(actionIntroGroupOf('manual')).toBeNull()
    expect(actionIntroGroupOf('hexagram')).toBeNull()
    expect(actionIntroGroupOf('link')).toBeNull()
  })

  it('某个舞台完成三次排盘后只对它不再弹出', () => {
    expect(ACTION_INTRO_MAX_READINGS).toBe(3)
    recordActionIntroReading('coin')
    recordActionIntroReading('coin')
    expect(actionIntroRetired('coin')).toBe(false)

    recordActionIntroReading('coin')
    expect(actionIntroRetired('coin')).toBe(true)
    expect(actionIntroRetired('entropy')).toBe(false)
    expect(actionIntroRetired('derive')).toBe(false)
  })

  it('罗盘的三种方式合并计数，手动排卦不计入任何舞台', () => {
    recordActionIntroReading('number')
    recordActionIntroReading('time')
    recordActionIntroReading('manual')
    expect(actionIntroRetired('derive')).toBe(false)

    recordActionIntroReading('hanzi')
    expect(actionIntroRetired('derive')).toBe(true)
    expect(actionIntroRetired('coin')).toBe(false)
  })

  it('已有的本地历史按方式补记，且不会把已有次数改小', () => {
    recordActionIntroReading('entropy')
    recordActionIntroReading('entropy')
    recordActionIntroReading('entropy')
    syncActionIntroReadings(['coin', 'coin', 'coin', 'time', 'manual', 'entropy'])

    expect(actionIntroRetired('coin')).toBe(true)
    expect(actionIntroRetired('entropy')).toBe(true)
    expect(actionIntroRetired('derive')).toBe(false)
  })

  it('本地记录损坏或被清除时按新用户处理', () => {
    localStorage.setItem(ACTION_INTRO_STORAGE_KEY, '{not json')
    expect(actionIntroRetired('coin')).toBe(false)
  })
})
