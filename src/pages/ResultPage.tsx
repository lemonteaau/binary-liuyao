import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CopyButton } from '@/components/CopyButton'
import { FullReading } from '@/components/FullReading'
import { HexLines } from '@/components/HexLines'
import { generateChart } from '@/engine'
import { bitsToString, stringToBits } from '@/engine/binary'
import { formatRawText } from '@/formatters/rawText'
import type { LineValue } from '@/types'
import { INPUT_METHOD_LABELS_UI, useReading } from '@/store/reading'
import { useSettings } from '@/store/settings'

type RawLines = [LineValue, LineValue, LineValue, LineValue, LineValue, LineValue]

export function ResultPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { current, commitReading } = useReading()
  const { resolvedTimezone, settings } = useSettings()

  const linkParams = useMemo(() => parseLinkParams(new URLSearchParams(location.search)), [location.search])
  const currentMatchesLink = !linkParams || (
    current?.chart.inputMethod === 'link' &&
    current.chart.primary.bits === linkParams.primary &&
    current.chart.mutationMask === linkParams.mask
  )

  useEffect(() => {
    if (!linkParams || currentMatchesLink) return
    const rawLines = rawLinesFromBits(linkParams.primary, linkParams.mask)
    const chart = generateChart({
      inputMethod: 'link',
      rawLines,
      timezone: resolvedTimezone,
    })
    commitReading(chart, rawLines)
  }, [linkParams, currentMatchesLink, commitReading, resolvedTimezone])

  if (!current || !currentMatchesLink) {
    if (linkParams) {
      return <p className="pt-10 text-[0.9375rem] tracking-widest text-fog">正在还原卦象…</p>
    }
    return (
      <div className="pt-10 text-base leading-loose text-fog">
        <p>当前没有排盘。</p>
        <Link to="/" className="text-signal">
          → 返回起卦
        </Link>
      </div>
    )
  }

  const chart = current.chart
  const rawText = formatRawText(chart, { includeAiInstruction: settings.aiInstruction })
  const isLinkMode = chart.inputMethod === 'link' || linkParams !== null
  const hasMutation = chart.mutationMask !== 0

  const shareUrl = () => {
    const s = bitsToString(chart.primary.bits)
    const m = bitsToString(chart.mutationMask)
    return `${window.location.origin}${window.location.pathname}#/result?s=${s}&m=${m}`
  }

  return (
    <div className="pt-5">
      {isLinkMode && (
        <p className="mb-4 border border-edge bg-surface px-3 py-2 text-[0.875rem] tracking-[0.16em] text-fog" role="note">
          来自分享链接 // 历法按查看时刻重新计算 · 链接不包含时间戳
        </p>
      )}

      <div className="result-session-bar mb-4 flex flex-wrap items-center justify-between gap-2 border border-edge bg-surface px-3 py-2 text-[0.875rem] tracking-[0.18em] text-fog">
        <span className="result-session-meta flex items-center gap-3">
          <span className="shrink-0 whitespace-nowrap text-signal">排盘 {current.id}</span>
          <span className="shrink-0" aria-hidden="true">//</span>
          <span className="shrink-0 whitespace-nowrap">排盘完成</span>
          <span className="shrink-0" aria-hidden="true">//</span>
          <span className="shrink-0 whitespace-nowrap">{INPUT_METHOD_LABELS_UI[chart.inputMethod]}</span>
        </span>
        <span className="result-session-time whitespace-nowrap tabular-nums">{chart.createdAt}</span>
      </div>

      <div className="result-state-grid">
        <div className="result-state-primary">
          <StatePanel
            tag="本卦"
            binary={chart.primary.binary}
            bits={chart.primary.bits}
            mask={chart.mutationMask}
            name={chart.primary.record.chineseName}
            hexNumber={chart.primary.record.kingWenNumber}
            palace={`${chart.primary.palace}·${chart.primary.palaceRank}${chart.primary.attribute ? `·${chart.primary.attribute}` : ''}`}
          />
        </div>

        <div className="result-state-xor" aria-label={`动爻标记 ${bitsToString(chart.mutationMask)}`}>
          <div className="hidden h-full w-px bg-edge lg:block" />
          <div className="result-state-xor-copy">
            <p className={`result-state-xor-label ${hasMutation ? 'text-flux' : 'text-fog'}`}>动爻标记</p>
            <p className={`result-state-xor-mask ${hasMutation ? 'text-flux' : 'text-ink'}`}>
              {bitsToString(chart.mutationMask)}
            </p>
            <p className="result-state-xor-direction text-fog">
              <span className="result-state-xor-mobile">→ XOR →</span>
              <span className="result-state-xor-desktop">▼ XOR ▼</span>
            </p>
          </div>
          <div className="hidden h-full w-px bg-edge lg:block" />
        </div>

        <div className="result-state-result">
          <StatePanel
            tag="变卦"
            binary={chart.result.binary}
            bits={chart.result.bits}
            mask={0}
            name={chart.result.record.chineseName}
            hexNumber={chart.result.record.kingWenNumber}
            palace={`${chart.result.palace}·${chart.result.palaceRank}${chart.result.attribute ? `·${chart.result.attribute}` : ''}`}
          />
        </div>
      </div>

      <section className="panel mt-4 p-4 sm:p-5">
        <span className="panel-tag">元数据</span>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="时间戳" value={chart.calendar.gregorian} />
          <Meta label="时区" value={`${chart.calendar.timezone} ${chart.calendar.utcOffset}`} />
          <Meta label="农历" value={chart.calendar.lunarText} />
          <Meta
            label="四柱"
            value={`${chart.calendar.ganzhi.year} / ${chart.calendar.ganzhi.month} / ${chart.calendar.ganzhi.day} / ${chart.calendar.ganzhi.hour}`}
          />
          <Meta label="旬空" value={chart.calendar.xunKong.join('')} />
          <Meta label="卦身" value={`${chart.guaShen.branch}${chart.guaShen.onHexagram ? '' : ' // 未上卦'}`} />
        </dl>
        {chart.shensha.some((s) => s.branches.length > 0) && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[0.875rem] tracking-[0.2em] text-fog hover:text-signal">
              神煞 [{chart.shensha.filter((s) => s.branches.length > 0).length}]
            </summary>
            <p className="mt-2 leading-relaxed text-fog">
              {chart.shensha
                .filter((s) => s.branches.length > 0)
                .map((s) => `${s.name}—${s.branches.join('')}`)
                .join(' · ')}
            </p>
          </details>
        )}
        {chart.fuShen.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[0.875rem] tracking-[0.2em] text-fog hover:text-signal">
              伏神 [{chart.fuShen.length}]
            </summary>
            <p className="mt-2 leading-relaxed text-fog">
              {chart.fuShen
                .map((f) => `${f.relation}${f.najia.stem}${f.najia.branch}${f.najia.element} @L${f.index + 1}`)
                .join(' · ')}
            </p>
          </details>
        )}
      </section>

      <FullReading
        chart={chart}
        rawText={rawText}
        sessionId={current.id}
        ordinal={current.ordinal}
      />

      <section className="panel mt-4 p-4 sm:p-5">
        <span className="panel-tag">操作</span>
        <div className="flex flex-wrap gap-2">
          <CopyButton label="[ 复制链接 ]" getText={shareUrl} />
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/', { state: { editRawLines: current.rawLines } })}
          >
            [ 修改排盘 ]
          </button>
          <button type="button" className="btn" onClick={() => navigate('/')}>
            [ 再起一卦 ]
          </button>
        </div>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-fog">
          上方「复制排盘」输出适用于 AI 或六爻使用者。
          {settings.aiInstruction ? ' AI 指令附加：已开启。' : ' AI 指令附加：已关闭（可在设置中开启）。'}
          {' '}分享图包含本次排盘的全部信息；分享链接仅包含本卦与动爻信息，不包含时间戳。
        </p>
      </section>

      {current.ordinal !== undefined && (
        <p
          className="mt-4 border border-edge bg-panel px-4 py-3 text-center text-[0.9375rem] tracking-[0.16em] text-fog"
          aria-live="polite"
        >
          {current.ordinal === null ? (
            <span>正在登记全局序号…</span>
          ) : (
            <span>
              这是 HEX//64 自上线以来完成的{' '}
              <span className="inline-flex items-center align-middle whitespace-nowrap">
                第<strong className="text-lg font-bold tabular-nums text-signal">
                  {current.ordinal.toLocaleString('zh-CN')}
                </strong>次起卦
              </span>
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function StatePanel(props: {
  tag: string
  binary: string
  bits: number
  mask: number
  name: string
  hexNumber: number
  palace: string
}) {
  return (
    <section className="state-panel panel">
      <span className="panel-tag">{props.tag}</span>
      <p className="state-binary chroma text-center font-bold tabular-nums text-signal">
        {props.binary}
      </p>
      <div className="state-lines mx-auto max-w-sm">
        <HexLines
          bits={props.bits}
          mask={props.mask}
          compact
          showLabels={false}
          showMutationLabels={false}
        />
      </div>
      <div className="state-name-block text-center">
        <p className="state-name font-bold">{props.name}</p>
        <p className="state-meta text-fog">
          HEX {String(props.hexNumber).padStart(2, '0')}·{props.palace}
        </p>
      </div>
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-fog">{label}</dt>
      <dd className="min-w-0 break-all tabular-nums">{value}</dd>
    </div>
  )
}

function parseLinkParams(params: URLSearchParams): { primary: number; mask: number } | null {
  const s = params.get('s')
  const m = params.get('m')
  if (!s || !m) return null
  const primary = stringToBits(s.toUpperCase())
  const mask = stringToBits(m.toUpperCase())
  if (primary === null || mask === null) return null
  return { primary, mask }
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
