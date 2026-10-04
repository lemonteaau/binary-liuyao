import { TRIGRAMS } from '@/data/trigrams'
import { zhouyiTextByKingWen } from '@/data/zhouyi'
import { INPUT_METHOD_LABELS, lineTransformOf } from '@/engine'
import { bitsToString } from '@/engine/binary'
import { isXunKong, LINE_NAMES, shenshaPosition } from '@/lib/reading-marks'
import { formatTimezoneWithOffset, parseGregorianToDate } from '@/lib/timezone-display'
import type { ChartData, ChartLine, HexStateInfo, LineTransform, NajiaLine } from '@/types'

export const SHARE_IMAGE_SITE = 'liuyao.lemontea.xyz'

const WIDTH = 1080
const MIN_HEIGHT = 1920
const PAD = 54
const CONTENT_WIDTH = WIDTH - PAD * 2
const HEADER_HEIGHT = 156
/** 面板标签压在上边框上，间距要给标签留出位置 */
const SECTION_GAP = 46
const FOOTER_HEIGHT = 96
const SUMMARY_HEIGHT = 236
const XOR_WIDTH = 112
const RAIL_WIDTH = 132
const CHANGE_WIDTH = 84
const MATRIX_HEAD_HEIGHT = 72
const CLASSIC_TEXT_SIZE = 22
const CLASSIC_LINE_HEIGHT = 34
const FONT_FAMILY = '"Fusion Pixel 12", "PingFang SC", "Microsoft YaHei", monospace'
const COLORS = {
  background: '#040807',
  surface: '#081211',
  panel: '#0b1815',
  edge: '#1c332e',
  edgeBright: '#2c4a43',
  ink: '#d7efe6',
  fog: '#7fa398',
  signal: '#3df5c6',
  flux: '#ff4d6a',
}
/** 静爻在变卦一侧只作对照，与结果页同样退到背景里 */
const STATIC_RESULT_ALPHA = 0.42

export interface ShareImageOptions {
  sessionId?: string
  ordinal?: number | null
}

export interface ShareImageModel {
  title: string
  subtitle: string
  session: string
  ordinal: string | null
  hasMutation: boolean
  primary: ShareStateModel
  result: ShareStateModel
  mutationMask: string
  dates: Array<{ label: string; value: string }>
  pillars: Array<{ label: string; value: string; note?: string }>
  lines: ShareLineModel[]
  classics: ShareClassicsModel
  shensha: ShareShenshaModel[]
  footer: string
}

interface ShareStateModel {
  label: string
  name: string
  binary: string
  bits: number
  /** 与动爻对应的翻转位，按二进制字符串自左向右 */
  flipped: boolean[]
  hexNumber: string
  palace: string
  trigrams: string
}

interface ShareNajiaModel {
  relation: string
  najia: string
  kong: boolean
}

interface ShareLineModel {
  name: string
  spirit: string
  shiYing: '世' | '应' | null
  yang: boolean
  resultYang: boolean
  mutating: boolean
  moving: string | null
  primary: ShareNajiaModel
  fuShen: ShareNajiaModel | null
  result: ShareNajiaModel
  transform: LineTransform | null
}

interface ShareClassicsModel {
  primary: ShareClassicHexagramModel
  result: ShareClassicHexagramModel | null
}

interface ShareClassicHexagramModel {
  label: string
  name: string
  statement: string
  lines: ShareClassicLineModel[]
  special: ShareClassicLineModel | null
}

interface ShareClassicLineModel {
  label: string
  text: string
  mutating: boolean
}

interface ShareShenshaModel {
  name: string
  branches: string
  position: string | null
}

export function buildShareImageModel(
  chart: ChartData,
  options: ShareImageOptions = {},
): ShareImageModel {
  const hasMutation = chart.mutationMask !== 0
  const { calendar } = chart

  return {
    title: 'HEX//64 六爻排盘',
    subtitle: `${INPUT_METHOD_LABELS[chart.inputMethod]} · ${calendar.gregorian}`,
    session: options.sessionId ? `排盘 ${options.sessionId}` : '本地排盘',
    ordinal: typeof options.ordinal === 'number'
      ? `全局第 ${options.ordinal.toLocaleString('zh-CN')} 次起卦`
      : options.ordinal === null
        ? '全局序号登记中'
        : null,
    hasMutation,
    primary: stateModel('本卦', chart.primary, chart.mutationMask),
    result: stateModel('变卦', chart.result, chart.mutationMask),
    mutationMask: bitsToString(chart.mutationMask),
    dates: [
      { label: '公历', value: calendar.gregorian },
      { label: '农历', value: `${calendar.lunarText}日 · ${calendar.hourZhi}时` },
      {
        label: '时区',
        value: formatTimezoneWithOffset(
          calendar.timezone,
          calendar.utcOffset,
          parseGregorianToDate(calendar.gregorian, calendar.utcOffset),
        ),
      },
    ],
    pillars: [
      { label: '年柱', value: calendar.ganzhi.year },
      { label: '月柱', value: calendar.ganzhi.month },
      { label: '日柱', value: calendar.ganzhi.day },
      { label: '时柱', value: calendar.ganzhi.hour },
      { label: '旬空', value: calendar.xunKong.join('') },
      {
        label: '卦身',
        value: chart.guaShen.branch,
        note: chart.guaShen.onHexagram ? '已上卦' : '未上卦',
      },
    ],
    lines: [...chart.lines]
      .sort((a, b) => b.index - a.index)
      .map((line) => lineModel(chart, line)),
    classics: {
      primary: classicModel('本卦', chart.primary, chart.mutationMask, true),
      result: hasMutation ? classicModel('变卦', chart.result, chart.mutationMask, false) : null,
    },
    shensha: chart.shensha
      .filter((entry) => entry.branches.length > 0)
      .map((entry) => ({
        name: entry.name,
        branches: entry.branches.join(''),
        position: shenshaPosition(entry, chart),
      })),
    footer: SHARE_IMAGE_SITE,
  }
}

