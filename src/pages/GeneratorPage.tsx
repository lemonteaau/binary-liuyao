import { useEffect, useMemo, useReducer, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import coinFacesUrl from '@/assets/coin-faces.webp'
import { HexLines } from '@/components/HexLines'
import { LiveTimestamp } from '@/components/LiveClock'
import { generateChart } from '@/engine'
import {
  lineIsMutating,
  lineIsYang,
  scoreCoinToss,
  tossCoins,
  tossRawLines,
} from '@/engine/binary'
import type { CoinScore } from '@/engine/binary'
import { hexagramByBits } from '@/data/hexagrams'
import {
  rawLinesFromNumbers,
  trigramKeyByRemainder,
} from '@/features/number/derive'
import { deriveTimeSeed } from '@/features/time/derive'
import { rawLinesFromRecord, searchHexagrams } from '@/features/hexagram-search/search'
import {
  coinShakeReducer,
  completeRawLinesOf,
  createCoinShakeState,
} from '@/features/coin-shake/model'
import type { CoinShakeAction, CoinShakeState } from '@/features/coin-shake/model'
import { cn } from '@/lib/cn'
import { getCurrentHexagramOrdinal } from '@/lib/hexagram-counter'
import { useReading } from '@/store/reading'
import { useSettings } from '@/store/settings'
import { TRIGRAMS } from '@/data/trigrams'
import type { InputMethod, LineValue } from '@/types'

type RawLines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

const MODES: Array<{ id: InputMethod; title: string; sub: string }> = [
  { id: 'coin', title: '摇币指定', sub: '逐爻启停 / 三枚铜钱' },
  { id: 'entropy', title: '随机熵源', sub: '一键随机生成' },
  { id: 'manual', title: '手动指定', sub: '逐爻设置阴阳' },
  { id: 'hexagram', title: '卦名检索', sub: '选择基础状态' },
  { id: 'number', title: '数字起卦', sub: '输入数字生成' },
  { id: 'time', title: '时间起卦', sub: '使用本地时间' },
]

const COIN_LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const

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

  return (
    <div className="pt-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[0.875rem] tracking-[0.24em] text-fog">六位二进制状态生成器</p>
          <h1 className="text-2xl font-bold tracking-[0.2em]">选择输入来源</h1>
        </div>
        <HomepageCounter />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="起卦方式">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="tile"
            data-active={mode === m.id}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            <span className="text-[1.0625rem] font-bold tracking-[0.18em]">{m.title}</span>
            <span className="text-[0.875rem] tracking-[0.12em] text-fog">{m.sub}</span>
          </button>
        ))}
      </div>

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

      {(mode === 'manual') && <GenerateBar rawLines={draft} method="manual" />}
    </div>
  )
}

