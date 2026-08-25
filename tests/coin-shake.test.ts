import { describe, expect, it } from 'vitest'
import {
  coinShakeReducer,
  completeRawLinesOf,
  createCoinShakeState,
} from '@/features/coin-shake/model'
import type { CoinToss } from '@/engine/binary'

const NOW = new Date('2026-08-26T12:00:00Z')
const TOSSES: CoinToss[] = [
  [2, 2, 2],
  [3, 2, 2],
  [3, 3, 2],
  [3, 3, 3],
  [2, 3, 2],
  [2, 3, 3],
]

function cast(state = createCoinShakeState(), coins: CoinToss = [2, 2, 2]) {
  const shaking = coinShakeReducer(state, { type: 'start' })
  return coinShakeReducer(shaking, { type: 'stop', coins, when: NOW })
}

describe('摇币指定状态机', () => {
  it('初始静止且停止操作不会写入爻', () => {
    const initial = createCoinShakeState()
    expect(initial.phase).toBe('ready')
    expect(initial.lines).toEqual([])
    expect(completeRawLinesOf(initial)).toBeNull()
    expect(coinShakeReducer(initial, { type: 'stop', coins: [3, 3, 3], when: NOW }))
      .toBe(initial)
  })

  it('第一轮写入初爻，六轮严格按停止顺序组成 L1 到 L6', () => {
    let state = createCoinShakeState()
    for (const toss of TOSSES) state = cast(state, toss)

    expect(state.phase).toBe('complete')
    expect(completeRawLinesOf(state)).toEqual([6, 7, 8, 9, 7, 8])
    expect(state.completedAt).toEqual(NOW)
  })

  it('重复停止和完成后的继续操作不会产生第七爻', () => {
    let state = cast(createCoinShakeState(), TOSSES[0]!)
    const duplicate = coinShakeReducer(state, { type: 'stop', coins: TOSSES[1]!, when: NOW })
    expect(duplicate).toBe(state)

    for (const toss of TOSSES.slice(1)) state = cast(state, toss)
    expect(state.lines).toHaveLength(6)
    expect(coinShakeReducer(state, { type: 'start' })).toBe(state)
  })

  it('重置会清除部分结果、铜钱与完成时间', () => {
    const partial = cast(createCoinShakeState(), [3, 2, 2])
    expect(coinShakeReducer(partial, { type: 'reset' })).toEqual(createCoinShakeState())
  })
})