export async function createReadingShareImage(
  chart: ChartData,
  options: ShareImageOptions = {},
): Promise<Blob> {
  await document.fonts?.load(`24px ${FONT_FAMILY}`).catch(() => undefined)

  const model = buildShareImageModel(chart, options)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = 1
  let ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')

  const layout = measureLayout(ctx, model)
  canvas.height = layout.height
  ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  renderShareImage(ctx, model, layout)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG export failed'))
    }, 'image/png')
  })
}

export async function shareOrDownloadImage(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null
  const shareData = file ? { files: [file], title: 'HEX//64 六爻排盘' } : null

  if (shareData && navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return 'downloaded'
}

function stateModel(label: string, state: HexStateInfo, mutationMask: number): ShareStateModel {
  const upper = TRIGRAMS[state.record.upperKey]
  const lower = TRIGRAMS[state.record.lowerKey]
  return {
    label,
    name: state.record.chineseName,
    binary: state.binary,
    bits: state.bits,
    flipped: [...state.binary].map((_, position) => Boolean((mutationMask >> (5 - position)) & 1)),
    hexNumber: `HEX ${String(state.record.kingWenNumber).padStart(2, '0')}`,
    palace: [state.palace, state.palaceRank, state.attribute].filter(Boolean).join(' · '),
    trigrams: `上${upper.name}${upper.symbol} 下${lower.name}${lower.symbol}`,
  }
}

function lineModel(chart: ChartData, line: ChartLine): ShareLineModel {
  const fuShen = chart.fuShen.find((entry) => entry.index === line.index)
  return {
    name: LINE_NAMES[line.index] ?? `第${line.index + 1}爻`,
    spirit: line.primary.spirit ?? '—',
    shiYing: line.primary.shiYing,
    yang: line.yang,
    resultYang: Boolean((chart.result.bits >> line.index) & 1),
    mutating: line.mutating,
    moving: line.mutating ? (line.yang ? '老阳 · 动' : '老阴 · 动') : null,
    primary: najiaModel(chart, line.primary.relation, line.primary.najia),
    fuShen: fuShen ? najiaModel(chart, fuShen.relation, fuShen.najia) : null,
    // 旬空只标在动爻化出的变爻上，静爻的变卦一侧只作对照
    result: {
      ...najiaModel(chart, line.result.relation, line.result.najia),
      kong: line.mutating && isXunKong(chart, line.result.najia.branch),
    },
    transform: lineTransformOf(line),
  }
}

function najiaModel(chart: ChartData, relation: string, najia: NajiaLine): ShareNajiaModel {
  return {
    relation,
    najia: `${najia.stem}${najia.branch}${najia.element}`,
    kong: isXunKong(chart, najia.branch),
  }
}

function classicModel(
  label: string,
  state: HexStateInfo,
  mutationMask: number,
  primary: boolean,
): ShareClassicHexagramModel {
  const classic = zhouyiTextByKingWen(state.record.kingWenNumber)
  return {
    label,
    name: state.record.chineseName,
    statement: classic.statement,
    lines: classic.lines
      .map((line, index) => ({
        ...line,
        mutating: primary && Boolean((mutationMask >> index) & 1),
      }))
      .reverse(),
    special: classic.special
      ? {
          ...classic.special,
          mutating: primary && mutationMask === 0b111111,
        }
      : null,
  }
}

/* ---------------------------------- */
/* 版式测量                            */
/* ---------------------------------- */

interface ShareLayout {
  height: number
  summaryY: number
  calendarY: number
  calendarHeight: number
  timezoneLines: string[]
  matrixY: number
  rowHeights: number[]
  classicsY: number
  classicRows: ClassicRow[]
  classicsHeight: number
  shenshaY: number
  shenshaChips: ShenshaChip[]
  shenshaHeight: number
  footerY: number
}

function measureLayout(ctx: CanvasRenderingContext2D, model: ShareImageModel): ShareLayout {
  const summaryY = HEADER_HEIGHT + SECTION_GAP
  const calendarY = summaryY + SUMMARY_HEIGHT + SECTION_GAP
  const { lines: timezoneLines, height: calendarHeight } = measureCalendar(ctx, model)
  const matrixY = calendarY + calendarHeight + SECTION_GAP
  const rowHeights = model.lines.map((line) => lineRowHeight(line))
  const matrixHeight = MATRIX_HEAD_HEIGHT + rowHeights.reduce((sum, height) => sum + height, 0)
  const classicsY = matrixY + matrixHeight + SECTION_GAP
  const classicRows = measureClassicRows(ctx, model.classics)
  const classicsHeight = classicRows.reduce((sum, row) => sum + row.height, 0) + CLASSIC_NOTE_HEIGHT
  const shenshaY = classicsY + classicsHeight + SECTION_GAP
  const { chips: shenshaChips, height: shenshaHeight } = measureShensha(ctx, model)
  const contentEnd = shenshaY + shenshaHeight + SECTION_GAP
  // 内容不足最低高度时把页脚压到底部，避免页脚下方留出一大片空白
  const footerY = Math.max(contentEnd, MIN_HEIGHT - FOOTER_HEIGHT)

  return {
    height: Math.ceil(footerY + FOOTER_HEIGHT),
    summaryY,
    calendarY,
    calendarHeight,
    timezoneLines,
    matrixY,
    rowHeights,
    classicsY,
    classicRows,
    classicsHeight,
    shenshaY,
    shenshaChips,
    shenshaHeight,
    footerY,
  }
}

function renderShareImage(
  ctx: CanvasRenderingContext2D,
  model: ShareImageModel,
  layout: ShareLayout,
): void {
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, WIDTH, layout.height)
  drawGrid(ctx, layout.height)
  ctx.textBaseline = 'top'

  drawHeader(ctx, model)
  drawSummary(ctx, model, layout.summaryY)
  drawCalendar(ctx, model, layout)
  drawMatrix(ctx, model, layout)
  drawClassics(ctx, model, layout)
  drawShensha(ctx, model, layout)
  drawFooter(ctx, model, layout.footerY)
}