function HomepageCounter() {
  const [ordinal, setOrdinal] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5_000)
    let active = true

    getCurrentHexagramOrdinal(controller.signal)
      .then((currentOrdinal) => {
        if (active) setOrdinal(currentOrdinal)
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout))

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [])

  if (ordinal === null) return null

  return (
    <p
      className="flex flex-wrap items-center justify-center gap-x-2 border border-edge bg-panel px-3 py-2 text-center text-[0.875rem] tracking-[0.14em] text-fog sm:justify-end sm:text-right"
      aria-live="polite"
    >
      <span className="inline-flex items-center align-middle whitespace-nowrap">
        自上线以来共生成<strong className="text-lg font-bold tabular-nums text-signal">
          {ordinal.toLocaleString('zh-CN')}
        </strong>次结果
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

function EntropyPanel() {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone, settings } = useSettings()
  const [rolling, setRolling] = useState(false)

  function generate() {
    if (rolling) return
    const lines = tossRawLines()
    const when = new Date()
    if (!settings.animation) {
      finish(lines, when)
      return
    }
    setRolling(true)
    setTimeout(() => finish(lines, when), 560)
  }

  function finish(lines: RawLines, when: Date) {
    const chart = generateChart({
      inputMethod: 'entropy',
      rawLines: lines,
      when,
      timezone: resolvedTimezone,
    })
    commitReading(chart, lines)
    navigate('/result')
  }

  return (
    <Panel tag="随机 / 熵源">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[0.9375rem] leading-relaxed text-fog">
          <p>六爻 × 三枚铜钱</p>
          <p>
            熵源：<span className="text-signal">WEB CRYPTO API</span>
          </p>
          <p>6 : 7 : 8 : 9 = 1/8 : 3/8 : 3/8 : 1/8</p>
        </div>
        <button type="button" className="btn btn-primary min-w-44" onClick={generate} disabled={rolling}>
          {rolling ? '采样中…' : '生成状态'}
        </button>
      </div>
      {rolling && (
        <p className="mt-3 text-[0.9375rem] tracking-[0.2em] text-flux caret" aria-live="polite">
          正在采样熵源
        </p>
      )}
    </Panel>
  )
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
  const completeLines = completeRawLinesOf(state)
  const shaking = state.phase === 'shaking'
  const nextLineIndex = Math.min(state.lines.length, 5)
  const nextLineName = COIN_LINE_NAMES[nextLineIndex]
  const settledValue = state.coins ? scoreCoinToss(state.coins) : null

  function toggleShake() {
    setError(null)
    if (state.phase === 'complete') {
      if (!completeLines) return
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
      try {
        dispatch({ type: 'stop', coins: tossCoins(), when: new Date() })
      } catch {
        setError('熵源不可用，未记录本轮结果。')
      }
      return
    }
    dispatch({ type: 'start' })
  }

  function reset() {
    setError(null)
    dispatch({ type: 'reset' })
  }

  const actionLabel = state.phase === 'complete'
    ? '六爻已完成，生成状态'
    : shaking
      ? `点击停止并记录${nextLineName}`
      : `点击开始摇动${nextLineName}`

  const statusText = state.phase === 'complete'
    ? '六爻已完成，再次点击铜钱生成排盘。'
    : shaking
      ? `${nextLineName}摇动中，停止时采样三枚铜钱。`
      : settledValue
        ? `本轮为${lineValueText(settledValue)}。已完成 ${state.lines.length}/6。`
        : '点击铜钱开始，第一轮从初爻起。'

  return (
    <>
      <Panel tag="摇币指定 // 三枚铜钱">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <div>
            <button
              type="button"
              className="coin-console"
              data-shaking={shaking}
              onClick={toggleShake}
              aria-label={actionLabel}
              aria-pressed={shaking}
              aria-busy={shaking}
            >
              <span className="coin-console-head">
                <span>ROUND {Math.min(state.lines.length + 1, 6)} / 6</span>
                <span>{shaking ? 'IN MOTION' : state.phase === 'complete' ? 'COMPLETE' : 'STANDBY'}</span>
              </span>
              <span className="coin-stage" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <PixelCoin
                    key={index}
                    score={state.coins?.[index]}
                    shaking={shaking}
                  />
                ))}
              </span>
              <span
                className={cn(
                  'coin-console-action',
                  state.phase === 'complete' ? 'coin-console-action-ready' : null,
                )}
              >
                {state.phase === 'complete' ? (
                  <>
                    <span>六爻已完成</span>
                    <span>生成状态 →</span>
                  </>
                ) : actionLabel}
              </span>
            </button>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.9375rem] leading-relaxed text-fog" aria-live="polite">
                {statusText}
              </p>
              <button
                type="button"
                className="btn shrink-0"
                onClick={reset}
                disabled={state.phase === 'ready' && !error}
              >
                重置本次摇卦
              </button>
            </div>
            {error && (
              <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
                {error}
              </p>
            )}
          </div>

          <CoinLineRecord lines={state.lines} shaking={shaking} />
        </div>
      </Panel>

    </>
  )
}

function PixelCoin({ score, shaking }: { score?: CoinScore; shaking: boolean }) {
  const face = shaking ? 'shaking' : score === 3 ? 'heads' : score === 2 ? 'tails' : 'neutral'
  const caption = score === 3 ? '正' : score === 2 ? '反' : '·'

  return (
    <span className="coin-unit" data-face={face}>
      <span className="coin-flight">
        <span className="pixel-coin">
          <span
            className="coin-side coin-side-heads"
            style={{ backgroundImage: `url("${coinFacesUrl}")` }}
          />
          <span
            className="coin-side coin-side-tails"
            style={{ backgroundImage: `url("${coinFacesUrl}")` }}
          />
        </span>
      </span>
      <span className="coin-face-caption">{caption}</span>
    </span>
  )
}

