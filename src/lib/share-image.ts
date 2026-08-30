import { TRIGRAMS } from '@/data/trigrams'
import { INPUT_METHOD_LABELS } from '@/engine'
import { bitsToString } from '@/engine/binary'
import type { ChartData, ChartLine, HexStateInfo } from '@/types'

export const SHARE_IMAGE_SITE = 'liuyao.lemontea.xyz'

const WIDTH = 1080
const HEIGHT = 1920
const PAD = 54
const CONTENT_WIDTH = WIDTH - PAD * 2
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
  coin: '#f0bd67',
}

const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '六爻'] as const

export interface ShareImageOptions {
  sessionId?: string
  ordinal?: number | null
}

export interface ShareImageModel {
  title: string
  subtitle: string
  session: string
  ordinal: string | null
  method: string
  primary: ShareStateModel
  result: ShareStateModel
  mutationMask: string
  metadata: Array<{ label: string; value: string }>
  lines: ShareLineModel[]
  shensha: string[]
  footer: string
}

interface ShareStateModel {
  label: string
  name: string
  binary: string
  bits: number
  meta: string
  trigrams: string
}

interface ShareLineModel {
  name: string
  spirit: string
  primary: string
  primaryState: string
  result: string
  resultState: string
  change: string
  mutating: boolean
  fuShen: string | null
}

export function buildShareImageModel(
  chart: ChartData,
  options: ShareImageOptions = {},
): ShareImageModel {
  const visibleShensha = chart.shensha
    .filter((entry) => entry.branches.length > 0)
    .map((entry) => `${entry.name} · ${entry.branches.join('')}`)

  return {
    title: 'HEX//64 六爻排盘',
    subtitle: 'COMPLETE LIUYAO MATRIX',
    session: options.sessionId ? `排盘 ${options.sessionId}` : '本地排盘',
    ordinal: typeof options.ordinal === 'number'
      ? `全局第 ${options.ordinal.toLocaleString('zh-CN')} 次起卦`
      : options.ordinal === null
        ? '全局序号登记中'
        : null,
    method: INPUT_METHOD_LABELS[chart.inputMethod],
    primary: stateModel('本卦', chart.primary),
    result: stateModel('变卦', chart.result),
    mutationMask: bitsToString(chart.mutationMask),
    metadata: [
      { label: '起卦方式', value: INPUT_METHOD_LABELS[chart.inputMethod] },
      { label: '公历', value: chart.calendar.gregorian },
      { label: '农历', value: `${chart.calendar.lunarText}日 · ${chart.calendar.hourZhi}时` },
      { label: '时区', value: `${chart.calendar.timezone} ${chart.calendar.utcOffset}` },
      {
        label: '干支',
        value: `${chart.calendar.ganzhi.year}年 ${chart.calendar.ganzhi.month}月 ${chart.calendar.ganzhi.day}日 ${chart.calendar.ganzhi.hour}时`,
      },
      { label: '旬空', value: chart.calendar.xunKong.join('') },
      {
        label: '卦身',
        value: `${chart.guaShen.branch} · ${chart.guaShen.onHexagram ? '已上卦' : '未上卦'}`,
      },
    ],
    lines: [...chart.lines]
      .sort((a, b) => b.index - a.index)
      .map((line) => lineModel(chart, line)),
    shensha: visibleShensha.length > 0 ? visibleShensha : ['本次无神煞命中'],
    footer: SHARE_IMAGE_SITE,
  }
}