function drawGrid(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.save()
  const color = 'rgba(61, 245, 198, 0.02)'
  for (let x = 0; x <= WIDTH; x += 24) strokeLine(ctx, x, 0, x, height, color)
  for (let y = 0; y <= height; y += 24) strokeLine(ctx, 0, y, WIDTH, y, color)
  ctx.restore()
}

/* ---------------------------------- */
/* 页头与双卦摘要                      */
/* ---------------------------------- */

function drawHeader(ctx: CanvasRenderingContext2D, model: ShareImageModel): void {
  setFont(ctx, 50, true)
  ctx.fillStyle = COLORS.signal
  ctx.fillText(model.title, PAD, 50)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(model.subtitle, PAD, 112)

  ctx.textAlign = 'right'
  setFont(ctx, 28)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(model.session, WIDTH - PAD, 56)
  if (model.ordinal) {
    setFont(ctx, 22)
    ctx.fillStyle = COLORS.fog
    ctx.fillText(model.ordinal, WIDTH - PAD, 100)
  }
  ctx.textAlign = 'left'
  strokeLine(ctx, PAD, HEADER_HEIGHT - 4, WIDTH - PAD, HEADER_HEIGHT - 4, COLORS.edgeBright)
}

function drawSummary(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  const cardWidth = (CONTENT_WIDTH - XOR_WIDTH) / 2
  drawStateCard(ctx, model.primary, PAD, y, cardWidth, model.hasMutation)
  if (model.hasMutation) {
    drawXor(ctx, model.mutationMask, PAD + cardWidth, y)
    drawStateCard(ctx, model.result, PAD + cardWidth + XOR_WIDTH, y, cardWidth, false)
    return
  }

  const quietX = PAD + cardWidth + 24
  const quietWidth = CONTENT_WIDTH - cardWidth - 24
  ctx.save()
  ctx.setLineDash([8, 6])
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(quietX + 0.5, y + 0.5, quietWidth - 1, SUMMARY_HEIGHT - 1)
  ctx.restore()
  ctx.textAlign = 'center'
  setFont(ctx, 30)
  ctx.fillStyle = COLORS.ink
  ctx.fillText('六爻安静', quietX + quietWidth / 2, y + SUMMARY_HEIGHT / 2 - 36)
  setFont(ctx, 22)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('无动爻，不生变卦', quietX + quietWidth / 2, y + SUMMARY_HEIGHT / 2 + 10)
  ctx.textAlign = 'left'
}

function drawStateCard(
  ctx: CanvasRenderingContext2D,
  state: ShareStateModel,
  x: number,
  y: number,
  width: number,
  markLines: boolean,
): void {
  drawPanel(ctx, x, y, width, SUMMARY_HEIGHT, state.label)

  const glyphWidth = 128
  const glyphHeight = 6 * 14 + 5 * 11
  drawHexagram(ctx, state, markLines, x + 28, y + (SUMMARY_HEIGHT - glyphHeight) / 2 + 4, glyphWidth)

  const textX = x + 28 + glyphWidth + 28
  setFont(ctx, 40, true)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(state.name, textX, y + 34)

  setFont(ctx, 28, true)
  let digitX = textX
  ;[...state.binary].forEach((digit, position) => {
    ctx.fillStyle = state.flipped[position] ? COLORS.flux : COLORS.signal
    ctx.fillText(digit, digitX, y + 92)
    digitX += ctx.measureText(digit).width + 6
  })

  const metaWidth = x + width - 24 - textX
  ctx.fillStyle = COLORS.fog
  drawFittedText(ctx, state.hexNumber, textX, y + 138, metaWidth, 20, 16)
  drawFittedText(ctx, state.palace, textX, y + 166, metaWidth, 20, 16)
  drawFittedText(ctx, state.trigrams, textX, y + 194, metaWidth, 20, 16)
}

