import { zhouyiTextByKingWen } from '@/data/zhouyi'
import type { ChartData, HexStateInfo } from '@/types'

export function ZhouyiClassics({ chart }: { chart: ChartData }) {
  const hasTransformation = chart.primary.bits !== chart.result.bits

  return (
    <section
      className="zhouyi-classics"
      aria-labelledby="zhouyi-classics-title"
    >
      <header className="zhouyi-classics-header">
        <div>
          <p>THE BOOK OF CHANGES</p>
          <h3 id="zhouyi-classics-title">周易原文</h3>
        </div>
        <span>卦辞 · 六爻</span>
      </header>

      <div className="zhouyi-classics-grid" data-single={!hasTransformation}>
        <HexagramClassic
          label={hasTransformation ? '本卦' : '本卦 · 无变爻'}
          state={chart.primary}
          mutationMask={chart.mutationMask}
          primary
        />
        {hasTransformation && (
          <HexagramClassic
            label="变卦"
            state={chart.result}
            mutationMask={chart.mutationMask}
          />
        )}
      </div>

      <p className="zhouyi-classics-note">仅录《周易》卦辞与爻辞，不含彖传、象传。</p>
    </section>
  )
}

function HexagramClassic({
  label,
  state,
  mutationMask,
  primary = false,
}: {
  label: string
  state: HexStateInfo
  mutationMask: number
  primary?: boolean
}) {
  const classic = zhouyiTextByKingWen(state.record.kingWenNumber)
  const lines = classic.lines.map((line, index) => ({ line, index })).reverse()
  const specialActive = primary && mutationMask === 0b111111

  return (
    <article className="zhouyi-hexagram" aria-label={`${label}《${state.record.chineseName}》周易原文`}>
      <header className="zhouyi-hexagram-header">
        <span>{label} / HEX {String(state.record.kingWenNumber).padStart(2, '0')}</span>
        <h4>{state.record.chineseName}</h4>
      </header>

      <div className="zhouyi-statement">
        <span>卦辞</span>
        <p>{classic.statement}</p>
      </div>

      <ol className="zhouyi-line-texts" reversed>
        {lines.map(({ line, index }) => {
          const mutating = primary && Boolean((mutationMask >> index) & 1)
          return (
            <li key={line.label} data-mutating={mutating}>
              <LineTextLabel label={line.label} index={index} mutating={mutating} />
              <p>{line.text}</p>
            </li>
          )
        })}
      </ol>

      {classic.special && (
        <div className="zhouyi-special" data-active={specialActive}>
          <LineTextLabel label={classic.special.label} mutating={specialActive} />
          <p>{classic.special.text}</p>
        </div>
      )}
    </article>
  )
}

function LineTextLabel({
  label,
  index,
  mutating = false,
}: {
  label: string
  index?: number
  mutating?: boolean
}) {
  return (
    <div className="zhouyi-line-label">
      {index !== undefined && <span>L{index + 1}</span>}
      <strong>{label}</strong>
      {mutating && <em>动爻</em>}
    </div>
  )
}
