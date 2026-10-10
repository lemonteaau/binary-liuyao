import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, KeyboardEvent, Ref, RefObject, SetStateAction } from 'react'
import { Clock } from '@phosphor-icons/react/dist/icons/Clock'
import { CoinVertical } from '@phosphor-icons/react/dist/icons/CoinVertical'
import { HandPalm } from '@phosphor-icons/react/dist/icons/HandPalm'
import { Monitor } from '@phosphor-icons/react/dist/icons/Monitor'
import { useLocation, useNavigate } from 'react-router-dom'
import { CoinTossStage } from '@/components/CoinTossStage'
import type { CoinStageHandle } from '@/components/CoinTossStage'
import { DeriveStage } from '@/components/DeriveStage'
import type { DeriveStageHandle } from '@/components/DeriveStage'
import { EntropyStage } from '@/components/EntropyStage'
import type { EntropyStageHandle } from '@/components/EntropyStage'
import { useActionIntro } from '@/components/useActionIntro'
import { LiveTimestamp } from '@/components/LiveClock'
import { ScrambleText } from '@/components/ScrambleText'
import { generateChart } from '@/engine'
import {
  lineIsMutating,
  lineIsYang,
  rawLinesToMutationMask,
  rawLinesToPrimaryBits,
  resultBitsOf,
  scoreCoinToss,
  tossCoins,
  tossRawLines,
} from '@/engine/binary'
import type { CoinToss } from '@/engine/binary'
import { hexagramByBits } from '@/data/hexagrams'
import {
  NUMBER_SEED_FIELDS,
  rawLinesFromNumbers,
  splitPastedNumbers,
} from '@/features/number/derive'
import type { NumberSeedIssue } from '@/features/number/derive'
import {
  DERIVE_LINE_NAMES,
  DERIVE_STEP_LABELS,
  hanziScript,
  numberScript,
  shownRemainder,
  timeScript,
} from '@/features/derive-cast/script'
import type { DeriveScript, DeriveStep } from '@/features/derive-cast/script'
import { deriveTimeSeed } from '@/features/time/derive'
import { rawLinesFromRecord, searchHexagrams } from '@/features/hexagram-search/search'
import {
  coinShakeReducer,
  completeRawLinesOf,
  createCoinShakeState,
} from '@/features/coin-shake/model'
import type { CoinShakeAction, CoinShakeState, CompleteRawLines } from '@/features/coin-shake/model'
import { flyLine } from '@/features/coin-shake/line-flight'
import type { LineFlight } from '@/features/coin-shake/line-flight'
import type { HanziDerivation } from '@/features/hanzi/derive'
import { trackDivinationEvent, trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/cn'
import { getCurrentHexagramOrdinal } from '@/lib/hexagram-counter'
import { scrollIntoViewIfNeeded } from '@/lib/interaction-scroll'
import { motionEnabled } from '@/lib/motion'
import { formatTimezone } from '@/lib/timezone-display'
import { useReading } from '@/store/reading'
import { useSettings } from '@/store/settings'
import { TRIGRAMS, TRIGRAM_KEYS } from '@/data/trigrams'
import type { TrigramKey } from '@/data/trigrams'
import type { HexagramRecord, InputMethod, LineValue } from '@/types'

type RawLines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

const MODES: Array<{ id: InputMethod; title: string; sub: string }> = [
  { id: 'coin', title: '摇币起卦', sub: '逐爻摇币 · 三枚铜钱' },
  { id: 'entropy', title: '电脑起卦', sub: '加密随机 · 一键完成' },
  { id: 'manual', title: '手动排卦', sub: '逐爻设置 · 阴阳动静' },
  { id: 'hexagram', title: '卦名起卦', sub: '按卦名选择 · 指定动爻' },
  { id: 'number', title: '数字起卦', sub: '输入数字 · 自动推演' },
  { id: 'time', title: '时间起卦', sub: '当前时间 · 自动推演' },
  { id: 'hanzi', title: '汉字起卦', sub: '取字计画 · 自动推演' },
]

const COIN_LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const
const GENERATOR_SHIFT_DURATION_MS = 520
/** 三枚铜钱落定后停顿片刻，再把爻线送进记录 */
const LINE_TRANSFER_DELAY_MS = 520
/** 入场的三枚铜钱落稳之后，再弹出操作提示 */
const COIN_ACTION_INTRO_DELAY_MS = 950

export function GeneratorPage() {
  const location = useLocation()
  const editRawLines = (location.state as { editRawLines?: RawLines } | null)?.editRawLines
  const [mode, setMode] = useState<InputMethod | null>(editRawLines ? 'manual' : null)
  const [draft, setDraft] = useState<RawLines>(() =>
    editRawLines ? [...editRawLines] as RawLines : defaultDraft(),
  )
  const [coinState, dispatchCoin] = useReducer(
    coinShakeReducer,
    undefined,
    createCoinShakeState,
  )
  const [coinError, setCoinError] = useState<string | null>(null)
  const generatorPageRef = useRef<HTMLDivElement>(null)
  const generatorHeadingRef = useRef<HTMLDivElement>(null)
  const activePanelRef = useRef<HTMLDivElement>(null)
  const previousHeadingTopRef = useRef<number | null>(null)
  const shiftAnimationRef = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const previousTop = previousHeadingTopRef.current
    previousHeadingTopRef.current = null
    const page = generatorPageRef.current
    const heading = generatorHeadingRef.current
    if (previousTop === null || !page || !heading || !motionEnabled()) return

    const deltaY = previousTop - heading.getBoundingClientRect().top
    if (Math.abs(deltaY) < 1 || typeof page.animate !== 'function') return

    shiftAnimationRef.current?.cancel()
    const animation = page.animate(
      [
        { transform: `translateY(${deltaY}px)` },
        { transform: 'translateY(0)' },
      ],
      {
        duration: GENERATOR_SHIFT_DURATION_MS,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      },
    )
    shiftAnimationRef.current = animation

    animation.finished
      .then(() => {
        if (shiftAnimationRef.current !== animation) return
        animation.cancel()
        shiftAnimationRef.current = null
      })
      .catch(() => undefined)
  }, [mode])

  useEffect(() => {
    if (!mode) return
    let cancelled = false
    let frame: number | undefined
    const scheduleScroll = () => {
      if (cancelled) return
      frame = window.requestAnimationFrame(() => {
        scrollIntoViewIfNeeded(activePanelRef.current)
      })
    }
    const animation = shiftAnimationRef.current
    if (animation) void animation.finished.then(scheduleScroll, scheduleScroll)
    else scheduleScroll()
    return () => {
      cancelled = true
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [mode])

  useEffect(() => () => shiftAnimationRef.current?.cancel(), [])

  const selectMode = (nextMode: InputMethod) => {
    if (!mode && motionEnabled()) {
      previousHeadingTopRef.current = generatorHeadingRef.current?.getBoundingClientRect().top ?? null
    }
    if (mode !== nextMode) {
      trackDivinationEvent('选择起卦方式', nextMode)
    }
    setMode(nextMode)
  }

  return (
    <div
      ref={generatorPageRef}
      className={cn('generator-page pt-6', !mode && 'generator-page-idle')}
    >
      <div ref={generatorHeadingRef} className="generator-heading">
        <h1 className="text-2xl font-bold tracking-[0.2em]">六爻排盘</h1>
      </div>

      <div className="mode-grid" role="group" aria-label="起卦方式">
        {MODES.map((m, index) => (
          <button
            key={m.id}
            type="button"
            className="tile"
            data-active={mode === m.id}
            aria-pressed={mode === m.id}
            aria-controls="generator-active-panel"
            onClick={() => selectMode(m.id)}
          >
            <span className="tile-head">
              <span className="tile-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="tile-mode-icon" aria-hidden="true">
                <ModeIcon mode={m.id} />
              </span>
            </span>
            <span className="tile-title">{m.title}</span>
            <span className="tile-description">{m.sub}</span>
          </button>
        ))}
      </div>

      <HomepageCounter />

      <div
        id="generator-active-panel"
        ref={activePanelRef}
        className="generator-active-panel generator-scroll-target"
      >
        {mode === 'entropy' && <EntropyPanel />}
        {mode === 'coin' && (
          <CoinShakePanel
            state={coinState}
            dispatch={dispatchCoin}
            error={coinError}
            setError={setCoinError}
          />
        )}
        {mode === 'manual' && (
          <ManualPanel draft={draft} setDraft={setDraft} />
        )}
        {mode === 'hexagram' && (
          <HexNamePanel draft={draft} setDraft={setDraft} />
        )}
        {mode === 'number' && <NumberPanel />}
        {mode === 'time' && <TimePanel />}
        {mode === 'hanzi' && <HanziPanel />}
      </div>
    </div>
  )
}

function ModeIcon({ mode }: { mode: InputMethod }) {
  const props = { size: 23, weight: 'regular' as const }

  switch (mode) {
    case 'coin':
      return <CoinVertical {...props} />
    case 'entropy':
      return <Monitor {...props} />
    case 'manual':
      return <HandPalm {...props} />
    case 'hexagram':
      return <TrigramIcon />
    case 'number':
      return <span className="number-sequence-icon">123</span>
    case 'time':
      return <Clock {...props} />
    case 'hanzi':
      return <span className="hanzi-glyph-icon" aria-hidden="true">文</span>
    default:
      return null
  }
}

function TrigramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
    >
      <path d="M4 6h16M4 12h6m4 0h6M4 18h16" />
    </svg>
  )
}