function drawHexagram(
  ctx: CanvasRenderingContext2D,
  state: ShareStateModel,
  markLines: boolean,
  x: number,
  y: number,
  width: number,
): void {
  for (let row = 0; row < 6; row += 1) {
    const index = 5 - row
    const yang = Boolean((state.bits >> index) & 1)
    const mutating = markLines && Boolean(state.flipped[row])
    drawLineGlyph(ctx, yang, mutating, x, y + row * 25, width, 14)
  }
}

function drawLineGlyph(
  ctx: CanvasRenderingContext2D,
  yang: boolean,
  mutating: boolean,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.fillStyle = mutating ? COLORS.flux : COLORS.ink
  if (yang) {
    ctx.fillRect(x, y, width, height)
    return
  }
  const segment = width * 0.43
  ctx.fillRect(x, y, segment, height)
  ctx.fillRect(x + width - segment, y, segment, height)
}

function drawXor(ctx: CanvasRenderingContext2D, mask: string, x: number, y: number): void {
  const center = x + XOR_WIDTH / 2
  ctx.textAlign = 'center'
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('动爻', center, y + 66)
  setFont(ctx, 22, true)
  ctx.fillStyle = COLORS.flux
  ctx.fillText(mask, center, y + 102)
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('XOR →', center, y + 144)
  ctx.textAlign = 'left'
}

/* ---------------------------------- */
/* 历法                                */
/* ---------------------------------- */

const CALENDAR_LABEL_WIDTH = 64
const PILLAR_STRIP_HEIGHT = 104

function measureCalendar(ctx: CanvasRenderingContext2D, model: ShareImageModel) {
  setFont(ctx, 24)
  const timezone = model.dates.find((item) => item.label === '时区')?.value ?? ''
  const lines = wrapText(ctx, timezone, CONTENT_WIDTH - 56 - CALENDAR_LABEL_WIDTH)
  return { lines, height: 34 + 44 + lines.length * 34 + 22 + PILLAR_STRIP_HEIGHT }
}

function drawCalendar(ctx: CanvasRenderingContext2D, model: ShareImageModel, layout: ShareLayout): void {
  const y = layout.calendarY
  drawPanel(ctx, PAD, y, CONTENT_WIDTH, layout.calendarHeight, '历法')
  const byLabel = new Map(model.dates.map((item) => [item.label, item.value]))
  const x = PAD + 28
  const half = CONTENT_WIDTH / 2

  drawDatum(ctx, '公历', byLabel.get('公历') ?? '', x, y + 34, half - 56)
  drawDatum(ctx, '农历', byLabel.get('农历') ?? '', PAD + half, y + 34, half - 28)
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('时区', x, y + 80)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.ink
  layout.timezoneLines.forEach((line, index) => {
    ctx.fillText(line, x + CALENDAR_LABEL_WIDTH, y + 78 + index * 34)
  })

  const stripY = y + layout.calendarHeight - PILLAR_STRIP_HEIGHT
  strokeLine(ctx, PAD, stripY, PAD + CONTENT_WIDTH, stripY, COLORS.edge)
  const cellWidth = CONTENT_WIDTH / model.pillars.length
  model.pillars.forEach((pillar, index) => {
    const cellX = PAD + index * cellWidth
    if (index > 0) strokeLine(ctx, cellX, stripY, cellX, stripY + PILLAR_STRIP_HEIGHT, COLORS.edge)
    const center = cellX + cellWidth / 2
    ctx.textAlign = 'center'
    setFont(ctx, 20)
    ctx.fillStyle = COLORS.fog
    ctx.fillText(pillar.label, center, stripY + 18)
    setFont(ctx, 30, true)
    const valueWidth = ctx.measureText(pillar.value).width
    setFont(ctx, 18)
    const noteWidth = pillar.note ? ctx.measureText(pillar.note).width + 8 : 0
    const startX = center - (valueWidth + noteWidth) / 2
    ctx.textAlign = 'left'
    setFont(ctx, 30, true)
    ctx.fillStyle = COLORS.signal
    ctx.fillText(pillar.value, startX, stripY + 52)
    if (pillar.note) {
      setFont(ctx, 18)
      ctx.fillStyle = COLORS.fog
      ctx.fillText(pillar.note, startX + valueWidth + 8, stripY + 62)
    }
  })
}

function drawDatum(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(label, x, y + 2)
  ctx.fillStyle = COLORS.ink
  drawFittedText(ctx, value, x + CALENDAR_LABEL_WIDTH, y, width - CALENDAR_LABEL_WIDTH, 24, 18)
}

