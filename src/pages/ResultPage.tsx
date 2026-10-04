import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FullReading } from '@/components/FullReading'
import { HexLines } from '@/components/HexLines'
import { ReadingOutcomePanel, useNoteDraft } from '@/components/ReadingNotesPanel'
import { ResultDock, ResultToolbar } from '@/components/ResultToolbar'
import { SupportNudge } from '@/components/SupportNudge'
import { generateChart } from '@/engine'
import { bitsToString } from '@/engine/binary'
import { TRIGRAMS } from '@/data/trigrams'
import { trigramKeyByRemainder } from '@/features/number/derive'
import type { HanziSeed } from '@/features/hanzi/derive'
import { formatRawText } from '@/formatters/rawText'
import { trackEvent } from '@/lib/analytics'
import { buildShareUrl, parseShareLink } from '@/lib/share-link'
import { isFreshReading, milestoneForReading } from '@/lib/support-nudge'
import type { ChartData, HexStateInfo, LineValue } from '@/types'
import { INPUT_METHOD_LABELS_UI, useReading } from '@/store/reading'
import type { ReadingRecord } from '@/store/reading'
import { useSettings } from '@/store/settings'

type RawLines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

export function ResultPage() {
  const location = useLocation()
  const { current, commitReading } = useReading()
  const { resolvedTimezone } = useSettings()

  const linkParams = useMemo(() => parseShareLink(new URLSearchParams(location.hash.slice(1))), [location.hash])
  const restoredLink = useMemo(() => {
    if (!linkParams) return null
    const rawLines = rawLinesFromBits(linkParams.primary, linkParams.mask)
    const chart = generateChart({
      inputMethod: linkParams.inputMethod ?? 'link',
      rawLines,
      when: linkParams.when,
      timezone: linkParams.timezone ?? resolvedTimezone,
    })
    return { chart, rawLines }
  }, [linkParams, resolvedTimezone])
  const currentMatchesLink = !linkParams || Boolean(
    restoredLink &&
    current &&
    (current.source === 'share-link' || current.chart.inputMethod === 'link') &&
    current.chart.primary.bits === restoredLink.chart.primary.bits &&
    current.chart.mutationMask === restoredLink.chart.mutationMask &&
    current.chart.createdAt === restoredLink.chart.createdAt &&
    current.chart.calendar.timezone === restoredLink.chart.calendar.timezone &&
    current.chart.inputMethod === restoredLink.chart.inputMethod &&
    (!linkParams.readingId || current.id === linkParams.readingId) &&
    (!linkParams.ordinal || current.ordinal === linkParams.ordinal)
  )

  useEffect(() => {
    if (!linkParams || !restoredLink || currentMatchesLink) return
    commitReading(restoredLink.chart, restoredLink.rawLines, {
      fromShareLink: true,
      readingId: linkParams.readingId,
      ordinal: linkParams.ordinal,
    })
  }, [linkParams, restoredLink, currentMatchesLink, commitReading])

  if (!current || !currentMatchesLink) {
    if (linkParams) {
      return <p className="pt-10 text-[0.9375rem] tracking-widest text-fog">正在还原卦象…</p>
    }
    return (
      <div className="pt-10 text-base leading-loose text-fog">
        <h1 className="sr-only">六爻排盘结果</h1>
        <p>当前没有排盘。</p>
        <Link to="/" className="text-signal">
          → 返回起卦
        </Link>
      </div>
    )
  }

  return (
    <ResultView
      key={current.id}
      record={current}
      isLinkMode={current.chart.inputMethod === 'link' || linkParams !== null}
      restoredOriginalContext={Boolean(linkParams?.when && linkParams.timezone && linkParams.inputMethod)}
    />
  )
}