function HomepageCounter() {
  const [ordinal, setOrdinal] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5_000)
    let active = true

    getCurrentHexagramOrdinal(controller.signal)
      .then((currentOrdinal) => {
        if (!active) return
        setOrdinal(currentOrdinal)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('unavailable')
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [])

  return (
    <p
      className="homepage-counter flex flex-wrap items-center justify-center gap-x-2 border border-edge bg-panel px-3 py-2 text-center text-[0.875rem] tracking-[0.14em] text-fog md:justify-end md:text-right"
      aria-live="polite"
      aria-busy={status === 'loading'}
    >
      <span data-nosnippet="" className="inline-flex flex-wrap items-center justify-center align-middle whitespace-nowrap">
        <span>自上线以来共完成</span>
        <span className="inline-flex items-center">
          <strong
            className="homepage-counter-number text-lg font-bold tabular-nums text-signal"
            data-loading={status === 'loading'}
            title={status === 'unavailable' ? '暂时无法获取起卦总数' : undefined}
          >
            {status === 'ready' && ordinal !== null
              ? ordinal.toLocaleString('zh-CN')
              : status === 'loading'
                ? '···'
                : '—'}
          </strong>次起卦
        </span>
      </span>
    </p>
  )
}

function defaultDraft(): RawLines {
  return rawLinesFromRecord(hexagramByBits(0b111111)!)
}

function Panel({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <section className="panel mt-4 p-4 sm:p-5">
      <span className="panel-tag">{tag}</span>
      {children}
    </section>
  )
}

function RitualGuide({ children }: { children: React.ReactNode }) {
  return (
    <div className="ritual-guide" aria-label="起卦提示">
      <span className="ritual-guide-mark" aria-hidden="true">念</span>
      <p>{children}</p>
    </div>
  )
}

interface EntropyCast {
  lines: RawLines
  when: Date
}

function EntropyPanel() {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone, settings } = useSettings()
  const stageRef = useRef<EntropyStageHandle>(null)
  const actionRef = useRef<HTMLSpanElement>(null)
  const [cast, setCast] = useState<EntropyCast | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [complete, setComplete] = useState(false)
  useActionIntro(actionRef, 'entropy', cast === null && settings.animation)

  function activate() {
    if (complete && cast) {
      finish(cast)
      return
    }
    if (cast) {
      // 采样结果早已确定，再次点击只是跳过演出
      stageRef.current?.skip()
      return
    }
    trackDivinationEvent('点击生成排盘', 'entropy')
    const tosses = [tossCoins(), tossCoins(), tossCoins(), tossCoins(), tossCoins(), tossCoins()]
    const next: EntropyCast = { lines: tosses.map(scoreCoinToss) as RawLines, when: new Date() }
    const playing = settings.animation && motionEnabled() && stageRef.current?.cast(tosses, {
      onLine: (index) => setRevealed(index + 1),
      onComplete: () => setComplete(true),
    })
    if (!playing) {
      finish(next)
      return
    }
    setCast(next)
  }

  function finish({ lines, when }: EntropyCast) {
    const chart = generateChart({
      inputMethod: 'entropy',
      rawLines: lines,
      when,
      timezone: resolvedTimezone,
    })
    commitReading(chart, lines)
    navigate('/result')
  }

  const casting = cast !== null && !complete
  const actionLabel = complete
    ? '卦已成，生成排盘'
    : casting
      ? '正在采样随机数，点击跳过'
      : '点击起卦'
  const statusText = complete
    ? '卦已成。再次点击生成排盘。'
    : casting
      ? `正在采样随机数，已得 ${revealed}/6 爻。`
      : ''

  return (
    <Panel tag="电脑起卦 // 加密随机">
      <RitualGuide>
        一事一问。先静心片刻，在心中默念所问之事；念定，再点击起卦。
      </RitualGuide>
      <button
        type="button"
        className="coin-console"
        data-kind="entropy"
        data-phase={complete ? 'complete' : casting ? 'casting' : 'standby'}
        onClick={activate}
        aria-label={actionLabel}
        aria-busy={casting}
      >
        <span className="coin-console-head">
          <span>RANDOM {String(revealed * 3).padStart(2, '0')} / 18 BIT</span>
          <span className="coin-console-tag">
            {complete ? 'COMPLETE' : casting ? 'SAMPLING' : 'STANDBY'}
          </span>
        </span>
        <EntropyStage ref={stageRef}>
          {complete && cast && (
            <span className="entropy-names">
              <HexagramNames lines={cast.lines} />
            </span>
          )}
        </EntropyStage>
        <span className={cn('coin-console-action', complete && 'coin-console-action-ready')}>
          {complete ? (
            <>
              <span>卦已成</span>
              <span>生成排盘 →</span>
            </>
          ) : (
            <span ref={actionRef} className="coin-console-cta">{actionLabel}</span>
          )}
        </span>
      </button>
      <p className="sr-only" aria-live="polite">{statusText}</p>
    </Panel>
  )
}