function CoinLineRecord({ lines, shaking }: { lines: readonly LineValue[]; shaking: boolean }) {
  return (
    <section className="coin-record" aria-label="六次摇币记录">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2 text-[0.875rem] tracking-[0.16em] text-fog">
        <span>爻序记录</span>
        <span>自下而上</span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        {[5, 4, 3, 2, 1, 0].map((index) => {
          const value = lines[index]
          const current = index === lines.length && lines.length < 6
          const yang = value ? lineIsYang(value) : false
          const mutating = value ? lineIsMutating(value) : false
          const slotText = value
            ? lineValueText(value)
            : current
              ? shaking ? '摇动中' : '下一爻'
              : '未记录'

          return (
            <div
              key={index}
              className="coin-record-row"
              data-current={current}
              data-mutating={mutating}
            >
              <span className="w-7 shrink-0 text-[0.875rem] text-fog">L{index + 1}</span>
              <span className="flex flex-1 items-center gap-[14%]">
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
                'w-28 shrink-0 text-right text-[0.875rem]',
                value ? mutating ? 'text-flux' : 'text-ink' : current ? 'text-signal' : 'text-fog',
              )}>
                {slotText}
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
    case 6: return '老阴 · 翻转'
    case 7: return '少阳 · 静爻'
    case 8: return '少阴 · 静爻'
    case 9: return '老阳 · 翻转'
  }
}

interface LineEditorProps {
  draft: RawLines
  setDraft: (lines: RawLines) => void
}

export function LineEditor({ draft, setDraft }: LineEditorProps) {
  function toggleYang(index: number) {
    const next = [...draft] as RawLines
    next[index] = draft[index] === 7 ? 8 : draft[index] === 8 ? 7 : draft[index] === 9 ? 6 : 9
    setDraft(next)
  }

  function toggleMutation(index: number) {
    const next = [...draft] as RawLines
    const v = draft[index]!
    next[index] = v === 7 ? 9 : v === 9 ? 7 : v === 8 ? 6 : 8
    setDraft(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const yang = draft[i] === 7 || draft[i] === 9
        const mutating = draft[i]! >= 9 || draft[i] === 6
        return (
          <div key={i} className="flex items-center gap-2 sm:gap-3">
            <span className="w-6 text-right text-[0.875rem] text-fog">L{i + 1}</span>
            <button
              type="button"
              onClick={() => toggleYang(i)}
              className="flex h-9 flex-1 items-center gap-[14%] border border-edge bg-surface px-3 hover:border-edge-bright"
              aria-label={`第 ${i + 1} 爻：${yang ? '阳' : '阴'}，点击切换阴阳`}
            >
              {yang ? (
                <span className="h-[7px] w-full bg-ink" />
              ) : (
                <>
                  <span className="h-[7px] w-[43%] bg-ink" />
                  <span className="h-[7px] w-[43%] bg-ink" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => toggleMutation(i)}
              aria-pressed={mutating}
              aria-label={`第 ${i + 1} 爻翻转${mutating ? '已开启' : '已关闭'}`}
              className={cn(
                'w-16 border px-0 py-2 text-[0.875rem] tracking-[0.14em]',
                mutating ? 'border-flux text-flux' : 'border-edge text-fog',
              )}
            >
              {mutating ? '◉ 翻转' : '翻转'}
            </button>
            <span className="w-4 text-[0.9375rem] tabular-nums text-fog" aria-hidden="true">
              {yang ? 1 : 0}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ManualPanel({ draft, setDraft }: LineEditorProps) {
  return (
    <Panel tag="手动状态">
      <LineEditor draft={draft} setDraft={setDraft} />
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn" onClick={() => setDraft(tossRawLines())}>
          随机填充
        </button>
        <button type="button" className="btn" onClick={() => setDraft(defaultDraft())}>
          重置
        </button>
      </div>
    </Panel>
  )
}

function GenerateBar({
  rawLines,
  method,
  when,
}: {
  rawLines: RawLines
  method: InputMethod
  when?: Date
}) {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone } = useSettings()

  function generate() {
    const chart = generateChart({
      inputMethod: method,
      rawLines,
      when,
      timezone: resolvedTimezone,
    })
    commitReading(chart, rawLines)
    navigate('/result')
  }

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={generate}>
        生成状态 →
      </button>
    </div>
  )
}

function HexNamePanel({ draft, setDraft }: LineEditorProps) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchHexagrams(query).slice(0, 12), [query])
  const selected = hexagramByBits(bitsOf(draft))

  return (
    <>
      <Panel tag="选择基础状态">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入卦名或文王序号，例如：坎 / 29 / 中孚"
          aria-label="按卦名或文王序号检索"
          className="w-full border border-edge bg-void px-3 py-2 text-lg text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
        />
        <ul className="mt-3 grid max-h-52 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" role="listbox" aria-label="检索结果">
          {results.map((h) => (
            <li key={h.kingWenNumber}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.kingWenNumber === h.kingWenNumber}
                onClick={() => setDraft(rawLinesFromRecord(h))}
                className="flex w-full items-center justify-between border border-edge bg-surface px-3 py-2 text-left text-base hover:border-signal data-[active=true]:border-signal"
                data-active={selected?.kingWenNumber === h.kingWenNumber}
              >
                <span>{h.chineseName}</span>
                <span className="text-[0.875rem] tabular-nums text-fog">HEX {h.kingWenNumber}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-[0.9375rem] tracking-widest text-flux">未找到匹配状态</li>
          )}
        </ul>
      </Panel>
      {selected && (
        <Panel tag="翻转掩码 // 可选">
          <p className="mb-3 text-[0.9375rem] text-fog">
            基础状态：<span className="text-signal">{selected.chineseName}</span> · 点击爻线设置翻转
          </p>
          <LineEditor draft={draft} setDraft={setDraft} />
          <GenerateBar rawLines={draft} method="hexagram" />
        </Panel>
      )}
    </>
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

function NumberPanel() {
  const [input, setInput] = useState('')
  const parsed = useMemo(() => rawLinesFromNumbers(input), [input])
  const valid = parsed.ok

  return (
    <>
      <Panel tag="数字种子">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          placeholder="输入一至三个数字，例如：384927 或 128 64 32"
          aria-label="数字种子"
          className="w-full border border-edge bg-void px-3 py-2 text-lg tracking-[0.2em] text-ink placeholder:tracking-normal placeholder:text-fog/60 focus:border-signal focus:outline-none"
        />
        <p className="mt-2 text-[0.875rem] leading-relaxed text-fog">
          规则：上卦 = A MOD 8 · 下卦 = B MOD 8 · 动爻 = C MOD 6 ·
          余数 0 → 坤 / 上爻
        </p>
        {input.trim() !== '' && !valid && (
          <p className="mt-2 text-[0.9375rem] tracking-widest text-flux" role="alert">
            种子无效 — 请输入数字
          </p>
        )}
        {parsed.ok && (
          <div className="mt-3 space-y-1 text-[0.9375rem] text-fog">
            <p>
              种子 A/B/C：{' '}
              <span className="text-ink">
                {parsed.seed.numbers.join(' / ')}
              </span>
            </p>
            <p>
              派生状态：{' '}
              <span className="text-signal">
                {TRIGRAMS[trigramKeyByRemainder(parsed.seed.upperRemainder) as keyof typeof TRIGRAMS].name}
                {TRIGRAMS[trigramKeyByRemainder(parsed.seed.lowerRemainder) as keyof typeof TRIGRAMS].name}
              </span>{' '}
              · 动爻 L{(parsed.seed.movingLine as number) + 1}
            </p>
          </div>
        )}
      </Panel>
      {valid && <GenerateBar rawLines={parsed.rawLines} method="number" />}
    </>
  )
}

function TimePanel() {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone } = useSettings()
  const derived = useMemo(
    () => deriveTimeSeed(new Date(), resolvedTimezone),
    [resolvedTimezone],
  )

  function generate() {
    const when = new Date()
    const { rawLines } = deriveTimeSeed(when, resolvedTimezone)
    const chart = generateChart({
      inputMethod: 'time',
      rawLines,
      when,
      timezone: resolvedTimezone,
    })
    commitReading(chart, rawLines)
    navigate('/result')
  }

  const previewBits = bitsOf(derived.rawLines)

  return (
    <Panel tag="使用当前时间戳">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[0.9375rem] leading-relaxed text-fog">
          <p>
            种子来源：<span className="text-signal">本地时间</span>
          </p>
          <p>
            时间戳：<LiveTimestamp timezone={resolvedTimezone} className="text-ink" />
          </p>
          <p>时区：{resolvedTimezone}</p>
          <div className="mt-2 flex items-center gap-3">
            <HexLines bits={previewBits} compact showLabels={false} />
            <span className="tabular-nums">{previewBits.toString(2).padStart(6, '0')}</span>
          </div>
          <p className="mt-1 text-[0.875rem] opacity-70">
            仅为预览 · 最终状态以点击时刻为准
          </p>
        </div>
        <button type="button" className="btn btn-primary min-w-44" onClick={generate}>
          使用当前时间戳
        </button>
      </div>
    </Panel>
  )
}
