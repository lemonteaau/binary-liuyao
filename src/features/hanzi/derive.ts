import ccd from 'chinese-characters-decomposition'
import cnchar from 'cnchar'
import radical from 'cnchar-radical'
import trad from 'cnchar-trad'
import { rawLinesFromTrigrams, trigramKeyByRemainder } from '@/features/number/derive'
import type { LineValue } from '@/types'

type CcdRow = (typeof ccd.rows)[number]
type RadicalInfo = ReturnType<typeof cnchar.radical>[number]

cnchar.use(radical, trad)

const ROW_BY_CHARACTER = new Map<string, CcdRow>()
for (const row of ccd.rows) {
  if (!ROW_BY_CHARACTER.has(row[0])) ROW_BY_CHARACTER.set(row[0], row)
}
const HANZI_PATTERN = /^\p{Script=Han}$/u
const WHITESPACE_PATTERN = /^\s$/u

export type HanziSeedStrategy = 'single-character' | 'stroke-count' | 'character-count'

export interface HanziSeed {
  text: string
  characters: string[]
  characterStrokes: number[]
  strategy: HanziSeedStrategy
  upperText: string
  lowerText: string
  upperValue: number
  lowerValue: number
  movingValue: number
  upperRemainder: number
  lowerRemainder: number
  movingLine: number
  singleCharacterParts?: {
    layout: 'horizontal' | 'vertical' | 'other'
    firstComponent: string | null
    secondComponent: string | null
  }
}

export type HanziSeedError = 'EMPTY' | 'NON_HANZI' | 'UNSUPPORTED_CHARACTER'

export type HanziDerivation =
  | {
      ok: true
      seed: HanziSeed
      rawLines: [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]
    }
  | {
      ok: false
      error: HanziSeedError
      unsupportedCharacters?: string[]
    }

/**
 * 汉字起卦：
 * - 单字：字形第一部分（左/上）为上卦，第二部分（右/下）为下卦，总笔画定动爻。
 * - 2–10 字：前后分组；奇数时后组多一字。两组笔画数定上下卦，总笔画定动爻。
 * - 11 字及以上：分组方式相同，以字数代替笔画数。
 * - 余 0：卦取坤（8），动爻取上爻（6）。
 */
export function deriveHanziSeed(input: string): HanziDerivation {
  const normalized = input.normalize('NFC').trim()
  if (!normalized) return { ok: false, error: 'EMPTY' }

  const rawCharacters = Array.from(normalized)
  if (rawCharacters.some((character) => !isHanzi(character) && !isWhitespace(character))) {
    return { ok: false, error: 'NON_HANZI' }
  }

  const characters = rawCharacters.filter((character) => !isWhitespace(character))
  if (characters.length === 0) return { ok: false, error: 'EMPTY' }

  const count = characters.length
  let resolvedRows: Array<CcdRow | undefined> = []
  let characterStrokes: number[] = []

  if (count <= 10) {
    resolvedRows = characters.map((character) => ROW_BY_CHARACTER.get(character))
    characterStrokes = characters.map((character, index) =>
      strokeCountOf(character, resolvedRows[index]),
    )
    const unsupportedCharacters = characters.filter((_, index) => characterStrokes[index] === 0)
    if (unsupportedCharacters.length > 0) {
      return {
        ok: false,
        error: 'UNSUPPORTED_CHARACTER',
        unsupportedCharacters: [...new Set(unsupportedCharacters)],
      }
    }
  }

  let strategy: HanziSeedStrategy
  let upperText: string
  let lowerText: string
  let upperValue: number
  let lowerValue: number
  let movingValue: number
  let singleCharacterParts: HanziSeed['singleCharacterParts']

  if (count === 1) {
    const character = characters[0]!
    const row = resolvedRows[0]
    const radicalInfo = cnchar.radical(character)[0]
    const split = splitSingleCharacter(characterStrokes[0]!, row, radicalInfo)
    upperValue = split.upperValue
    lowerValue = split.lowerValue
    const totalStrokes = upperValue + lowerValue
    movingValue = totalStrokes
    upperText = split.upperText
    lowerText = split.lowerText
    strategy = 'single-character'
    singleCharacterParts = {
      layout: row ? layoutOf(row[2]) : layoutOfStruct(radicalInfo?.struct),
      firstComponent: row?.[3] ?? radicalInfo?.radical ?? null,
      secondComponent: row?.[5] ?? null,
    }
  } else {
    const splitIndex = Math.floor(count / 2)
    const upperCharacters = characters.slice(0, splitIndex)
    const lowerCharacters = characters.slice(splitIndex)
    upperText = upperCharacters.join('')
    lowerText = lowerCharacters.join('')

    if (count <= 10) {
      strategy = 'stroke-count'
      upperValue = sum(characterStrokes.slice(0, splitIndex))
      lowerValue = sum(characterStrokes.slice(splitIndex))
      movingValue = upperValue + lowerValue
    } else {
      strategy = 'character-count'
      upperValue = upperCharacters.length
      lowerValue = lowerCharacters.length
      movingValue = count
    }
  }

  const upperRemainder = remainderOrBase(upperValue, 8)
  const lowerRemainder = remainderOrBase(lowerValue, 8)
  const movingLine = remainderOrBase(movingValue, 6) - 1
  const seed: HanziSeed = {
    text: characters.join(''),
    characters,
    characterStrokes,
    strategy,
    upperText,
    lowerText,
    upperValue,
    lowerValue,
    movingValue,
    upperRemainder,
    lowerRemainder,
    movingLine,
    ...(singleCharacterParts ? { singleCharacterParts } : {}),
  }

  return {
    ok: true,
    seed,
    rawLines: rawLinesFromTrigrams(
      trigramKeyByRemainder(upperRemainder),
      trigramKeyByRemainder(lowerRemainder),
      movingLine,
    ),
  }
}