interface CoinReadout {
  coins: CoinToss
  settled: readonly boolean[]
  tally: boolean
}

function CoinShakePanel({
  state,
  dispatch,
  error,
  setError,
}: {
  state: CoinShakeState
  dispatch: Dispatch<CoinShakeAction>
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
}) {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone } = useSettings()
  const stageRef = useRef<CoinStageHandle>(null)
  const ghostLayerRef = useRef<HTMLDivElement>(null)
  const tallyGlyphRef = useRef<HTMLSpanElement>(null)
  const recordGlyphRefs = useRef<Array<HTMLSpanElement | null>>([])
  const transferTimerRef = useRef<number | null>(null)
  const flightRef = useRef<LineFlight | null>(null)
  // 采样结果立即写入状态；画面上的爻要等铜钱落定、爻线飞入记录后才显示
  const [revealed, setRevealed] = useState(state.lines.length)
  const [landing, setLanding] = useState(false)
  const [arrived, setArrived] = useState<number | null>(null)
  const [readout, setReadout] = useState<CoinReadout | null>(() =>
    state.coins && state.phase !== 'shaking'
      ? { coins: state.coins, settled: [true, true, true], tally: true }
      : null,
  )
  const [intro] = useState(() => state.phase === 'ready' && state.lines.length === 0)
  const actionRef = useRef<HTMLSpanElement>(null)
  useActionIntro(
    actionRef,
    'coin',
    state.phase === 'ready' && state.lines.length === 0,
    COIN_ACTION_INTRO_DELAY_MS,
  )

  const completeLines = completeRawLinesOf(state)
  const shaking = state.phase === 'shaking'
  const complete = state.phase === 'complete'
  const finale = complete && revealed === 6
  const nextLineName = COIN_LINE_NAMES[Math.min(state.lines.length, 5)]
  const settledValue = state.coins ? scoreCoinToss(state.coins) : null

  const cancelTransfer = useCallback(() => {
    if (transferTimerRef.current !== null) window.clearTimeout(transferTimerRef.current)
    transferTimerRef.current = null
    flightRef.current?.cancel()
    flightRef.current = null
  }, [])

  useEffect(() => cancelTransfer, [cancelTransfer])

  function arrive(lineIndex: number) {
    flightRef.current = null
    setRevealed((count) => Math.max(count, lineIndex + 1))
    setArrived(lineIndex)
  }

  function flushReveal() {
    cancelTransfer()
    if (revealed < state.lines.length) arrive(state.lines.length - 1)
  }

  function transferLine(lineIndex: number, value: LineValue) {
    setLanding(false)
    setReadout((current) => current && { ...current, tally: true })
    if (!motionEnabled()) {
      arrive(lineIndex)
      return
    }
    transferTimerRef.current = window.setTimeout(() => {
      transferTimerRef.current = null
      const layer = ghostLayerRef.current
      const from = tallyGlyphRef.current
      const to = recordGlyphRefs.current[lineIndex]
      const flight = layer && from && to ? flyLine(layer, from, to, value) : null
      if (!flight) {
        arrive(lineIndex)
        return
      }
      flightRef.current = flight
      flight.arrived.then(
        () => {
          if (flightRef.current === flight) arrive(lineIndex)
        },
        () => undefined,
      )
    }, LINE_TRANSFER_DELAY_MS)
  }

  function toggleShake() {
    setError(null)
    if (landing) {
      stageRef.current?.skip()
      flushReveal()
      return
    }
    if (complete) {
      if (!completeLines) return
      trackDivinationEvent('点击生成排盘', 'coin')
      const chart = generateChart({
        inputMethod: 'coin',
        rawLines: completeLines,
        when: state.completedAt ?? undefined,
        timezone: resolvedTimezone,
      })
      commitReading(chart, completeLines)
      navigate('/result')
      return
    }
    if (shaking) {
      let coins: CoinToss
      try {
        coins = tossCoins()
      } catch {
        setError('随机数生成器不可用，未记录本轮结果。')
        return
      }
      const lineIndex = state.lines.length
      dispatch({ type: 'stop', coins, when: new Date() })
      setLanding(true)
      setArrived(null)
      setReadout({ coins, settled: [false, false, false], tally: false })
      stageRef.current?.release(coins, {
        onSettle: (index) =>
          setReadout((current) =>
            current?.coins === coins
              ? { ...current, settled: current.settled.map((done, i) => done || i === index) }
              : current,
          ),
        onAllSettled: () => transferLine(lineIndex, scoreCoinToss(coins)),
      })
      return
    }
    flushReveal()
    if (state.lines.length === 0) {
      trackEvent('开始摇币起卦')
    }
    setReadout(null)
    dispatch({ type: 'start' })
    stageRef.current?.startShake()
  }

  function reset() {
    trackEvent('重置摇币起卦', { 已完成爻数: state.lines.length })
    setError(null)
    cancelTransfer()
    setRevealed(0)
    setLanding(false)
    setArrived(null)
    setReadout(null)
    dispatch({ type: 'reset' })
    stageRef.current?.reset()
  }

  const actionLabel = landing
    ? '铜钱落定中，点击跳过'
    : complete
      ? '六爻已完成，生成排盘'
      : shaking
        ? `点击停止并记录${nextLineName}`
        : `点击开始摇动${nextLineName}`

  const statusText = landing
    ? `${COIN_LINE_NAMES[state.lines.length - 1]}的三枚铜钱正在落定。`
    : complete
      ? '六爻已完成，再次点击铜钱生成排盘。'
      : shaking
        ? `${nextLineName}摇动中，停止时采样三枚铜钱。`
        : settledValue
          ? `本轮为${lineValueText(settledValue)}。已完成 ${state.lines.length}/6。`
          : '点击铜钱开始，第一轮从初爻起。'

  const consolePhase = landing ? 'landing' : shaking ? 'shaking' : complete ? 'complete' : 'standby'

  return (
    <>
      <Panel tag="摇币起卦 // 三枚铜钱">
        <RitualGuide>
          一事一问。静心默念后，从初爻开始摇动三枚铜钱。
        </RitualGuide>
        <div className="coin-layout relative grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <div className="coin-operation">
            <button
              type="button"
              className="coin-console"
              data-phase={consolePhase}
              onClick={toggleShake}
              aria-label={actionLabel}
              aria-pressed={shaking}
              aria-busy={shaking || landing}
            >
              <span className="coin-console-head">
                <span>ROUND {landing ? state.lines.length : Math.min(state.lines.length + 1, 6)} / 6</span>
                <CoinProgress
                  revealed={revealed}
                  cast={state.lines.length}
                  shaking={shaking}
                  arrived={arrived}
                />
                <span className="coin-console-tag">
                  {landing ? 'LANDING' : shaking ? 'IN MOTION' : complete ? 'COMPLETE' : 'STANDBY'}
                </span>
              </span>
              <CoinTossStage
                ref={stageRef}
                faces={state.coins}
                shaking={shaking}
                intro={intro}
                dim={finale}
              >
                <CoinReadouts readout={finale ? null : readout} glyphRef={tallyGlyphRef} />
                {finale && completeLines && <CoinFinale lines={completeLines} />}
              </CoinTossStage>
              <span
                className={cn(
                  'coin-console-action',
                  complete && !landing ? 'coin-console-action-ready' : null,
                )}
              >
                {complete && !landing ? (
                  <>
                    <span>六爻已完成</span>
                    <span>生成排盘 →</span>
                  </>
                ) : (
                  <span ref={actionRef} className="coin-console-cta">{actionLabel}</span>
                )}
              </span>
            </button>

            <p className="sr-only" aria-live="polite">{statusText}</p>
            {error && (
              <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
                {error}
              </p>
            )}
          </div>

          <CoinLineRecord
            lines={state.lines}
            revealed={revealed}
            shaking={shaking}
            arrived={arrived}
            glyphRefs={recordGlyphRefs}
          />
          <div ref={ghostLayerRef} className="coin-ghost-layer" aria-hidden="true" />
        </div>

        <div className="coin-panel-footer mt-3 flex border-t border-edge pt-3">
          <button
            type="button"
            className="coin-reset btn shrink-0"
            onClick={reset}
            disabled={state.phase === 'ready' && !error}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[1em] fill-none stroke-current"
              strokeWidth="1.8"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <path d="M20 11a8 8 0 1 1-2.34-5.66L20 7.68" />
              <path d="M20 3v4.68h-4.68" />
            </svg>
            <span>重置本次摇卦</span>
          </button>
        </div>
      </Panel>

    </>
  )
}