/* ---------------------------------- */
/* 逐爻排盘                            */
/* ---------------------------------- */

const NAJIA_LINE_HEIGHT = 32
const BADGE_HEIGHT = 30
const FUSHEN_LINE_HEIGHT = 26
const STACK_GAP = 10

function primaryStackHeight(line: ShareLineModel): number {
  let height = NAJIA_LINE_HEIGHT
  if (line.moving) height += STACK_GAP + BADGE_HEIGHT
  if (line.fuShen) height += STACK_GAP + FUSHEN_LINE_HEIGHT
  return height
}

function resultStackHeight(line: ShareLineModel): number {
  return NAJIA_LINE_HEIGHT + (line.transform ? STACK_GAP + BADGE_HEIGHT : 0)
}

function lineRowHeight(line: ShareLineModel): number {
  return Math.max(96, Math.max(primaryStackHeight(line), resultStackHeight(line)) + 44)
}

function drawMatrix(ctx: CanvasRenderingContext2D, model: ShareImageModel, layout: ShareLayout): void {
  const y = layout.matrixY
  const rowsHeight = layout.rowHeights.reduce((sum, height) => sum + height, 0)
  const height = MATRIX_HEAD_HEIGHT + rowsHeight
  const sideWidth = model.hasMutation
    ? (CONTENT_WIDTH - RAIL_WIDTH - CHANGE_WIDTH) / 2
    : CONTENT_WIDTH - RAIL_WIDTH
  const xPrimary = PAD + RAIL_WIDTH
  const xChange = xPrimary + sideWidth
  const xResult = xChange + CHANGE_WIDTH

  drawPanel(ctx, PAD, y, CONTENT_WIDTH, height, '逐爻排盘')
  ctx.fillStyle = COLORS.surface
  ctx.fillRect(PAD + 1, y + 1, CONTENT_WIDTH - 2, MATRIX_HEAD_HEIGHT - 1)
  drawPanelTag(ctx, PAD, y, '逐爻排盘')
  const separators = model.hasMutation ? [xPrimary, xChange, xResult] : [xPrimary]
  separators.forEach((x) => strokeLine(ctx, x, y, x, y + height, COLORS.edge))

  const headY = y + 28
  ctx.textAlign = 'center'
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('爻位 / 六神', PAD + RAIL_WIDTH / 2, headY + 2)
  if (model.hasMutation) ctx.fillText('变化', xChange + CHANGE_WIDTH / 2, headY + 2)
  ctx.textAlign = 'left'
  drawMatrixHead(ctx, '本卦', model.primary.name, model.hasMutation ? null : '六爻安静 · 无变卦', xPrimary + 22, headY)
  if (model.hasMutation) drawMatrixHead(ctx, '变卦', model.result.name, null, xResult + 22, headY)

  let rowY = y + MATRIX_HEAD_HEIGHT
  model.lines.forEach((line, row) => {
    const rowHeight = layout.rowHeights[row] ?? 96
    strokeLine(ctx, PAD, rowY, PAD + CONTENT_WIDTH, rowY, COLORS.edge)
    if (line.mutating) {
      ctx.fillStyle = 'rgba(255, 77, 106, 0.05)'
      ctx.fillRect(PAD + 1, rowY + 1, CONTENT_WIDTH - 2, rowHeight - 1)
    }
    drawRail(ctx, line, PAD, rowY, rowHeight)
    drawPrimaryCell(ctx, line, xPrimary, rowY, rowHeight)
    if (model.hasMutation) {
      if (line.mutating) {
        ctx.textAlign = 'center'
        setFont(ctx, 28, true)
        ctx.fillStyle = COLORS.flux
        ctx.fillText('变', xChange + CHANGE_WIDTH / 2, rowY + rowHeight / 2 - 15)
        ctx.textAlign = 'left'
      }
      drawResultCell(ctx, line, xResult, rowY, rowHeight)
    }
    rowY += rowHeight
  })
}

function drawMatrixHead(
  ctx: CanvasRenderingContext2D,
  label: string,
  name: string,
  note: string | null,
  x: number,
  y: number,
): void {
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.signal
  ctx.fillText(label, x, y + 2)
  let cursor = x + ctx.measureText(label).width + 14
  setFont(ctx, 26, true)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(name, cursor, y - 2)
  cursor += ctx.measureText(name).width + 16
  if (note) {
    setFont(ctx, 20)
    ctx.fillStyle = COLORS.fog
    ctx.fillText(note, cursor, y + 2)
  }
}

