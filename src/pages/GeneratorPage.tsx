import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HexLines } from '@/components/HexLines'
import { LiveTimestamp } from '@/components/LiveClock'
import { generateChart } from '@/engine'
import { tossRawLines } from '@/engine/binary'
import { hexagramByBits } from '@/data/hexagrams'
import {
  rawLinesFromNumbers,
  trigramKeyByRemainder,
  NUMBER_METHOD_VERSION,
} from '@/features/number/derive'
import { deriveTimeSeed, TIME_METHOD_VERSION } from '@/features/time/derive'
import { rawLinesFromRecord, searchHexagrams } from '@/features/hexagram-search/search'
import { cn } from '@/lib/cn'
import { useReading } from '@/store/reading'
import { useSettings } from '@/store/settings'
import { TRIGRAMS } from '@/data/trigrams'
import type { InputMethod, LineValue } from '@/types'

type RawLines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

const MODES: Array<{ id: InputMethod; title: string; sub: string }> = [
  { id: 'entropy', title: '随机熵源', sub: 'WEB CRYPTO / 三枚铜钱' },
  { id: 'manual', title: '手动指定', sub: '逐爻设置阴阳 / 翻转' },
  { id: 'hexagram', title: '卦名检索', sub: '选择基础状态' },
  { id: 'number', title: '数字起卦', sub: `数字种子 // ${NUMBER_METHOD_VERSION}` },
  { id: 'time', title: '时间起卦', sub: `本地时间戳 // ${TIME_METHOD_VERSION}` },
]

export function GeneratorPage() {
  const location = useLocation()
  const editRawLines = (location.state as { editRawLines?: RawLines } | null)?.editRawLines
  const [mode, setMode] = useState<InputMethod | null>(editRawLines ? 'manual' : null)
  const [draft, setDraft] = useState<RawLines>(() =>
    editRawLines ? [...editRawLines] as RawLines : defaultDraft(),
  )

  return (
    <div className="pt-6">
      <p className="mb-1 text-[10px] tracking-[0.24em] text-fog">六位二进制状态生成器</p>
      <h1 className="mb-6 text-lg font-bold tracking-[0.2em]">选择输入来源</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="起卦方式">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="tile"
            data-active={mode === m.id}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            <span className="text-[13px] font-bold tracking-[0.18em]">{m.title}</span>
            <span className="text-[10px] tracking-[0.12em] text-fog">{m.sub}</span>
          </button>
        ))}
      </div>

      {mode === 'entropy' && <EntropyPanel />}
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
        <div className="text-[11px] leading-relaxed text-fog">
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
        <p className="mt-3 text-[11px] tracking-[0.2em] text-flux caret" aria-live="polite">
          正在采样熵源
        </p>
      )}
    </Panel>
  )
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
            <span className="w-6 text-right text-[10px] text-fog">L{i + 1}</span>
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
                'w-16 border px-0 py-2 text-[10px] tracking-[0.14em]',
                mutating ? 'border-flux text-flux' : 'border-edge text-fog',
              )}
            >
              {mutating ? '◉ 翻转' : '翻转'}
            </button>
            <span className="w-4 text-[11px] tabular-nums text-fog" aria-hidden="true">
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

function GenerateBar({ rawLines, method }: { rawLines: RawLines; method: InputMethod }) {
  const navigate = useNavigate()
  const { commitReading } = useReading()
  const { resolvedTimezone } = useSettings()

  function generate() {
    const chart = generateChart({
      inputMethod: method,
      rawLines,
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
          className="w-full border border-edge bg-void px-3 py-2 text-sm text-ink placeholder:text-fog/60 focus:border-signal focus:outline-none"
        />
        <ul className="mt-3 grid max-h-52 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" role="listbox" aria-label="检索结果">
          {results.map((h) => (
            <li key={h.kingWenNumber}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.kingWenNumber === h.kingWenNumber}
                onClick={() => setDraft(rawLinesFromRecord(h))}
                className="flex w-full items-center justify-between border border-edge bg-surface px-3 py-2 text-left text-[12px] hover:border-signal data-[active=true]:border-signal"
                data-active={selected?.kingWenNumber === h.kingWenNumber}
              >
                <span>{h.chineseName}</span>
                <span className="text-[10px] tabular-nums text-fog">HEX {h.kingWenNumber}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-[11px] tracking-widest text-flux">未找到匹配状态</li>
          )}
        </ul>
      </Panel>
      {selected && (
        <Panel tag="翻转掩码 // 可选">
          <p className="mb-3 text-[11px] text-fog">
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
      <Panel tag={`数字种子 // ${NUMBER_METHOD_VERSION}`}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          placeholder="输入一至三个数字，例如：384927 或 128 64 32"
          aria-label="数字种子"
          className="w-full border border-edge bg-void px-3 py-2 text-sm tracking-[0.2em] text-ink placeholder:tracking-normal placeholder:text-fog/60 focus:border-signal focus:outline-none"
        />
        <p className="mt-2 text-[10px] leading-relaxed text-fog">
          规则 {NUMBER_METHOD_VERSION}：上卦 = A MOD 8 · 下卦 = B MOD 8 · 动爻 = C MOD 6 ·
          余数 0 → 坤 / 上爻
        </p>
        {input.trim() !== '' && !valid && (
          <p className="mt-2 text-[11px] tracking-widest text-flux" role="alert">
            种子无效 — 请输入数字
          </p>
        )}
        {parsed.ok && (
          <div className="mt-3 space-y-1 text-[11px] text-fog">
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
    <Panel tag={`使用当前时间戳 // ${TIME_METHOD_VERSION}`}>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] leading-relaxed text-fog">
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
          <p className="mt-1 text-[10px] opacity-70">
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
