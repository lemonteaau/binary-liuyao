import { scoreCoinToss } from '@/engine/binary'
import type { CoinToss } from '@/engine/binary'
import type { LineValue } from '@/types'

export type CoinShakePhase = 'ready' | 'shaking' | 'settled' | 'complete'

export interface CoinShakeState {
  phase: CoinShakePhase
  lines: readonly LineValue[]
  coins: CoinToss | null
  completedAt: Date | null
}

export type CoinShakeAction =
  | { type: 'start' }
  | { type: 'stop'; coins: CoinToss; when: Date }
  | { type: 'reset' }

export type CompleteRawLines = [
  LineValue,
  LineValue,
  LineValue,
  LineValue,
  LineValue,
  LineValue,
]

export function createCoinShakeState(): CoinShakeState {
  return {
    phase: 'ready',
    lines: [],
    coins: null,
    completedAt: null,
  }
}

export function coinShakeReducer(
  state: CoinShakeState,
  action: CoinShakeAction,
): CoinShakeState {
  switch (action.type) {
    case 'start':
      if (state.phase !== 'ready' && state.phase !== 'settled') return state
      return { ...state, phase: 'shaking', coins: null }

    case 'stop': {
      if (state.phase !== 'shaking' || state.lines.length >= 6) return state
      const lines = [...state.lines, scoreCoinToss(action.coins)]
      const complete = lines.length === 6
      return {
        phase: complete ? 'complete' : 'settled',
        lines,
        coins: action.coins,
        completedAt: complete ? action.when : null,
      }
    }

    case 'reset':
      return createCoinShakeState()
  }
}

export function completeRawLinesOf(state: CoinShakeState): CompleteRawLines | null {
  if (state.lines.length !== 6) return null
  return [...state.lines] as CompleteRawLines
}