function drawRail(ctx: CanvasRenderingContext2D, line: ShareLineModel, x: number, y: number, height: number): void {
  const center = x + RAIL_WIDTH / 2
  ctx.textAlign = 'center'
  setFont(ctx, 20)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(line.name, center, y + height / 2 - 30)
  ctx.textAlign = 'left'

  setFont(ctx, 24)
  const spiritWidth = ctx.measureText(line.spirit).width
  const badgeSize = 32
  const groupWidth = spiritWidth + (line.shiYing ? 10 + badgeSize : 0)
  const startX = center - groupWidth / 2
  const rowY = y + height / 2 + 2
  ctx.fillStyle = COLORS.ink
  ctx.fillText(line.spirit, startX, rowY)
  if (line.shiYing) {
    // 世应是读卦的锚点：两者同一外观，只标位置
    const badgeX = startX + spiritWidth + 10
    const badgeY = rowY - 4
    ctx.fillStyle = 'rgba(61, 245, 198, 0.12)'
    ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize)
    ctx.strokeStyle = COLORS.signal
    ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeSize - 1, badgeSize - 1)
    ctx.textAlign = 'center'
    setFont(ctx, 22, true)
    ctx.fillStyle = COLORS.signal
    ctx.fillText(line.shiYing, badgeX + badgeSize / 2, badgeY + 5)
    ctx.textAlign = 'left'
  }
}

const CELL_GLYPH_WIDTH = 100
const CELL_TEXT_OFFSET = 146

function drawPrimaryCell(
  ctx: CanvasRenderingContext2D,
  line: ShareLineModel,
  x: number,
  y: number,
  height: number,
): void {
  drawLineGlyph(ctx, line.yang, line.mutating, x + 22, y + height / 2 - 6, CELL_GLYPH_WIDTH, 12)
  const textX = x + CELL_TEXT_OFFSET
  let cursorY = y + (height - primaryStackHeight(line)) / 2
  drawNajia(ctx, line.primary, textX, cursorY)
  cursorY += NAJIA_LINE_HEIGHT
  if (line.moving) {
    cursorY += STACK_GAP
    drawBadge(ctx, line.moving, textX, cursorY, COLORS.flux, 'rgba(255, 77, 106, 0.6)')
    cursorY += BADGE_HEIGHT
  }
  if (line.fuShen) {
    cursorY += STACK_GAP
    ctx.fillStyle = COLORS.signal
    ctx.fillRect(textX, cursorY + 3, 2, 20)
    setFont(ctx, 19)
    ctx.fillText('伏神', textX + 10, cursorY + 2)
    let cursor = textX + 10 + ctx.measureText('伏神').width + 10
    ctx.fillStyle = COLORS.fog
    const text = `${line.fuShen.relation}${line.fuShen.najia}`
    ctx.fillText(text, cursor, cursorY + 2)
    cursor += ctx.measureText(text).width + 8
    if (line.fuShen.kong) drawKong(ctx, cursor, cursorY)
  }
}

function drawResultCell(
  ctx: CanvasRenderingContext2D,
  line: ShareLineModel,
  x: number,
  y: number,
  height: number,
): void {
  ctx.save()
  if (!line.mutating) ctx.globalAlpha = STATIC_RESULT_ALPHA
  drawLineGlyph(ctx, line.resultYang, false, x + 22, y + height / 2 - 6, CELL_GLYPH_WIDTH, 12)
  const textX = x + CELL_TEXT_OFFSET
  let cursorY = y + (height - resultStackHeight(line)) / 2
  drawNajia(ctx, line.result, textX, cursorY)
  cursorY += NAJIA_LINE_HEIGHT
  if (line.transform) {
    // 只标关系、不判吉凶：四种统一中性色
    drawBadge(ctx, line.transform, textX, cursorY + STACK_GAP, COLORS.ink, COLORS.edgeBright)
  }
  ctx.restore()
}

function drawNajia(ctx: CanvasRenderingContext2D, value: ShareNajiaModel, x: number, y: number): void {
  setFont(ctx, 26, true)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(value.relation, x, y + 2)
  let cursor = x + ctx.measureText(value.relation).width + 10
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(value.najia, cursor, y + 4)
  cursor += ctx.measureText(value.najia).width + 10
  if (value.kong) drawKong(ctx, cursor, y + 2)
}

/** 旬空：虚线框中性标注，与其他关系标签一样不带吉凶色 */
function drawKong(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const size = 26
  ctx.save()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = COLORS.fog
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
  ctx.restore()
  ctx.textAlign = 'center'
  setFont(ctx, 17)
  ctx.fillStyle = COLORS.ink
  ctx.fillText('空', x + size / 2, y + 4)
  ctx.textAlign = 'left'
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  border: string,
): void {
  setFont(ctx, 19)
  const width = ctx.measureText(text).width + 20
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, width, BADGE_HEIGHT)
  ctx.strokeStyle = border
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, BADGE_HEIGHT - 1)
  ctx.fillStyle = color
  ctx.fillText(text, x + 10, y + 5)
}

/* ---------------------------------- */
/* 周易原文：本卦与变卦并排，逐行对齐 */
/* ---------------------------------- */

const CLASSIC_HEAD_HEIGHT = 98
const CLASSIC_NOTE_HEIGHT = 52

interface ClassicCell {
  label: string
  text: string
  lines: string[]
  mutating: boolean
}

interface ClassicRow {
  kind: 'head' | 'text'
  height: number
  cells: Array<ClassicCell | null>
}

function classicColumns(classics: ShareClassicsModel): ShareClassicHexagramModel[] {
  return classics.result ? [classics.primary, classics.result] : [classics.primary]
}