export async function createReadingShareImage(
  chart: ChartData,
  options: ShareImageOptions = {},
): Promise<Blob> {
  await document.fonts?.load(`24px ${FONT_FAMILY}`).catch(() => undefined)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')

  renderShareImage(ctx, buildShareImageModel(chart, options))

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

function stateModel(label: string, state: HexStateInfo): ShareStateModel {
  const upper = TRIGRAMS[state.record.upperKey]
  const lower = TRIGRAMS[state.record.lowerKey]
  return {
    label,
    name: state.record.chineseName,
    binary: state.binary,
    bits: state.bits,
    meta: `HEX ${String(state.record.kingWenNumber).padStart(2, '0')} · ${state.palace} · ${state.palaceRank}${state.attribute ? ` · ${state.attribute}` : ''}`,
    trigrams: `上卦 ${upper.name}${upper.symbol} / 下卦 ${lower.name}${lower.symbol}`,
  }
}

function lineModel(chart: ChartData, line: ChartLine): ShareLineModel {
  const resultYang = Boolean((chart.result.bits >> line.index) & 1)
  const fuShen = chart.fuShen.find((entry) => entry.index === line.index)
  return {
    name: LINE_NAMES[line.index] ?? `第${line.index + 1}爻`,
    spirit: line.primary.spirit ?? '—',
    primary: `${line.primary.relation} ${najiaText(line.primary.najia)}`,
    primaryState: `${line.yang ? (line.mutating ? '老阳 · 动' : '少阳 · 静') : (line.mutating ? '老阴 · 动' : '少阴 · 静')}${line.primary.shiYing ? ` · ${line.primary.shiYing}` : ''}`,
    result: `${line.result.relation} ${najiaText(line.result.najia)}`,
    resultState: `${resultYang ? '阳爻' : '阴爻'}${line.mutating ? ' · 变后' : ''}`,
    change: line.mutating ? '变' : '·',
    mutating: line.mutating,
    fuShen: fuShen ? `伏神 ${fuShen.relation} ${najiaText(fuShen.najia)}` : null,
  }
}

function najiaText(najia: ChartLine['primary']['najia']): string {
  return `${najia.stem}${najia.branch}${najia.element}`
}

function renderShareImage(ctx: CanvasRenderingContext2D, model: ShareImageModel): void {
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  drawGrid(ctx)

  ctx.textBaseline = 'top'
  setFont(ctx, 52, true)
  ctx.fillStyle = COLORS.signal
  ctx.fillText(model.title, PAD, 52)
  setFont(ctx, 26)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(model.subtitle, PAD, 112)
  ctx.textAlign = 'right'
  setFont(ctx, 28)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(model.session, WIDTH - PAD, 58)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(model.ordinal ?? model.method, WIDTH - PAD, 96)
  ctx.textAlign = 'left'
  strokeLine(ctx, PAD, 148, WIDTH - PAD, 148, COLORS.edgeBright)

  drawSummary(ctx, model, 174)
  drawMetadata(ctx, model, 516)
  drawMatrix(ctx, model, 824)
  drawShensha(ctx, model, 1580)
  drawFooter(ctx, model)
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(61, 245, 198, 0.025)'
  ctx.lineWidth = 1
  for (let x = 0; x <= WIDTH; x += 24) strokeLine(ctx, x, 0, x, HEIGHT, ctx.strokeStyle)
  for (let y = 0; y <= HEIGHT; y += 24) strokeLine(ctx, 0, y, WIDTH, y, ctx.strokeStyle)
  ctx.restore()
}

function drawSummary(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  const gap = 24
  const stateWidth = (CONTENT_WIDTH - gap) / 2
  const resultX = PAD + stateWidth + gap
  drawStateCard(ctx, model.primary, PAD, y, stateWidth, 318, model.mutationMask)
  drawStateCard(ctx, model.result, resultX, y, stateWidth, 318, '000000')
}

function drawStateCard(
  ctx: CanvasRenderingContext2D,
  state: ShareStateModel,
  x: number,
  y: number,
  width: number,
  height: number,
  mutationMask: string,
): void {
  ctx.fillStyle = COLORS.surface
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.signal
  ctx.fillText(state.label, x + 24, y + 20)
  ctx.textAlign = 'right'
  ctx.fillText(state.binary, x + width - 24, y + 20)
  ctx.textAlign = 'left'
  setFont(ctx, 40, true)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(state.name, x + 24, y + 55)
  setFont(ctx, 22)
  ctx.fillStyle = COLORS.fog
  drawFittedText(ctx, state.meta, x + 24, y + 108, width - 48, 22, 17)
  drawFittedText(ctx, state.trigrams, x + 24, y + 140, width - 48, 22, 18)
  drawHexagram(ctx, state.bits, mutationMask, x + 28, y + 176, width - 56)
}

function drawHexagram(
  ctx: CanvasRenderingContext2D,
  bits: number,
  mutationMask: string,
  x: number,
  y: number,
  width: number,
): void {
  const lineHeight = 12
  const lineGap = 10
  for (let displayIndex = 0; displayIndex < 6; displayIndex += 1) {
    const index = 5 - displayIndex
    const yang = Boolean((bits >> index) & 1)
    const mutating = mutationMask[displayIndex] === '1'
    ctx.fillStyle = mutating ? COLORS.flux : COLORS.ink
    const lineY = y + displayIndex * (lineHeight + lineGap)
    if (yang) {
      ctx.fillRect(x, lineY, width, lineHeight)
    } else {
      const segmentWidth = width * 0.43
      ctx.fillRect(x, lineY, segmentWidth, lineHeight)
      ctx.fillRect(x + width - segmentWidth, lineY, segmentWidth, lineHeight)
    }
  }
}

function drawMetadata(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  drawPanel(ctx, PAD, y, CONTENT_WIDTH, 282, '历法与元数据')
  const colWidth = CONTENT_WIDTH / 2
  const byLabel = new Map(model.metadata.map((item) => [item.label, item.value]))
  const halfWidth = colWidth - 36
  drawMetadataItem(ctx, '起卦方式', byLabel.get('起卦方式') ?? '', PAD + 24, y + 76, halfWidth)
  drawMetadataItem(ctx, '公历', byLabel.get('公历') ?? '', PAD + colWidth + 24, y + 76, halfWidth)
  drawMetadataItem(ctx, '农历', byLabel.get('农历') ?? '', PAD + 24, y + 126, halfWidth)
  drawMetadataItem(ctx, '时区', byLabel.get('时区') ?? '', PAD + colWidth + 24, y + 126, halfWidth)
  drawMetadataItem(ctx, '干支', byLabel.get('干支') ?? '', PAD + 24, y + 176, CONTENT_WIDTH - 48)
  drawMetadataItem(ctx, '旬空', byLabel.get('旬空') ?? '', PAD + 24, y + 226, halfWidth)
  drawMetadataItem(ctx, '卦身', byLabel.get('卦身') ?? '', PAD + colWidth + 24, y + 226, halfWidth)
}

function drawMetadataItem(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  setFont(ctx, 21)
  ctx.fillStyle = COLORS.fog
  ctx.fillText(label, x, y)
  setFont(ctx, 25)
  ctx.fillStyle = COLORS.ink
  drawFittedText(ctx, value, x + 104, y - 2, width - 104, 25, 18)
}

function drawMatrix(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  const headerHeight = 54
  const rowHeight = 111
  const railWidth = 122
  const sideWidth = 355
  const changeWidth = 140
  const xPrimary = PAD + railWidth
  const xChange = xPrimary + sideWidth
  const xResult = xChange + changeWidth

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(PAD, y, CONTENT_WIDTH, headerHeight)
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(PAD + 0.5, y + 0.5, CONTENT_WIDTH - 1, headerHeight + rowHeight * 6 - 1)
  const columns = [PAD, xPrimary, xChange, xResult, PAD + CONTENT_WIDTH]
  columns.slice(1, -1).forEach((x) => strokeLine(ctx, x, y, x, y + headerHeight + rowHeight * 6, COLORS.edge))
  setFont(ctx, 22)
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.fog
  ctx.fillText('爻位 / 六神', PAD + railWidth / 2, y + 17)
  ctx.fillStyle = COLORS.signal
  ctx.fillText('本卦', xPrimary + sideWidth / 2, y + 17)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('变化', xChange + changeWidth / 2, y + 17)
  ctx.fillStyle = COLORS.signal
  ctx.fillText('变卦', xResult + sideWidth / 2, y + 17)

  model.lines.forEach((line, row) => {
    const rowY = y + headerHeight + row * rowHeight
    strokeLine(ctx, PAD, rowY, PAD + CONTENT_WIDTH, rowY, COLORS.edge)
    if (line.mutating) {
      ctx.fillStyle = 'rgba(255, 77, 106, 0.045)'
      ctx.fillRect(PAD, rowY, CONTENT_WIDTH, rowHeight)
    }
    setFont(ctx, 24, true)
    ctx.fillStyle = COLORS.signal
    ctx.fillText(line.name, PAD + railWidth / 2, rowY + 24)
    setFont(ctx, 20)
    ctx.fillStyle = COLORS.ink
    ctx.fillText(line.spirit, PAD + railWidth / 2, rowY + 66)

    drawLineCell(ctx, line, xPrimary, rowY, sideWidth, true)
    drawLineCell(ctx, line, xResult, rowY, sideWidth, false)
    setFont(ctx, line.mutating ? 30 : 24, line.mutating)
    ctx.fillStyle = line.mutating ? COLORS.flux : COLORS.fog
    ctx.fillText(line.change, xChange + changeWidth / 2, rowY + 37)
  })
  ctx.textAlign = 'left'
}

function drawLineCell(
  ctx: CanvasRenderingContext2D,
  line: ShareLineModel,
  x: number,
  y: number,
  width: number,
  primary: boolean,
): void {
  ctx.save()
  ctx.textAlign = 'left'
  const glyphWidth = 105
  const glyphY = y + 31
  ctx.fillStyle = primary && line.mutating ? COLORS.flux : COLORS.ink
  const yang = primary
    ? line.primaryState.startsWith('少阳') || line.primaryState.startsWith('老阳')
    : line.resultState.startsWith('阳爻')
  if (yang) {
    ctx.fillRect(x + 18, glyphY, glyphWidth, 10)
  } else {
    const segment = glyphWidth * 0.43
    ctx.fillRect(x + 18, glyphY, segment, 10)
    ctx.fillRect(x + 18 + glyphWidth - segment, glyphY, segment, 10)
  }

  const textX = x + 142
  setFont(ctx, 24, true)
  ctx.fillStyle = COLORS.ink
  drawFittedText(ctx, primary ? line.primary : line.result, textX, y + 17, width - 158, 24, 18)
  setFont(ctx, 20)
  ctx.fillStyle = primary && line.mutating ? COLORS.flux : COLORS.fog
  drawFittedText(ctx, primary ? line.primaryState : line.resultState, textX, y + 49, width - 158, 20, 16)
  if (primary && line.fuShen) {
    setFont(ctx, 18)
    ctx.fillStyle = COLORS.coin
    drawFittedText(ctx, line.fuShen, textX, y + 78, width - 158, 18, 15)
  }
  ctx.restore()
}

function drawShensha(ctx: CanvasRenderingContext2D, model: ShareImageModel, y: number): void {
  drawPanel(ctx, PAD, y, CONTENT_WIDTH, 210, `神煞 · ${model.shensha.length} 项`)
  let x = PAD + 24
  let chipY = y + 64
  const maxX = WIDTH - PAD - 24
  setFont(ctx, 22)
  model.shensha.forEach((item) => {
    const chipWidth = Math.ceil(ctx.measureText(item).width) + 30
    if (x + chipWidth > maxX) {
      x = PAD + 24
      chipY += 50
    }
    ctx.fillStyle = COLORS.surface
    ctx.fillRect(x, chipY, chipWidth, 40)
    ctx.strokeStyle = COLORS.edgeBright
    ctx.strokeRect(x + 0.5, chipY + 0.5, chipWidth - 1, 39)
    ctx.fillStyle = COLORS.ink
    ctx.fillText(item, x + 15, chipY + 8)
    x += chipWidth + 12
  })
}

function drawFooter(ctx: CanvasRenderingContext2D, model: ShareImageModel): void {
  const y = 1810
  strokeLine(ctx, PAD, y, WIDTH - PAD, y, COLORS.edgeBright)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.fog
  ctx.fillText('完整排盘由 HEX//64 在本地生成', PAD, y + 31)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.signal
  const websiteLabel = `官方网站 · ${model.footer}`
  const websiteWidth = ctx.measureText(websiteLabel).width
  const websiteX = WIDTH - PAD - websiteWidth
  drawGlobeIcon(ctx, websiteX - 21, y + 43, 10)
  ctx.fillText(websiteLabel, websiteX, y + 31)
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
  strokeLine(
    ctx,
    centerX - radius,
    centerY,
    centerX + radius,
    centerY,
    COLORS.signal,
  )
  ctx.restore()
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
): void {
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = COLORS.edgeBright
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  setFont(ctx, 24)
  ctx.fillStyle = COLORS.signal
  ctx.fillText(title, x + 20, y + 17)
  strokeLine(ctx, x, y + 54, x + width, y + 54, COLORS.edge)
}

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
  color: string | CanvasGradient | CanvasPattern,
): void {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.moveTo(x1 + 0.5, y1 + 0.5)
  ctx.lineTo(x2 + 0.5, y2 + 0.5)
  ctx.stroke()
}