function CoinProgress({
  revealed,
  cast,
  shaking,
  arrived,
}: {
  revealed: number
  cast: number
  shaking: boolean
  arrived: number | null
}) {
  return (
    <span className="coin-progress" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <span
          key={index}
          data-state={
            index < revealed
              ? 'done'
              : index < cast || (shaking && index === cast)
                ? 'active'
                : 'idle'
          }
          data-fresh={index === arrived}
        />
      ))}
    </span>
  )
}

function LineGlyph({ value, className }: { value: LineValue; className: string }) {
  return (
    <>
      <span className={className} />
      {!lineIsYang(value) && <span className={className} />}
    </>
  )
}

function CoinReadouts({
  readout,
  glyphRef,
}: {
  readout: CoinReadout | null
  glyphRef: RefObject<HTMLSpanElement | null>
}) {
  const value = readout ? scoreCoinToss(readout.coins) : null
  return (
    <>
      {[0, 1, 2].map((index) => {
        const score = readout?.coins[index]
        return (
          <span
            key={index}
            className="coin-readout"
            style={{ '--slot': `var(--coin-slot-${index})` } as CSSProperties}
            data-on={Boolean(readout?.settled[index])}
            data-face={score === 3 ? 'heads' : 'tails'}
          >
            {score === 3 ? '正' : '反'}
          </span>
        )
      })}
      <span
        className="coin-tally"
        data-on={Boolean(readout?.tally)}
        data-mutating={value ? lineIsMutating(value) : false}
      >
        <span
          ref={glyphRef}
          className="coin-tally-glyph"
          data-yang={value ? lineIsYang(value) : true}
        >
          {value && <LineGlyph value={value} className="coin-tally-bar" />}
        </span>
        <span className="coin-tally-name">{value ? lineValueText(value) : ''}</span>
      </span>
    </>
  )
}

function CoinFinale({ lines }: { lines: CompleteRawLines }) {
  return (
    <span className="coin-finale">
      <span className="coin-finale-glyph">
        {[5, 4, 3, 2, 1, 0].map((index) => {
          const value = lines[index]!
          return (
            <span
              key={index}
              className="coin-finale-line"
              data-mutating={lineIsMutating(value)}
              style={{ '--i': index } as CSSProperties}
            >
              <LineGlyph value={value} className="coin-finale-bar" />
            </span>
          )
        })}
      </span>
      <HexagramNames lines={lines} />
    </span>
  )
}

/** 本卦与之卦的卦名，逐字解码显现 */
function HexagramNames({ lines }: { lines: CompleteRawLines }) {
  const primaryBits = rawLinesToPrimaryBits(lines)
  const mask = rawLinesToMutationMask(lines)
  const primary = hexagramByBits(primaryBits)
  const changed = mask ? hexagramByBits(resultBitsOf(primaryBits, mask)) : null

  return (
    <span className="coin-finale-names">
      <span className="coin-finale-label">本卦</span>
      <ScrambleText className="coin-finale-name" text={primary?.chineseName ?? ''} delay={380} />
      {changed && (
        <>
          <span className="coin-finale-label">之卦</span>
          <ScrambleText
            className="coin-finale-name coin-finale-name-changed"
            text={changed.chineseName}
            delay={560}
          />
        </>
      )}
    </span>
  )
}

