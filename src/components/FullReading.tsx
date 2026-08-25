import { TRIGRAMS } from '@/data/trigrams'
import { INPUT_METHOD_LABELS } from '@/engine'
import { cn } from '@/lib/cn'
import type { ChartData, ChartLine, HexStateInfo, NajiaLine } from '@/types'

const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const

export function FullReading({ chart }: { chart: ChartData }) {
  const rows = [...chart.lines].sort((a, b) => b.index - a.index)
  const visibleShensha = chart.shensha.filter((entry) => entry.branches.length > 0)
  const mutatingCount = chart.lines.filter((line) => line.mutating).length

  return (
    <section
      id="full-reading"
      className="full-reading panel mt-4 p-4 sm:p-5"
      aria-labelledby="full-reading-title"
    >
      <span className="panel-tag">完整排盘</span>

      <header className="full-reading-header">
        <div>
          <p className="full-reading-kicker">COMPLETE LIUYAO MATRIX</p>
          <h2 id="full-reading-title">结构化六爻排盘</h2>
        </div>
        <div className="full-reading-status" aria-label="排盘状态">
          <span>{INPUT_METHOD_LABELS[chart.inputMethod]}</span>
          <span>{mutatingCount > 0 ? `${mutatingCount} 个动爻` : '无动爻'}</span>
        </div>
      </header>

      <section className="reading-context" aria-label="排盘时间与历法">
        <dl className="reading-context-grid">
          <ReadingDatum label="公历" value={chart.calendar.gregorian} />
          <ReadingDatum
            label="农历"
            value={`${chart.calendar.lunarText}日 · ${chart.calendar.hourZhi}时`}
          />
          <ReadingDatum
            label="时区"
            value={`${chart.calendar.timezone} ${chart.calendar.utcOffset}`}
          />
          <ReadingDatum label="旬空" value={chart.calendar.xunKong.join('')} />
          <ReadingDatum
            label="卦身"
            value={`${chart.guaShen.branch} · ${chart.guaShen.onHexagram ? '已上卦' : '未上卦'}`}
          />
        </dl>
        <div className="reading-pillars" aria-label="四柱干支">
          <Pillar label="年柱" value={chart.calendar.ganzhi.year} />
          <Pillar label="月柱" value={chart.calendar.ganzhi.month} />
          <Pillar label="日柱" value={chart.calendar.ganzhi.day} />
          <Pillar label="时柱" value={chart.calendar.ganzhi.hour} />
        </div>
      </section>

      <section className="reading-matrix" aria-label="本卦与变卦逐爻排盘">
        <div className="reading-matrix-head">
          <span className="reading-axis-head">爻位 / 六神</span>
          <HexReadingHead label="本卦" state={chart.primary} />
          <span className="reading-change-head">变化</span>
          <HexReadingHead label="变卦" state={chart.result} />
        </div>

        <div className="reading-line-list">
          {rows.map((line) => (
            <ReadingLineRow key={line.index} chart={chart} line={line} />
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
                <li key={entry.id}>
                  <span>{entry.name}</span>
                  <strong>{entry.branches.join('')}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fog">本次无神煞命中。</p>
          )}
        </div>
      </section>
    </section>
  )
}

function HexReadingHead({ label, state }: { label: string; state: HexStateInfo }) {
  const upper = TRIGRAMS[state.record.upperKey]
  const lower = TRIGRAMS[state.record.lowerKey]

  return (
    <div className="reading-hex-head">
      <span>{label}</span>
      <strong>{state.record.chineseName}</strong>
      <p>
        HEX {String(state.record.kingWenNumber).padStart(2, '0')} · {state.palace} · {state.palaceRank}
        {state.attribute ? ` · ${state.attribute}` : ''}
      </p>
      <p>上卦 {upper.name}{upper.symbol} / 下卦 {lower.name}{lower.symbol}</p>
    </div>
  )
}

function ReadingLineRow({ chart, line }: { chart: ChartData; line: ChartLine }) {
  const resultYang = Boolean((chart.result.bits >> line.index) & 1)
  const fuShen = chart.fuShen.filter((entry) => entry.index === line.index)
  const lineName = LINE_NAMES[line.index] ?? `第${line.index + 1}爻`

  return (
    <article
      className="reading-line-row"
      data-mutating={line.mutating}
      aria-label={`${lineName}${line.mutating ? '，动爻' : '，静爻'}`}
    >
      <header className="reading-line-rail">
        <span className="reading-line-code">L{line.index + 1}</span>
        <span>{lineName}</span>
        <strong>{line.primary.spirit ?? '—'}</strong>
      </header>

      <div className="reading-side-cell reading-primary-cell">
        <LineGlyph yang={line.yang} mutating={line.mutating} />
        <div className="reading-line-detail">
          <span className="reading-mobile-side">本卦</span>
          <NajiaValue relation={line.primary.relation} najia={line.primary.najia} />
          <div className="reading-line-badges">
            <span>{primaryLineState(line)}</span>
            {line.primary.shiYing && <strong>{line.primary.shiYing}</strong>}
          </div>
          {fuShen.map((entry) => (
            <p className="reading-fushen" key={`${entry.index}-${entry.relation}`}>
              <span>伏神</span>
              {entry.relation}{najiaText(entry.najia)}
            </p>
          ))}
        </div>
      </div>

      <div className="reading-change-cell" data-mutating={line.mutating} aria-hidden="true">
        <span>{line.mutating ? '变' : '·'}</span>
        <small>{line.mutating ? '翻转' : '同位'}</small>
      </div>

      <div className="reading-side-cell reading-result-cell">
        <LineGlyph yang={resultYang} />
        <div className="reading-line-detail">
          <span className="reading-mobile-side">变卦</span>
          <NajiaValue relation={line.result.relation} najia={line.result.najia} />
          <div className="reading-line-badges">
            <span>{resultYang ? '阳爻' : '阴爻'}</span>
            {line.mutating && <strong>变后</strong>}
          </div>
        </div>
      </div>
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

function NajiaValue({ relation, najia }: { relation: string; najia: NajiaLine }) {
  return (
    <p className="reading-najia">
      <strong>{relation}</strong>
      <span>{najiaText(najia)}</span>
    </p>
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

function Pillar({ label, value }: { label: string; value: string }) {
  return (
    <div className="reading-pillar">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function najiaText(najia: NajiaLine): string {
  return `${najia.stem}${najia.branch}${najia.element}`
}

function primaryLineState(line: ChartLine): string {
  if (line.yang) return line.mutating ? '老阳 · 动' : '少阳 · 静'
  return line.mutating ? '老阴 · 动' : '少阴 · 静'
}