function isHanzi(character: string): boolean {
  return HANZI_PATTERN.test(character)
}

function isWhitespace(character: string): boolean {
  return WHITESPACE_PATTERN.test(character)
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function strokeCountOf(character: string, row?: CcdRow): number {
  const count = cnchar.stroke(character)
  return typeof count === 'number' && count > 0 ? count : row?.[1] ?? 0
}

function splitSingleCharacter(
  totalStrokes: number,
  row: CcdRow | undefined,
  radicalInfo: RadicalInfo | undefined,
): { upperValue: number; lowerValue: number; upperText: string; lowerText: string } {
  if (!row) {
    const radicalStrokes = radicalInfo?.radicalCount ?? 0
    const upperValue = radicalStrokes > 0 ? radicalStrokes : totalStrokes
    return {
      upperValue,
      lowerValue: totalStrokes - upperValue,
      upperText: radicalInfo?.radical || '字首',
      lowerText: '余部',
    }
  }

  let lowerValue: number
  if (row[1] === totalStrokes) {
    lowerValue = row[6]
  } else if (row[5] && row[5] === radicalInfo?.radical && radicalInfo.radicalCount > 0) {
    lowerValue = radicalInfo.radicalCount
  } else if (row[3] && row[3] === radicalInfo?.radical && radicalInfo.radicalCount > 0) {
    lowerValue = totalStrokes - radicalInfo.radicalCount
  } else {
    lowerValue = Math.round(totalStrokes * (row[6] / row[1]))
  }

  lowerValue = Math.max(0, Math.min(totalStrokes, lowerValue))
  return {
    upperValue: totalStrokes - lowerValue,
    lowerValue,
    upperText: row[3] ?? radicalInfo?.radical ?? '字首',
    lowerText: row[5] ?? '余部',
  }
}

function remainderOrBase(value: number, base: number): number {
  const remainder = value % base
  return remainder === 0 ? base : remainder
}

function layoutOf(compositionType: string): 'horizontal' | 'vertical' | 'other' {
  if (
    compositionType === '吕'
    || compositionType === '咒'
    || compositionType === '品'
    || compositionType === '冖'
  ) {
    return 'vertical'
  }
  if (compositionType === '吅' || compositionType === '弼') return 'horizontal'
  return 'other'
}

function layoutOfStruct(struct: RadicalInfo['struct'] | undefined): 'horizontal' | 'vertical' | 'other' {
  if (struct === '左右结构' || struct === '左中右结构') return 'horizontal'
  if (struct === '上下结构' || struct === '上中下结构' || struct === '品字结构') return 'vertical'
  return 'other'
}