function CoinLineRecord({
  lines,
  revealed,
  shaking,
  arrived,
  glyphRefs,
}: {
  lines: readonly LineValue[]
  revealed: number
  shaking: boolean
  arrived: number | null
  glyphRefs: RefObject<Array<HTMLSpanElement | null>>
}) {
  return (
    <section
      className="coin-record"
      aria-label="六次摇币记录"
      data-celebrate={revealed === 6 && arrived === 5}
    >
      <div className="coin-record-head flex items-center justify-between border-b border-edge px-3 py-2 text-[0.875rem] tracking-[0.16em] text-fog">
        <span>爻序记录</span>
        <span>自下而上</span>
      </div>
      <div className="coin-record-list flex flex-col gap-1 p-3">
        {[5, 4, 3, 2, 1, 0].map((index) => {
          const value = index < revealed ? lines[index] : undefined
          const current = index === revealed && revealed < 6
          const yang = value ? lineIsYang(value) : false
          const mutating = value ? lineIsMutating(value) : false
          const fresh = value !== undefined && index === arrived
          const slotText = value
            ? lineValueText(value)
            : current
              ? shaking ? '摇动中' : index < lines.length ? '落定中' : '下一爻'
              : '未记录'

          return (
            <div
              key={index}
              className="coin-record-row"
              data-current={current}
              data-mutating={mutating}
              data-fresh={fresh}
              style={{ '--row': index } as CSSProperties}
            >
              <span className="w-8 shrink-0 text-[0.875rem] text-fog">{COIN_LINE_NAMES[index]}</span>
              <span
                ref={(element) => {
                  glyphRefs.current[index] = element
                }}
                className="coin-record-glyph flex flex-1 items-center gap-[14%]"
              >
                {value ? (
                  yang ? (
                    <span className="hex-bar w-full" />
                  ) : (
                    <>
                      <span className="hex-bar w-[43%]" />
                      <span className="hex-bar w-[43%]" />
                    </>
                  )
                ) : (
                  <span className="w-full border-t border-dashed border-edge-bright" />
                )}
              </span>
              <span className={cn(
                'coin-record-value w-28 shrink-0 text-right text-[0.875rem]',
                value ? mutating ? 'text-flux' : 'text-ink' : current ? 'text-signal' : 'text-fog',
              )}>
                {fresh ? <ScrambleText text={slotText} duration={420} /> : slotText}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function lineValueText(value: LineValue): string {
  switch (value) {
    case 6: return '老阴 · 动爻'
    case 7: return '少阳 · 静爻'
    case 8: return '少阴 · 静爻'
    case 9: return '老阳 · 动爻'
  }
}

interface LineEditorProps {
  draft: RawLines
  setDraft: (lines: RawLines) => void
}

/** 手动排卦每爻的四种取值：静爻在前，动爻在后 */
const LINE_CHOICES: ReadonlyArray<{ value: LineValue; label: string }> = [
  { value: 7, label: '少阳' },
  { value: 8, label: '少阴' },
  { value: 9, label: '老阳' },
  { value: 6, label: '老阴' },
]

function EditorGlyph({ value }: { value: LineValue }) {
  return (
    <span className="editor-glyph" data-yang={lineIsYang(value)} aria-hidden="true">
      <LineGlyph value={value} className="editor-bar" />
    </span>
  )
}

/** 逐爻四选一：阴阳与动静一次点定 */
function ManualLineEditor({ draft, setDraft }: LineEditorProps) {
  function setLine(index: number, value: LineValue) {
    const next = [...draft] as RawLines
    next[index] = value
    setDraft(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const value = draft[i]!
        return (
          <div key={i} className="editor-line" data-mutating={lineIsMutating(value)}>
            <span className="editor-line-name">{COIN_LINE_NAMES[i]}</span>
            <EditorGlyph value={value} />
            <span className="editor-choices" role="radiogroup" aria-label={COIN_LINE_NAMES[i]}>
              {LINE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={value === choice.value}
                  className="editor-choice"
                  data-moving={lineIsMutating(choice.value)}
                  onClick={() => setLine(i, choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 卦已选定，只标动爻：点一下爻线设为动爻，再点取消 */
function MovingLineEditor({ draft, setDraft }: LineEditorProps) {
  function toggleMoving(index: number) {
    const next = [...draft] as RawLines
    const value = draft[index]!
    next[index] = value === 7 ? 9 : value === 9 ? 7 : value === 8 ? 6 : 8
    setDraft(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const value = draft[i]!
        const moving = lineIsMutating(value)
        return (
          <button
            key={i}
            type="button"
            className="editor-line editor-line-toggle"
            data-mutating={moving}
            aria-pressed={moving}
            aria-label={`${COIN_LINE_NAMES[i]}：${moving ? '动爻' : '静爻'}，点击切换`}
            onClick={() => toggleMoving(i)}
          >
            <span className="editor-line-name">{COIN_LINE_NAMES[i]}</span>
            <EditorGlyph value={value} />
            <span className="editor-line-state">{moving ? '动爻' : '静爻'}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 当前排出的本卦与之卦，随编辑即时更新 */
function HexagramReadout({ lines }: { lines: RawLines }) {
  const primaryBits = rawLinesToPrimaryBits(lines)
  const mask = rawLinesToMutationMask(lines)
  const primary = hexagramByBits(primaryBits)
  const changed = mask ? hexagramByBits(resultBitsOf(primaryBits, mask)) : null

  return (
    <p className="editor-readout" aria-live="polite">
      <span>
        <span className="editor-readout-label">本卦</span>
        <span className="text-signal">{primary?.chineseName}</span>
      </span>
      {changed && (
        <span>
          <span className="editor-readout-label">之卦</span>
          <span className="text-ink">{changed.chineseName}</span>
        </span>
      )}
    </p>
  )
}

function EditorFooter({ lines, method }: { lines: RawLines; method: InputMethod }) {
  return (
    <div className="editor-footer">
      <HexagramReadout lines={lines} />
      <GenerateButton rawLines={lines} method={method} />
    </div>
  )
}

function ManualPanel({ draft, setDraft }: LineEditorProps) {
  return (
    <Panel tag="手动排卦">
      <div className="mx-auto w-full md:max-w-xl">
        <ManualLineEditor draft={draft} setDraft={setDraft} />
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={() => setDraft(tossRawLines())}>
            随机填充
          </button>
          <button type="button" className="btn" onClick={() => setDraft(defaultDraft())}>
            重置
          </button>
        </div>
        <EditorFooter lines={draft} method="manual" />
      </div>
    </Panel>
  )
}

function GenerateButton({ rawLines, method }: { rawLines: RawLines; method: InputMethod }) {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone } = useSettings()

  function generate() {
    trackDivinationEvent('点击生成排盘', method)
    const chart = generateChart({
      inputMethod: method,
      rawLines,
      timezone: resolvedTimezone,
    })
    commitReading(chart, rawLines)
    navigate('/result')
  }

  return (
    <button type="button" className="btn btn-primary w-full" onClick={generate}>
      生成排盘 →
    </button>
  )
}

function HexNamePanel({ draft, setDraft }: LineEditorProps) {
  const [query, setQuery] = useState('')
  const matches = useMemo(
    () => (query.trim() === '' ? null : searchHexagrams(query)),
    [query],
  )
  const matched = useMemo(() => matches && new Set(matches.map((h) => h.bits)), [matches])
  const selected = hexagramByBits(bitsOf(draft))
  const followupRef = useRef<HTMLDivElement>(null)
  const followupFrameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (followupFrameRef.current !== null) window.cancelAnimationFrame(followupFrameRef.current)
  }, [])

  function selectHexagram(record: HexagramRecord) {
    setDraft(rawLinesFromRecord(record))
    if (followupFrameRef.current !== null) window.cancelAnimationFrame(followupFrameRef.current)
    followupFrameRef.current = window.requestAnimationFrame(() => {
      followupFrameRef.current = null
      scrollIntoViewIfNeeded(followupRef.current)
    })
  }

  return (
    <>
      <Panel tag="选择本卦">
        <div className="mx-auto w-full md:max-w-3xl">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (isSubmitKey(event) && matches?.[0]) selectHexagram(matches[0])
            }}
            placeholder="输入卦名或文王序号，例如：坎 / 29 / 中孚"
            aria-label="按卦名或文王序号检索"
            enterKeyHint="search"
            className="w-full border border-edge bg-void px-3 py-2 text-lg text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
          />
          {matches?.length === 0 && (
            <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
              未找到匹配卦象
            </p>
          )}
          {matches && matches.length > 0 && (
            <ul className="hex-results" aria-label="检索结果">
              {[...matches].sort((x, y) => x.kingWenNumber - y.kingWenNumber).map((record) => (
                <li key={record.kingWenNumber}>
                  <button
                    type="button"
                    className="hex-result"
                    data-active={selected?.bits === record.bits}
                    aria-pressed={selected?.bits === record.bits}
                    onClick={() => selectHexagram(record)}
                  >
                    <span>{record.chineseName}</span>
                    <span className="hex-result-number">第 {record.kingWenNumber} 卦</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <HexagramTable selected={selected} matched={matched} onSelect={selectHexagram} />
          <TrigramPicker selected={selected} onSelect={(record) => setDraft(rawLinesFromRecord(record))} />
        </div>
      </Panel>
      {selected && (
        <div ref={followupRef} className="generator-scroll-target">
          <Panel tag="设置动爻 // 可选">
            <div className="mx-auto w-full md:max-w-xl">
              <p className="mb-3 text-[0.875rem] text-fog">点击爻线，标为动爻</p>
              <MovingLineEditor draft={draft} setDraft={setDraft} />
              <EditorFooter lines={draft} method="hexagram" />
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}

/** 手机上的选卦方式：上卦、下卦各点一次，十六个大按钮代替六十四个小格 */
function TrigramPicker({
  selected,
  onSelect,
}: {
  selected: HexagramRecord | undefined
  onSelect: (record: HexagramRecord) => void
}) {
  if (!selected) return null
  const rows = [
    { label: '上卦', current: selected.upperKey, pick: (key: TrigramKey) => [key, selected.lowerKey] as const },
    { label: '下卦', current: selected.lowerKey, pick: (key: TrigramKey) => [selected.upperKey, key] as const },
  ]

  return (
    <div className="trigram-picker">
      {rows.map((row) => (
        <div key={row.label} role="group" aria-label={row.label}>
          <p className="trigram-picker-label">{row.label}</p>
          <div className="trigram-options">
            {TRIGRAM_KEYS.map((key) => {
              const trigram = TRIGRAMS[key]
              return (
                <button
                  key={key}
                  type="button"
                  className="trigram-option"
                  aria-pressed={row.current === key}
                  aria-label={`${row.label}：${trigram.name}（${trigram.symbol}）`}
                  onClick={() => {
                    const [upper, lower] = row.pick(key)
                    const record = hexagramByBits((TRIGRAMS[upper].bits << 3) | TRIGRAMS[lower].bits)
                    if (record) onSelect(record)
                  }}
                >
                  <span className="trigram-glyph" aria-hidden="true">
                    {[2, 1, 0].map((line) => (
                      <span key={line} data-yang={Boolean((trigram.bits >> line) & 1)} />
                    ))}
                  </span>
                  <span>{trigram.name}</span>
                  <span className="trigram-option-symbol">{trigram.symbol}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <p className="trigram-picker-result" aria-live="polite">
        <span className="editor-readout-label">本卦</span>
        <span className="text-signal">{selected.chineseName}</span>
      </p>
    </div>
  )
}

/** 六十四卦方表（电脑端）：横排上卦、竖列下卦，按乾兑离震巽坎艮坤排列 */
function HexagramTable({
  selected,
  matched,
  onSelect,
}: {
  selected: HexagramRecord | undefined
  /** 检索命中的卦；null 表示没有在检索 */
  matched: Set<number> | null
  onSelect: (record: HexagramRecord) => void
}) {
  return (
    <table className="hex-table mt-3 hidden md:table" aria-label="六十四卦">
      <thead>
        <tr>
          <th scope="col" className="hex-table-corner">
            <span>上卦</span>
            <span>下卦</span>
          </th>
          {TRIGRAM_KEYS.map((upper) => (
            <th key={upper} scope="col">
              {TRIGRAMS[upper].name}
              <span className="hex-table-symbol">{TRIGRAMS[upper].symbol}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {TRIGRAM_KEYS.map((lower) => (
          <tr key={lower}>
            <th scope="row">
              {TRIGRAMS[lower].name}
              <span className="hex-table-symbol">{TRIGRAMS[lower].symbol}</span>
            </th>
            {TRIGRAM_KEYS.map((upper) => {
              const record = hexagramByBits((TRIGRAMS[upper].bits << 3) | TRIGRAMS[lower].bits)
              if (!record) return <td key={upper} />
              const active = selected?.bits === record.bits
              return (
                <td key={upper}>
                  <button
                    type="button"
                    className="hex-table-cell"
                    data-active={active}
                    data-dim={matched ? !matched.has(record.bits) : false}
                    aria-pressed={active}
                    aria-label={record.chineseName}
                    title={`${record.chineseName} · 第 ${record.kingWenNumber} 卦`}
                    onClick={() => onSelect(record)}
                  >
                    {record.chineseName}
                  </button>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function bitsOf(lines: RawLines): number {
  let bits = 0
  for (let i = 0; i < 6; i++) {
    const v = lines[i]!
    if (v === 7 || v === 9) bits |= 1 << i
  }
  return bits
}

const NUMBER_FIELD_LABELS = ['第一个数', '第二个数', '第三个数'] as const

function numberSeedIssueText(issue: NumberSeedIssue): string | null {
  if (issue.error === 'EMPTY') return null
  if (issue.error === 'NOT_DIGITS') return `${NUMBER_FIELD_LABELS[issue.field]}只能填数字`
  return `请先填${NUMBER_FIELD_LABELS[issue.field]}`
}

type HanziSeedInfo = Extract<HanziDerivation, { ok: true }>['seed']

interface DeriveRun {
  script: DeriveScript
  when?: Date
  hanziSeed?: HanziSeedInfo
}

interface DeriveCastHandle {
  /** 从输入框按回车起卦：与点击罗盘等效 */
  activate(): void
}

const DERIVE_DEFAULT_GLYPH = { number: '数', time: '时', hanzi: '字' } as const

/**
 * 数字、时间、汉字起卦共用的罗盘：点击后按脚本演出上卦、下卦、动爻三步，
 * 卦成后停住，再次点击才生成排盘。关闭动画时一次点击直接排盘。
 */
function DeriveCast({
  ref,
  method,
  preview,
  prepare,
  idleAction,
  blockedAction,
  onRun,
}: {
  ref?: Ref<DeriveCastHandle>
  method: 'number' | 'time' | 'hanzi'
  /** 当前输入对应的推演；null 表示还不能起卦 */
  preview: DeriveScript | null
  /** 点击时定格本次起卦；时间起卦在这里取当下时刻 */
  prepare: () => DeriveRun | null
  idleAction: string
  blockedAction: string
  /** 起卦后通知外层锁定输入 */
  onRun?: (run: DeriveRun) => void
}) {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone, settings } = useSettings()
  const stageRef = useRef<DeriveStageHandle>(null)
  const consoleRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLSpanElement>(null)
  const [run, setRun] = useState<DeriveRun | null>(null)
  const [step, setStep] = useState(-1)
  const [resolved, setResolved] = useState(0)
  const [complete, setComplete] = useState(false)
  const animated = settings.animation && motionEnabled()
  useActionIntro(actionRef, 'derive', run === null && preview !== null && settings.animation)
  useImperativeHandle(ref, () => ({
    activate: () => {
      // 手机上收起键盘并把罗盘带进视野，再开始演出
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      scrollIntoViewIfNeeded(consoleRef.current)
      activate()
    },
  }))

  function activate() {
    if (complete && run) {
      finish(run)
      return
    }
    if (run) {
      // 结果在起卦时已经算定，再次点击只是跳过演出
      stageRef.current?.skip()
      return
    }
    const next = prepare()
    if (!next) return
    const playing = animated && stageRef.current?.cast(next.script, {
      onStep: (index) => setStep(index),
      onResolve: (index) => setResolved(index + 1),
      onComplete: () => setComplete(true),
    })
    if (!playing) {
      finish(next)
      return
    }
    setRun(next)
    onRun?.(next)
  }

  function finish({ script, when, hanziSeed }: DeriveRun) {
    trackDivinationEvent('点击生成排盘', method)
    const chart = generateChart({
      inputMethod: method,
      rawLines: script.rawLines,
      when,
      timezone: resolvedTimezone,
    })
    commitReading(chart, script.rawLines, { hanziSeed })
    navigate('/result')
  }

  const script = run?.script ?? preview
  const casting = run !== null && !complete
  const actionLabel = complete
    ? '卦已成，生成排盘'
    : casting
      ? '推演中，点击跳过'
      : script ? idleAction : blockedAction
  // 关闭动画时没有演出可看，直接把算式写全
  const shown = animated ? resolved : script ? 3 : 0

  return (
    <>
      <button
        ref={consoleRef}
        type="button"
        className="coin-console"
        data-kind="dial"
        data-phase={complete ? 'complete' : casting ? 'casting' : 'standby'}
        onClick={activate}
        disabled={!script}
        aria-label={actionLabel}
        aria-busy={casting}
      >
        <span className="coin-console-head">
          <span>{method.toUpperCase()} SEED</span>
          <span className="coin-console-tag">
            {complete ? 'COMPLETE' : casting ? 'DERIVING' : 'STANDBY'}
          </span>
        </span>
        <DeriveStage
          ref={stageRef}
          seedGlyph={script?.seedGlyph ?? DERIVE_DEFAULT_GLYPH[method]}
          dim={complete}
        >
          {complete && run && <CoinFinale lines={run.script.rawLines} />}
        </DeriveStage>
        <span className="dial-caption">
          {DERIVE_STEP_LABELS.map((label, index) => (
            <span
              key={label}
              className="dial-slot"
              data-state={index < shown ? 'done' : casting && index === step ? 'active' : 'idle'}
            >
              <span className="dial-slot-label">{label}</span>
              <span className="dial-slot-value">
                {script && index < shown
                  ? <ScrambleText text={script.steps[index]!.result} duration={300} />
                  : '—'}
              </span>
            </span>
          ))}
        </span>
        <span className={cn('coin-console-action', complete && 'coin-console-action-ready')}>
          {complete ? (
            <>
              <span>卦已成</span>
              <span>生成排盘 →</span>
            </>
          ) : (
            <span ref={actionRef} className="coin-console-cta">{actionLabel}</span>
          )}
        </span>
      </button>

      {script && shown > 0 && (
        <div className="derive-steps mt-3 space-y-1 text-[0.9375rem] text-fog" aria-live="polite">
          {script.steps.slice(0, shown).map((item, index) => (
            <DeriveStepLine
              key={DERIVE_STEP_LABELS[index]}
              label={DERIVE_STEP_LABELS[index]!}
              step={item}
            />
          ))}
          {shown === 3 && (
            <p>
              本卦：
              <span className="text-signal">
                {hexagramByBits(bitsOf(script.rawLines))?.chineseName}
              </span>
              {' '}· {DERIVE_LINE_NAMES[script.movingLine]}动
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** 回车提交；输入法正在选字时的回车只是上屏，不算 */
function isSubmitKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229
}

/** 输入框外绕行的辉光，提示“先在这里输入”；样式与页头“支持作者”相同 */
function InputOrbit() {
  return (
    <svg className="support-link-orbit" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" pathLength="100" />
    </svg>
  )
}

function DeriveStepLine({ label, step }: { label: string; step: DeriveStep }) {
  return (
    <p className="grid grid-cols-[2.75rem_1fr] gap-x-2">
      <span>{label}</span>
      <span className="break-all">
        <span className="text-ink">{step.dividend}</span>
        {' '}÷ {step.divisor} 余 {shownRemainder(step)} →{' '}
        <span className="text-signal">{step.result}</span>
      </span>
    </p>
  )
}

function NumberPanel() {
  const [fields, setFields] = useState<string[]>(['', '', ''])
  const [locked, setLocked] = useState(false)
  const castRef = useRef<DeriveCastHandle>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const parsed = useMemo(() => rawLinesFromNumbers(fields), [fields])
  const preview = useMemo(() => (parsed.ok ? numberScript(parsed.seed) : null), [parsed])
  const issueText = parsed.ok ? null : numberSeedIssueText(parsed)
  const empty = !parsed.ok && parsed.error === 'EMPTY'

  function updateField(index: number, value: string) {
    // 一次粘贴 128 64 32 这样的整串时，依次分到后面的输入框
    const pasted = splitPastedNumbers(value)
    const next = [...fields]
    if (pasted.length > 1) {
      pasted.slice(0, NUMBER_SEED_FIELDS - index).forEach((digits, offset) => {
        next[index + offset] = digits
      })
    } else {
      next[index] = value
    }
    setFields(next)
  }

  return (
    <Panel tag="数字种子">
      <RitualGuide>
        一事一问。静心默念后，输入最先浮现于心的数字。
      </RitualGuide>
      <div className="grid grid-cols-3 gap-2">
        {NUMBER_FIELD_LABELS.map((label, index) => (
          <label key={label} className="block min-w-0">
            <span className="mb-1 block text-[0.8125rem] tracking-[0.08em] text-fog">
              {label}
            </span>
            <span className="relative block">
            <input
              ref={(element) => {
                inputRefs.current[index] = element
              }}
              value={fields[index]}
              onChange={(event) => updateField(index, event.target.value)}
              onKeyDown={(event) => {
                if (!isSubmitKey(event)) return
                if (index < NUMBER_SEED_FIELDS - 1) inputRefs.current[index + 1]?.focus()
                else castRef.current?.activate()
              }}
              disabled={locked}
              inputMode="numeric"
              enterKeyHint={index < NUMBER_SEED_FIELDS - 1 ? 'next' : 'done'}
              autoComplete="off"
              placeholder={index > 0 ? '可不填' : undefined}
              aria-label={label}
              className="w-full min-w-0 border border-edge bg-void px-2 py-2 text-lg tracking-[0.12em] text-ink placeholder:text-base placeholder:tracking-normal placeholder:text-fog/50 focus:border-signal focus:outline-none disabled:opacity-60"
            />
            {index === 0 && empty && <InputOrbit />}
            </span>
          </label>
        ))}
      </div>
      {issueText && (
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-flux" role="alert">
          {issueText}
        </p>
      )}
      <div className="mt-3">
        <DeriveCast
          ref={castRef}
          method="number"
          preview={preview}
          prepare={() => (preview ? { script: preview } : null)}
          idleAction="点击推演起卦"
          blockedAction="先输入数字"
          onRun={() => setLocked(true)}
        />
      </div>
    </Panel>
  )
}

type HanziDeriver = (input: string) => HanziDerivation

function HanziPanel() {
  const [input, setInput] = useState('')
  const [locked, setLocked] = useState(false)
  const castRef = useRef<DeriveCastHandle>(null)
  const [derive, setDerive] = useState<HanziDeriver | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let active = true
    import('@/features/hanzi/derive')
      .then((module) => {
        if (active) setDerive(() => module.deriveHanziSeed)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  const parsed = useMemo(() => derive?.(input) ?? null, [derive, input])
  const seed = parsed?.ok ? parsed.seed : null
  const preview = useMemo(() => (seed ? hanziScript(seed) : null), [seed])
  const hasInput = input.trim() !== ''

  return (
    <Panel tag="汉字取象 // 本地拆字">
      <RitualGuide>
        一事一问。静心默念后，写下最先想到或第一眼看到的相关汉字。
      </RitualGuide>
      <label className="block">
        <span className="mb-2 block text-[0.875rem] tracking-[0.14em] text-fog">
          所取汉字
        </span>
        <span className="relative block">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (isSubmitKey(event)) castRef.current?.activate()
          }}
          disabled={!derive || loadFailed || locked}
          enterKeyHint="go"
          autoComplete="off"
          placeholder={loadFailed ? '笔画资料加载失败' : derive ? '例如：明 / 工作顺利 / 水到渠成' : '正在加载笔画资料…'}
          aria-label="用于起卦的汉字"
          className={cn(
            'w-full border border-edge bg-void px-3 py-2 text-lg tracking-[0.16em] text-ink placeholder:tracking-normal placeholder:text-fog/60 focus:border-signal focus:outline-none disabled:opacity-60',
            !locked && 'disabled:cursor-wait',
          )}
        />
        {derive && !loadFailed && !hasInput && <InputOrbit />}
        </span>
      </label>

      {loadFailed && (
        <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
          汉字笔画资料未能载入，请刷新后重试。
        </p>
      )}
      {hasInput && parsed && !parsed.ok && (
        <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
          {hanziErrorText(parsed)}
        </p>
      )}
      <div className="mt-3">
        <DeriveCast
          ref={castRef}
          method="hanzi"
          preview={preview}
          prepare={() => (preview && seed ? { script: preview, hanziSeed: seed } : null)}
          idleAction="点击推演起卦"
          blockedAction="先写下汉字"
          onRun={() => setLocked(true)}
        />
      </div>
    </Panel>
  )
}

function hanziErrorText(parsed: Extract<HanziDerivation, { ok: false }>): string {
  if (parsed.error === 'NON_HANZI') return '请输入汉字；空格会自动忽略。'
  if (parsed.error === 'UNSUPPORTED_CHARACTER') {
    return `暂未收录这些字：${parsed.unsupportedCharacters?.join('、') ?? ''}`
  }
  return '请输入至少一个汉字。'
}

/** 时间起卦的算式只随时辰变化，待机预览每半分钟核对一次即可 */
const TIME_PREVIEW_REFRESH_MS = 30_000

function TimePanel() {
  const { resolvedTimezone } = useSettings()
  const [now, setNow] = useState(() => new Date())
  const [castAt, setCastAt] = useState<Date | null>(null)

  useEffect(() => {
    if (castAt) return
    const timer = window.setInterval(() => setNow(new Date()), TIME_PREVIEW_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [castAt])

  const preview = useMemo(
    () => timeScript(deriveTimeSeed(now, resolvedTimezone).seed),
    [now, resolvedTimezone],
  )

  return (
    <Panel tag="使用当前时间戳">
      <RitualGuide>
        一事一问。静心默念所问之事；念定，就以此刻起卦。
      </RitualGuide>
      <div className="mb-3 flex flex-wrap gap-x-8 text-[0.9375rem] leading-relaxed text-fog">
        <p>
          {castAt ? '起卦时刻：' : '时间戳：'}
          <LiveTimestamp
            timezone={resolvedTimezone}
            frozenAt={castAt ?? undefined}
            className={castAt ? 'text-signal' : 'text-ink'}
          />
        </p>
        <p>时区：{formatTimezone(resolvedTimezone)}</p>
      </div>
      <DeriveCast
        method="time"
        preview={preview}
        prepare={() => {
          const when = new Date()
          return { script: timeScript(deriveTimeSeed(when, resolvedTimezone).seed), when }
        }}
        idleAction="点击以此刻起卦"
        blockedAction="点击以此刻起卦"
        onRun={(run) => setCastAt(run.when ?? null)}
      />
    </Panel>
  )
}