function classicLayout(columns: number) {
  const columnWidth = CONTENT_WIDTH / columns
  const labelWidth = columns > 1 ? 92 : 120
  return { columnWidth, labelWidth, textWidth: columnWidth - labelWidth - 24 - 20 }
}

function measureClassicRows(ctx: CanvasRenderingContext2D, classics: ShareClassicsModel): ClassicRow[] {
  const columns = classicColumns(classics)
  const { textWidth } = classicLayout(columns.length)
  setFont(ctx, CLASSIC_TEXT_SIZE)
  const cell = (label: string, text: string, mutating: boolean): ClassicCell => ({
    label,
    text,
    lines: wrapText(ctx, text, textWidth),
    mutating,
  })
  const textRow = (cells: Array<ClassicCell | null>): ClassicRow => ({
    kind: 'text',
    cells,
    height: Math.max(66, ...cells.map((item) => (item ? item.lines.length * CLASSIC_LINE_HEIGHT + 32 : 0))),
  })

  const rows: ClassicRow[] = [
    { kind: 'head', height: CLASSIC_HEAD_HEIGHT, cells: [] },
    textRow(columns.map((column) => cell('卦辞', column.statement, false))),
  ]
  for (let index = 0; index < 6; index += 1) {
    rows.push(textRow(columns.map((column) => {
      const line = column.lines[index]
      return line ? cell(line.label, line.text, line.mutating) : null
    })))
  }
  if (columns.some((column) => column.special)) {
    rows.push(textRow(columns.map((column) => (
      column.special ? cell(column.special.label, column.special.text, column.special.mutating) : null
    ))))
  }
  return rows
}

function drawClassics(ctx: CanvasRenderingContext2D, model: ShareImageModel, layout: ShareLayout): void {
  const y = layout.classicsY
  const columns = classicColumns(model.classics)
  const { columnWidth, labelWidth } = classicLayout(columns.length)
  drawPanel(ctx, PAD, y, CONTENT_WIDTH, layout.classicsHeight, '周易原文')

  let rowY = y
  layout.classicRows.forEach((row) => {
    if (row.kind === 'head') {
      ctx.fillStyle = COLORS.surface
      ctx.fillRect(PAD + 1, rowY + 1, CONTENT_WIDTH - 2, row.height - 1)
      drawPanelTag(ctx, PAD, y, '周易原文')
      columns.forEach((column, index) => {
        const x = PAD + index * columnWidth + 24
        const hexNumber = index === 0 ? model.primary.hexNumber : model.result.hexNumber
        const label = model.hasMutation ? column.label : `${column.label} · 无变爻`
        setFont(ctx, 18)
        ctx.fillStyle = COLORS.fog
        ctx.fillText(`${label} / ${hexNumber}`, x, rowY + 30)
        setFont(ctx, 30, true)
        ctx.fillStyle = COLORS.signal
        ctx.fillText(column.name, x, rowY + 54)
      })
    } else {
      row.cells.forEach((item, index) => {
        if (!item) return
        const x = PAD + index * columnWidth
        if (item.mutating) {
          ctx.fillStyle = 'rgba(255, 77, 106, 0.09)'
          ctx.fillRect(x + 1, rowY + 1, columnWidth - 2, row.height - 1)
          ctx.fillStyle = COLORS.flux
          ctx.fillRect(x + 1, rowY + 1, 3, row.height - 1)
        }
        setFont(ctx, 20, item.mutating)
        ctx.fillStyle = item.mutating ? COLORS.flux : COLORS.signal
        ctx.fillText(item.label, x + 24, rowY + 18)
        if (item.mutating) {
          setFont(ctx, 16)
          ctx.fillText('动爻', x + 24, rowY + 44)
        }
        setFont(ctx, CLASSIC_TEXT_SIZE)
        ctx.fillStyle = COLORS.ink
        item.lines.forEach((text, lineIndex) => {
          ctx.fillText(text, x + 24 + labelWidth, rowY + 16 + lineIndex * CLASSIC_LINE_HEIGHT)
        })
      })
    }
    rowY += row.height
    strokeLine(ctx, PAD, rowY, PAD + CONTENT_WIDTH, rowY, COLORS.edge)
  })

  if (columns.length > 1) {
    strokeLine(ctx, PAD + columnWidth, y, PAD + columnWidth, rowY, COLORS.edgeBright)
  }
  setFont(ctx, 18)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('仅录《周易》卦辞与爻辞，不含彖传、象传。', PAD + 24, rowY + 16)
}

/* ---------------------------------- */
/* 神煞与页脚                          */
/* ---------------------------------- */

interface ShenshaChip {
  item: ShareShenshaModel
  x: number
  y: number
  width: number
}

const CHIP_HEIGHT = 44
const CHIP_GAP = 12