/** 以排盘 ID 作为 key 挂载，所问草稿随排盘切换重置。 */
function ResultView({
  record,
  isLinkMode,
  restoredOriginalContext,
}: {
  record: ReadingRecord
  isLinkMode: boolean
  restoredOriginalContext: boolean
}) {
  const navigate = useNavigate()
  const { settings, setAiInstruction, setIncludeQuestion } = useSettings()
  const question = useNoteDraft(record, 'question')
  const toolbarRef = useRef<HTMLElement>(null)
  const toolbarInView = useInView(toolbarRef)

  const chart = record.chart
  const rawText = formatRawText(chart, {
    includeAiInstruction: settings.aiInstruction,
    aiInstructionPrompt: settings.aiInstructionPrompt,
    includeSource: settings.includeSource,
    question: settings.includeQuestion ? question.value : undefined,
  })
  const hasAiInstruction = settings.aiInstruction && settings.aiInstructionPrompt.trim().length > 0
  const hasQuestion = settings.includeQuestion && question.value.trim().length > 0
  // 起卦序号与里程碑提示只跟随刚完成的新排盘，从历史或分享链接打开时不出现
  const fresh = isFreshReading(record)
  const milestone = fresh ? milestoneForReading(record.id) : null

  const output = {
    chart,
    sessionId: record.id,
    ordinal: record.ordinal,
    getRawText: () => rawText,
    onCopied: () => trackEvent('成功复制排盘', {
      是否包含AI指令: hasAiInstruction,
      是否包含所问: hasQuestion,
    }),
  }
  const shareUrl = () => buildShareUrl(
    chart,
    new URL(import.meta.env.BASE_URL, window.location.origin).href,
    { readingId: record.id, ordinal: record.ordinal },
  )
  const startOver = () => navigate('/')

  return (
    <div className="result-page pt-5">
      <h1 className="sr-only">六爻排盘结果</h1>

      <div className="result-session-bar mb-4 border border-edge bg-surface px-3 py-2 text-[0.875rem] tracking-[0.18em] text-fog">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="result-session-meta flex items-center gap-3">
            <span className="shrink-0 whitespace-nowrap text-signal">排盘 {record.id}</span>
            <span className="shrink-0" aria-hidden="true">//</span>
            <span className="shrink-0 whitespace-nowrap">{INPUT_METHOD_LABELS_UI[chart.inputMethod]}</span>
            {isLinkMode && chart.inputMethod !== 'link' && (
              <>
                <span className="shrink-0" aria-hidden="true">//</span>
                <span className="shrink-0 whitespace-nowrap">来自分享链接</span>
              </>
            )}
          </span>
          <span className="result-session-time whitespace-nowrap tabular-nums">{chart.createdAt}</span>
        </div>
        {isLinkMode && (
          <p className="result-session-note" role="note">
            {restoredOriginalContext
              ? '已按原起卦时间与时区还原。'
              : '旧版分享链接没有保存起卦时刻，历法按查看时刻重新计算。'}
          </p>
        )}
      </div>

      {chart.inputMethod === 'hanzi' && record.hanziSeed && (
        <HanziSeedResult seed={record.hanziSeed} />
      )}

      <HexSummary chart={chart} />

      <ResultToolbar
        ref={toolbarRef}
        {...output}
        question={question}
        getShareUrl={shareUrl}
        onEdit={() => navigate('/', { state: { editRawLines: record.rawLines } })}
        onStartOver={startOver}
        includeQuestion={settings.includeQuestion}
        onIncludeQuestionChange={setIncludeQuestion}
        aiInstruction={settings.aiInstruction}
        onAiInstructionChange={setAiInstruction}
      />

      <FullReading chart={chart} rawText={rawText} />

      <ReadingOutcomePanel record={record} />

      {record.ordinal !== undefined && (
        <p
          className="mt-4 border border-edge bg-panel px-4 py-3 text-center text-[0.9375rem] tracking-[0.16em] text-fog"
          aria-live="polite"
        >
          {record.ordinal === null ? (
            <span>正在登记全局序号…</span>
          ) : (
            <span>
              这是HEX//64自上线以来完成的
              <span className="inline-flex items-center align-middle whitespace-nowrap">
                第<strong className="text-lg font-bold tabular-nums text-signal">
                  {record.ordinal.toLocaleString('zh-CN')}
                </strong>次起卦
              </span>
            </span>
          )}
        </p>
      )}

      {milestone !== null ? (
        <SupportNudge key={record.id} kind="milestone" occurrence={record.id} className="mt-3 text-center">
          这是你在 HEX//64 排的第 {milestone} 卦。如果它一直有用，欢迎支持本站继续免费、无广告。
        </SupportNudge>
      ) : fresh && typeof record.ordinal === 'number' && (
        <SupportNudge key={record.id} kind="ordinal" occurrence={record.id} className="mt-3 text-center">
          HEX//64 不接广告，服务器与域名费用靠打赏维持。
        </SupportNudge>
      )}

      <ResultDock visible={!toolbarInView} {...output} onStartOver={startOver} />
    </div>
  )
}

