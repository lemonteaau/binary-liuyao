import { useState } from 'react'
import { ZhouyiClassics } from '@/components/ZhouyiClassics'
import { LINE_TRANSFORM_NOTES, lineTransformOf } from '@/engine'
import { cn } from '@/lib/cn'
import { isXunKong, LINE_NAMES, shenshaPosition } from '@/lib/reading-marks'
import { formatTimezoneWithOffset, parseGregorianToDate } from '@/lib/timezone-display'
import type { Branch, ChartData, ChartLine, HexStateInfo, NajiaLine, ShenShaEntry } from '@/types'

const READING_MODE_KEY = 'hex64.reading-mode.v1'

type ReadingMode = 'structured' | 'plain'

function loadReadingMode(): ReadingMode {
  try {
    return localStorage.getItem(READING_MODE_KEY) === 'plain' ? 'plain' : 'structured'
  } catch {
    return 'structured'
  }
}

function saveReadingMode(mode: ReadingMode): void {
  try {
    localStorage.setItem(READING_MODE_KEY, mode)
  } catch {
    /* 只是个人偏好，写不进去时下次回到默认的结构化视图 */
  }
}

export function FullReading({ chart, rawText }: { chart: ChartData; rawText: string }) {
  const [mode, setMode] = useState<ReadingMode>(loadReadingMode)
  const rows = [...chart.lines].sort((a, b) => b.index - a.index)
  const hasMutation = chart.mutationMask !== 0
  const visibleShensha = chart.shensha.filter((entry) => entry.branches.length > 0)

  function changeMode(next: ReadingMode) {
    setMode(next)
    saveReadingMode(next)
  }

  return (
    <section
      id="full-reading"
      className="full-reading panel mt-4 p-4 sm:p-5"
      aria-labelledby="full-reading-title"
    >
      <span className="panel-tag">完整排盘</span>

      <header className="full-reading-header">
        <h2 id="full-reading-title">{mode === 'structured' ? '结构化六爻排盘' : '纯文字排盘'}</h2>
        <div className="full-reading-mode" role="group" aria-label="排盘显示模式">
          <ModeButton active={mode === 'structured'} onClick={() => changeMode('structured')}>
            结构化
          </ModeButton>
          <ModeButton active={mode === 'plain'} onClick={() => changeMode('plain')}>
            纯文字
          </ModeButton>
        </div>
      </header>

      {mode === 'structured' ? (
        <>
          <section className="reading-context" aria-label="排盘时间与历法">
            <dl className="reading-context-grid">
              <ReadingDatum label="公历" value={chart.calendar.gregorian} />
              <ReadingDatum
                label="农历"
                value={`${chart.calendar.lunarText}日 · ${chart.calendar.hourZhi}时`}
              />
              <ReadingDatum
                label="时区"
                value={formatTimezoneWithOffset(
                  chart.calendar.timezone,
                  chart.calendar.utcOffset,
                  parseGregorianToDate(chart.calendar.gregorian, chart.calendar.utcOffset),
                )}
              />
            </dl>
            <dl className="reading-pillars" aria-label="四柱干支、旬空与卦身">
              <Pillar label="年柱" value={chart.calendar.ganzhi.year} />
              <Pillar label="月柱" value={chart.calendar.ganzhi.month} />
              <Pillar label="日柱" value={chart.calendar.ganzhi.day} />
              <Pillar label="时柱" value={chart.calendar.ganzhi.hour} />
              <Pillar label="旬空" value={chart.calendar.xunKong.join('')} />
              <Pillar
                label="卦身"
                value={chart.guaShen.branch}
                note={chart.guaShen.onHexagram ? '已上卦' : '未上卦'}
              />
            </dl>
          </section>

          <section
            className="reading-matrix"
            data-static={!hasMutation}
            aria-label={hasMutation ? '本卦与变卦逐爻排盘' : '本卦逐爻排盘'}
          >
            <div className="reading-matrix-head">
              <span className="reading-axis-head">爻位 / 六神</span>
              <HexReadingHead
                label="本卦"
                state={chart.primary}
                note={hasMutation ? undefined : '六爻安静 · 无变卦'}
              />
              {hasMutation && (
                <>
                  <span className="reading-change-head">变化</span>
                  <HexReadingHead label="变卦" state={chart.result} />
                </>
              )}
            </div>

            <div className="reading-line-list">
              {rows.map((line) => (
                <ReadingLineRow key={line.index} chart={chart} line={line} showResult={hasMutation} />
              ))}
            </div>
          </section>

          <section className="reading-supplement" aria-label="神煞与附加信息">
            <div className="reading-shensha">
              <div className="reading-section-title">
                <span>神煞</span>
                <span>{visibleShensha.length} 项</span>
              </div>
              {visibleShensha.length > 0 ? (
                <ul>
                  {visibleShensha.map((entry) => (
                    <ShenshaItem key={entry.id} entry={entry} chart={chart} />
                  ))}
                </ul>
              ) : (
                <p className="text-fog">本次无神煞命中。</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="reading-plain" aria-label="纯文字排盘">
          <pre>{rawText}</pre>
        </section>
      )}

      <ZhouyiClassics chart={chart} />
    </section>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button type="button" aria-pressed={active} data-active={active} onClick={onClick}>
      {children}
    </button>
  )
}

function HexReadingHead({ label, state, note }: { label: string; state: HexStateInfo; note?: string }) {
  return (
    <div className="reading-hex-head">
      <span>{label}</span>
      <strong>{state.record.chineseName}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

function ReadingLineRow({
  chart,
  line,
  showResult,
}: {
  chart: ChartData
  line: ChartLine
  showResult: boolean
}) {
  const resultYang = Boolean((chart.result.bits >> line.index) & 1)
  const fuShen = chart.fuShen.filter((entry) => entry.index === line.index)
  const lineName = LINE_NAMES[line.index] ?? `第${line.index + 1}爻`
  const transform = lineTransformOf(line)
  const xunKong = chart.calendar.xunKong
  const isKong = (branch: Branch) => isXunKong(chart, branch)

  return (
    <article
      className="reading-line-row"
      data-mutating={line.mutating}
      aria-label={`${lineName}${line.mutating ? '，动爻' : '，静爻'}${transform ? `，${transform}` : ''}`}
    >
      <header className="reading-line-rail">
        <span>{lineName}</span>
        <strong>{line.primary.spirit ?? '—'}</strong>
        {line.primary.shiYing && <b className="reading-shiying">{line.primary.shiYing}</b>}
      </header>

      <div className="reading-side-cell reading-primary-cell">
        <LineGlyph yang={line.yang} mutating={line.mutating} />
        <div className="reading-line-detail">
          <NajiaValue
            relation={line.primary.relation}
            najia={line.primary.najia}
            kong={isKong(line.primary.najia.branch) ? xunKong : null}
          />
          {line.mutating && (
            <div className="reading-line-badges">
              <span>{line.yang ? '老阳 · 动' : '老阴 · 动'}</span>
            </div>
          )}
          {fuShen.map((entry) => (
            <p className="reading-fushen" key={`${entry.index}-${entry.relation}`}>
              <span>伏神</span>
              {entry.relation}{najiaText(entry.najia)}
              {isKong(entry.najia.branch) && <KongMark xunKong={xunKong} />}
            </p>
          ))}
        </div>
      </div>

      {showResult && (
        <>
          <div className="reading-change-cell" data-mutating={line.mutating} aria-hidden="true">
            {line.mutating && <span>变</span>}
          </div>

          <div className="reading-side-cell reading-result-cell">
            <LineGlyph yang={resultYang} />
            <div className="reading-line-detail">
              <NajiaValue
                relation={line.result.relation}
                najia={line.result.najia}
                kong={line.mutating && isKong(line.result.najia.branch) ? xunKong : null}
              />
              {transform && (
                <div className="reading-line-badges">
                  <em className="reading-transform" title={LINE_TRANSFORM_NOTES[transform]}>
                    {transform}
                  </em>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </article>
  )
}

function LineGlyph({ yang, mutating = false }: { yang: boolean; mutating?: boolean }) {
  return (
    <span className={cn('reading-line-glyph', mutating ? 'is-mutating' : null)} aria-hidden="true">
      {yang ? (
        <i className="reading-line-segment w-full" />
      ) : (
        <>
          <i className="reading-line-segment w-[43%]" />
          <i className="reading-line-segment w-[43%]" />
        </>
      )}
    </span>
  )
}

function NajiaValue({
  relation,
  najia,
  kong,
}: {
  relation: string
  najia: NajiaLine
  kong: readonly Branch[] | null
}) {
  return (
    <p className="reading-najia">
      <strong>{relation}</strong>
      <span>{najiaText(najia)}</span>
      {kong && <KongMark xunKong={kong} />}
    </p>
  )
}

/** 地支落在日旬空亡：只做事实标注，不判吉凶。 */
function KongMark({ xunKong }: { xunKong: readonly Branch[] }) {
  return (
    <em className="reading-kong" title={`旬空：${xunKong.join('')}`}>
      空
    </em>
  )
}

function ShenshaItem({ entry, chart }: { entry: ShenShaEntry; chart: ChartData }) {
  const position = shenshaPosition(entry, chart)

  return (
    <li data-hit={position !== null}>
      <span>{entry.name}</span>
      <strong>{entry.branches.join('')}</strong>
      {position && <em title={`落在${position}`}>{position}</em>}
    </li>
  )
}

function ReadingDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="reading-datum">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Pillar({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="reading-pillar">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </dd>
    </div>
  )
}

function najiaText(najia: NajiaLine): string {
  return `${najia.stem}${najia.branch}${najia.element}`
}