function measureShensha(ctx: CanvasRenderingContext2D, model: ShareImageModel) {
  const chips: ShenshaChip[] = []
  const left = PAD + 24
  const right = PAD + CONTENT_WIDTH - 24
  let x = left
  let y = 34
  model.shensha.forEach((item) => {
    const width = shenshaChipWidth(ctx, item)
    if (x + width > right) {
      x = left
      y += CHIP_HEIGHT + CHIP_GAP
    }
    chips.push({ item, x, y, width })
    x += width + CHIP_GAP
  })
  const contentHeight = chips.length > 0 ? y + CHIP_HEIGHT : 34 + 30
  return { chips, height: contentHeight + 26 }
}

function shenshaChipWidth(ctx: CanvasRenderingContext2D, item: ShareShenshaModel): number {
  setFont(ctx, 20)
  let width = 16 + ctx.measureText(item.name).width + 10
  setFont(ctx, 22)
  width += ctx.measureText(item.branches).width + 16
  if (item.position) {
    setFont(ctx, 18)
    width += 14 + ctx.measureText(item.position).width + 14
  }
  return Math.ceil(width)
}

function drawShensha(ctx: CanvasRenderingContext2D, model: ShareImageModel, layout: ShareLayout): void {
  const y = layout.shenshaY
  drawPanel(ctx, PAD, y, CONTENT_WIDTH, layout.shenshaHeight, `神煞 · ${model.shensha.length} 项`)
  if (layout.shenshaChips.length === 0) {
    setFont(ctx, 22)
    ctx.fillStyle = COLORS.fog
    ctx.fillText('本次无神煞命中', PAD + 24, y + 38)
    return
  }

  layout.shenshaChips.forEach(({ item, x, y: offset, width }) => {
    const chipY = y + offset
    ctx.fillStyle = COLORS.surface
    ctx.fillRect(x, chipY, width, CHIP_HEIGHT)
    ctx.strokeStyle = item.position ? COLORS.edgeBright : COLORS.edge
    ctx.strokeRect(x + 0.5, chipY + 0.5, width - 1, CHIP_HEIGHT - 1)
    let cursor = x + 16
    setFont(ctx, 20)
    ctx.fillStyle = COLORS.fog
    ctx.fillText(item.name, cursor, chipY + 11)
    cursor += ctx.measureText(item.name).width + 10
    setFont(ctx, 22)
    ctx.fillStyle = COLORS.ink
    ctx.fillText(item.branches, cursor, chipY + 10)
    cursor += ctx.measureText(item.branches).width + 16
    if (item.position) {
      strokeLine(ctx, cursor, chipY + 10, cursor, chipY + CHIP_HEIGHT - 10, COLORS.edgeBright)
      setFont(ctx, 18)
      ctx.fillStyle = COLORS.signal
      ctx.fillText(item.position, cursor + 14, chipY + 13)
    }
  })
}

function drawFooter(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  strokeLine(ctx, PAD, y, WIDTH - PAD, y, COLORS.edgeBright)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('完整排盘由 HEX//64 在本地生成', PAD, y + 34)
  ctx.fillStyle = COLORS.signal
  const websiteLabel = `官方网站 · ${model.footer}`
  const websiteX = WIDTH - PAD - ctx.measureText(websiteLabel).width
  drawGlobeIcon(ctx, websiteX - 21, y + 46, 10)
  ctx.fillText(websiteLabel, websiteX, y + 34)
}

function drawGlobeIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  ctx.save()
  ctx.strokeStyle = COLORS.signal
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(centerX, centerY, radius * 0.45, radius, 0, 0, Math.PI * 2)
  ctx.stroke()
  strokeLine(ctx, centerX - radius, centerY, centerX + radius, centerY, COLORS.signal)
  ctx.restore()
}

/* ---------------------------------- */
/* 基础绘制                            */
/* ---------------------------------- */

/** 与结果页一致的面板：标签压在左上边框上 */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tag: string,
): void {
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  drawPanelTag(ctx, x, y, tag)
}

/** 有表头底色的面板要在铺完底色后再画一次标签，否则下半截会被盖住 */
function drawPanelTag(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string): void {
  setFont(ctx, 20)
  const tagWidth = ctx.measureText(tag).width + 24
  const tagHeight = 34
  const tagX = x + 18
  const tagY = y - tagHeight / 2
  ctx.fillStyle = COLORS.background
  ctx.fillRect(tagX, tagY, tagWidth, tagHeight)
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagWidth - 1, tagHeight - 1)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(tag, tagX + 12, tagY + 7)
}

/** 不能出现在行首的标点，换行时挂在上一行行尾 */
const NO_LINE_START = new Set([...'，。、；：！？）」』”’》〉'])

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const character of text) {
    const candidate = current + character
    if (current && !NO_LINE_START.has(character) && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = character
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/** 先缩小字号再兜底压缩，尽量不让文字被横向拉扁 */
function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
): void {
  let size = initialSize
  while (size > minimumSize) {
    setFont(ctx, size)
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 1
  }
  ctx.fillText(text, x, y, maxWidth)
}

function setFont(ctx: CanvasRenderingContext2D, size: number, bold = false): void {
  ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT_FAMILY}`
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.moveTo(x1 + 0.5, y1 + 0.5)
  ctx.lineTo(x2 + 0.5, y2 + 0.5)
  ctx.stroke()
}