/** 元素是否与视口相交；不支持 IntersectionObserver 时视为可见。 */
function useInView(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

function HexSummary({ chart }: { chart: ChartData }) {
  const hasMutation = chart.mutationMask !== 0

  return (
    <section className="result-summary" aria-label={hasMutation ? '本卦与变卦' : '本卦'}>
      <HexSummaryCard tag="本卦" state={chart.primary} mask={chart.mutationMask} markLines />
      {hasMutation ? (
        <>
          <div className="result-summary-xor" aria-label={`动爻标记 ${bitsToString(chart.mutationMask)}`}>
            <span>动爻</span>
            <strong>{bitsToString(chart.mutationMask)}</strong>
            <span aria-hidden="true">XOR →</span>
          </div>
          <HexSummaryCard tag="变卦" state={chart.result} mask={chart.mutationMask} />
        </>
      ) : (
        <div className="result-summary-quiet">
          <strong>六爻安静</strong>
          <span>无动爻，不生变卦</span>
        </div>
      )}
    </section>
  )
}

function HexSummaryCard({
  tag,
  state,
  mask,
  markLines = false,
}: {
  tag: string
  state: HexStateInfo
  mask: number
  /** 卦画上标出动爻；变卦只在二进制位上标出翻转位 */
  markLines?: boolean
}) {
  const upper = TRIGRAMS[state.record.upperKey]
  const lower = TRIGRAMS[state.record.lowerKey]

  return (
    <div className="result-summary-card panel">
      <span className="panel-tag">{tag}</span>
      <div className="result-summary-glyph">
        <HexLines
          bits={state.bits}
          mask={markLines ? mask : 0}
          compact
          showLabels={false}
          showMutationLabels={false}
        />
      </div>
      <div className="result-summary-text">
        <p className="result-summary-name">{state.record.chineseName}</p>
        <p className="result-summary-binary chroma tabular-nums" aria-label={state.binary}>
          {[...state.binary].map((digit, position) => (
            <span key={position} data-changed={Boolean((mask >> (5 - position)) & 1)}>
              {digit}
            </span>
          ))}
        </p>
        <p className="result-summary-meta">
          <span>HEX {String(state.record.kingWenNumber).padStart(2, '0')}</span>
          <span>
            {[state.palace, state.palaceRank, state.attribute].filter(Boolean).join('\u00a0· ')}
          </span>
          <span>上{upper.name}{upper.symbol} 下{lower.name}{lower.symbol}</span>
        </p>
      </div>
    </div>
  )
}

function HanziSeedResult({ seed }: { seed: HanziSeed }) {
  const upperTrigram = TRIGRAMS[
    trigramKeyByRemainder(seed.upperRemainder) as keyof typeof TRIGRAMS
  ].name
  const lowerTrigram = TRIGRAMS[
    trigramKeyByRemainder(seed.lowerRemainder) as keyof typeof TRIGRAMS
  ].name
  const unit = seed.strategy === 'character-count' ? '字' : '画'
  const splitLabels = hanziSplitLabels(seed.singleCharacterParts?.layout)

  return (
    <section className="panel mb-4 p-4 sm:p-5" aria-label="汉字起卦推演明细">
      <span className="panel-tag">汉字取象 // 推演明细</span>
      <div className="hanzi-seed-preview">
        <div className="hanzi-seed-groups">
          <div>
            <span className="hanzi-seed-label">上卦 · {splitLabels[0]}</span>
            <strong>{seed.upperText || '—'}</strong>
            <span>{seed.upperValue} {unit} → {upperTrigram}</span>
          </div>
          <div>
            <span className="hanzi-seed-label">下卦 · {splitLabels[1]}</span>
            <strong>{seed.lowerText || '—'}</strong>
            <span>{seed.lowerValue} {unit} → {lowerTrigram}</span>
          </div>
          <div>
            <span className="hanzi-seed-label">动爻 · 合计</span>
            <strong>{seed.movingValue}</strong>
            <span>{unit}数取余 → L{seed.movingLine + 1}</span>
          </div>
        </div>
        {seed.strategy === 'stroke-count' && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-fog">
            单字笔画：{seed.characters.map((character, index) => (
              <span key={`${character}-${index}`} className="mr-3 inline-block">
                {character} {seed.characterStrokes[index]} 画 /
              </span>
            ))}
          </p>
        )}
        {seed.strategy === 'character-count' && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-fog">
            共 {seed.characters.length} 字，已按字数推演，不再计算笔画。
          </p>
        )}
      </div>
    </section>
  )
}

function hanziSplitLabels(
  layout: 'horizontal' | 'vertical' | 'other' | undefined,
): [string, string] {
  if (layout === 'horizontal') return ['左部', '右部']
  if (layout === 'vertical') return ['上部', '下部']
  if (layout === 'other') return ['第一部分', '第二部分']
  return ['前半', '后半']
}

function rawLinesFromBits(primary: number, mask: number): RawLines {
  const lines = [] as unknown as RawLines
  for (let i = 0; i < 6; i++) {
    const yang = (primary >> i) & 1
    const mutating = (mask >> i) & 1
    lines[i] = mutating ? (yang ? 9 : 6) : yang ? 7 : 8
  }
  return lines
}
