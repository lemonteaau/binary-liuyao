/**
 * 电脑起卦动画的节拍与版面：十八个随机位自初爻向上逐行取定，每三位凝成一爻。
 * 只含纯计算，渲染层按时间求值。
 */

export interface EntropyRowTiming {
  /** 该行开始闪动的时刻（s，相对起卦） */
  start: number
  /** 三个随机位依次取定的时刻 */
  bits: readonly [number, number, number]
  /** 爻线开始凝结的时刻，也是该爻“已得出”的时刻 */
  bar: number
}

export interface EntropySchedule {
  rows: readonly EntropyRowTiming[]
  /** 六爻齐备的时刻 */
  complete: number
}

const FIRST_ROW = 0.36
/** 行距逐渐收紧，越往上越快 */
const ROW_INTERVALS = [0.36, 0.33, 0.3, 0.27, 0.25] as const
const BIT_INTERVAL = 0.07
const BAR_DELAY = 0.08
const SETTLE = 0.56
const LEAD_IN = 0.2
/** 一爻从散点凝成实线所需时间 */
export const CONDENSE_TIME = 0.34

export function entropySchedule(): EntropySchedule {
  const rows: EntropyRowTiming[] = []
  let first = FIRST_ROW
  for (let line = 0; line < 6; line++) {
    const bits = [first, first + BIT_INTERVAL, first + BIT_INTERVAL * 2] as const
    rows.push({ start: first - LEAD_IN, bits, bar: bits[2] + BAR_DELAY })
    first += ROW_INTERVALS[line] ?? 0
  }
  return { rows, complete: rows[5]!.bar + SETTLE }
}

export interface EntropyLayout {
  width: number
  height: number
  /** 噪声格边长（CSS px） */
  cell: number
  /** 噪声网格原点（≤ 0），使卦象恰好落在格线上并居中 */
  origin: { x: number; y: number }
  columns: number
  rows: number
  /** 一爻宽几格、高几格；阴爻中间空 gapCells 格 */
  barCells: number
  barRows: number
  gapCells: number
  pitchRows: number
  /** 卦象外框（尚未左移） */
  block: { x: number; y: number; width: number; height: number }
  /** 第 line 爻的顶边；初爻在最下 */
  rowTop: (line: number) => number
  /** 卦成后卦象向左让出卦名的位移（px，负值） */
  finaleShift: number
  /** 卦名区域：左缘与预留宽度 */
  names: { x: number; width: number }
}

export const FIELD_CELL = 8
const GAP_CELLS = 3
const BAR_ROWS = 2

export function entropyLayout(width: number, height: number): EntropyLayout {
  const cell = FIELD_CELL
  const roomy = height >= 224 && width >= 420
  const barCells = roomy ? 19 : 15
  const pitchRows = roomy ? 4 : 3
  const blockWidth = barCells * cell
  // 格子自身留 3px 间隙，最后一行不必算满
  const blockHeight = (pitchRows * 5 + BAR_ROWS) * cell - 3
  const x = Math.round((width - blockWidth) / 2)
  const y = Math.round((height - blockHeight) / 2)
  const origin = { x: (x % cell) - cell, y: (y % cell) - cell }
  const namesWidth = Math.min(144, width * 0.36)
  const namesGap = cell * (roomy ? 4 : 2.5)
  const finaleShift = -Math.round((namesWidth + namesGap) / 2 / cell) * cell
  return {
    width,
    height,
    cell,
    origin,
    columns: Math.ceil((width - origin.x) / cell),
    rows: Math.ceil((height - origin.y) / cell),
    barCells,
    barRows: BAR_ROWS,
    gapCells: GAP_CELLS,
    pitchRows,
    block: { x, y, width: blockWidth, height: blockHeight },
    rowTop: (line) => y + (5 - line) * pitchRows * cell,
    finaleShift,
    names: { x: x + blockWidth + finaleShift + namesGap, width: namesWidth },
  }
}
