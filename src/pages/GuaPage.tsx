import { Link, useParams } from 'react-router-dom'
import { HexLines } from '@/components/HexLines'
import { HexagramClassic } from '@/components/ZhouyiClassics'
import { TRIGRAMS, type TrigramKey } from '@/data/trigrams'
import { placementOf } from '@/engine/hexagrams'
import { GUA_INDEX_PATH, guaNumberFromPath, guaPath, guaProfile, palaceGroups, palaceRankLabel } from '@/lib/gua'
import { NotFoundPage } from '@/pages/NotFoundPage'
import type { HexagramRecord } from '@/types'

const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const
const RANK_NAMES = ['首卦', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'] as const

function trigramLabel(key: TrigramKey): string {
  return `${TRIGRAMS[key].name}（${TRIGRAMS[key].symbol}）`
}

function GuaLink({ record }: { record: HexagramRecord }) {
  return (
    <Link to={guaPath(record.kingWenNumber)} className="text-signal underline underline-offset-4">
      {record.chineseName}
    </Link>
  )
}

export function GuaIndexPage() {
  return (
    <article className="gua-page pt-6 text-base leading-relaxed">
      <header className="mb-6">
        <p className="gua-kicker">THE 64 HEXAGRAMS</p>
        <h1 className="text-2xl font-bold tracking-[0.2em]">六十四卦</h1>
        <p className="mt-2 text-fog">
          《周易》六十四卦按京房八宫排列：每宫自首卦起，依次为一世至五世、游魂、归魂。点开各卦可查看卦辞爻辞原文，以及纳甲装卦、世应、六亲、伏神与错综互卦。
        </p>
      </header>

      {palaceGroups().map(({ palaceKey, members }) => (
        <section key={palaceKey} className="panel mb-4 p-4 sm:p-5" aria-labelledby={`palace-${palaceKey}`}>
          <span className="panel-tag">五行属{TRIGRAMS[palaceKey].element}</span>
          <h2 id={`palace-${palaceKey}`} className="text-lg font-bold tracking-[0.16em] text-ink">
            {TRIGRAMS[palaceKey].name}宫八卦
          </h2>
          <ol className="gua-palace-list">
            {members.map((record, rank) => (
              <li key={record.kingWenNumber}>
                <span>{RANK_NAMES[rank]}</span>
                <GuaLink record={record} />
              </li>
            ))}
          </ol>
        </section>
      ))}

      <p className="mt-6 text-fog">
        想用某一卦排盘，可回到<Link to="/" className="text-signal underline underline-offset-4">起卦页</Link>选择「卦名起卦」。
      </p>
    </article>
  )
}

export function GuaDetailPage() {
  const { number = '' } = useParams()
  const kingWenNumber = guaNumberFromPath(`${GUA_INDEX_PATH}/${number}`)
  // 与未知路径一致：显示 404 页面，服务器端同样返回 404 状态。
  if (kingWenNumber === null) return <NotFoundPage />
  return <GuaDetail kingWenNumber={kingWenNumber} />
}

function GuaDetail({ kingWenNumber }: { kingWenNumber: number }) {
  const gua = guaProfile(kingWenNumber)
  const { record, state } = gua
  const rows = [...gua.lines].reverse()
  const shiLine = gua.lines.find((line) => line.shiYing === '世')!
  const yingLine = gua.lines.find((line) => line.shiYing === '应')!
  const palaceKey = placementOf(record.bits).palaceKey
  const palaceMembers = palaceGroups().find((group) => group.palaceKey === palaceKey)!.members
  const previous = kingWenNumber > 1 ? guaProfile(kingWenNumber - 1).record : null
  const next = kingWenNumber < 64 ? guaProfile(kingWenNumber + 1).record : null

  return (
    <article className="gua-page pt-6 text-base leading-relaxed">
      <nav aria-label="页面位置" className="mb-4 text-[0.875rem] tracking-[0.12em] text-fog">
        <Link to={GUA_INDEX_PATH} className="text-fog underline underline-offset-4 hover:text-signal">六十四卦</Link>
        {' / '}
        <span>第 {kingWenNumber} 卦</span>
      </nav>

      <header className="gua-hero">
        <div>
          <p className="gua-kicker">HEX {String(kingWenNumber).padStart(2, '0')} · 周易第 {kingWenNumber} 卦</p>
          <h1 className="text-2xl font-bold tracking-[0.2em]">
            {record.chineseName}
            <span className="ml-2 text-lg text-fog">（{record.shortName}卦）</span>
          </h1>
          <p className="mt-3 text-fog">
            {[
              `${record.chineseName}，上卦为${trigramLabel(gua.upper)}，下卦为${trigramLabel(gua.lower)}。`,
              `京房八宫属${palaceRankLabel(state)}，五行属${gua.palaceElement}${state.attribute ? `，为${state.attribute}卦` : ''}。`,
              `世爻在${LINE_NAMES[shiLine.index]}，应爻在${LINE_NAMES[yingLine.index]}。`,
            ].join('')}
          </p>
        </div>
        <div className="gua-hero-figure">
          <HexLines bits={record.bits} showLabels={false} />
        </div>
      </header>

      <dl className="gua-facts">
        <Fact label="上卦" value={trigramLabel(gua.upper)} />
        <Fact label="下卦" value={trigramLabel(gua.lower)} />
        <Fact label="宫位" value={`${state.palace} · 五行属${gua.palaceElement}`} />
        <Fact label="卦别" value={state.attribute ? `${state.palaceRank} · ${state.attribute}` : state.palaceRank} />
        <Fact label="世应" value={`世${LINE_NAMES[shiLine.index]} · 应${LINE_NAMES[yingLine.index]}`} />
        <Fact label="卦身" value={`${gua.guaShen}（${gua.lines.some((line) => line.najia.branch === gua.guaShen) ? '已上卦' : '未上卦'}）`} />
      </dl>

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="gua-classic-title">
        <span className="panel-tag">周易原文</span>
        <h2 id="gua-classic-title" className="text-lg font-bold tracking-[0.16em] text-ink">
          {record.chineseName}卦辞与爻辞
        </h2>
        <div className="zhouyi-classics">
          <div className="zhouyi-classics-grid" data-single="true">
            <HexagramClassic label="卦辞 · 六爻" state={state} mutationMask={0} primary />
          </div>
        </div>
        <p className="mt-3 text-[0.875rem] text-fog">仅录《周易》卦辞与爻辞，不含彖传、象传。</p>
      </section>

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="gua-najia-title">
        <span className="panel-tag">纳甲装卦</span>
        <h2 id="gua-najia-title" className="text-lg font-bold tracking-[0.16em] text-ink">
          {record.chineseName}纳甲装卦
        </h2>
        <p className="mt-2 text-fog">
          以本宫{TRIGRAMS[palaceKey].name}宫五行{gua.palaceElement}为「我」定六亲；
          内卦纳{TRIGRAMS[gua.lower].name}卦干支，外卦纳{TRIGRAMS[gua.upper].name}卦干支。
        </p>
        <div className="gua-table-wrap">
          <table className="gua-table">
            <thead>
              <tr>
                <th scope="col">爻位</th>
                <th scope="col">爻象</th>
                <th scope="col">六亲</th>
                <th scope="col">纳甲</th>
                <th scope="col">五行</th>
                <th scope="col">世应</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.index}>
                  <th scope="row">{LINE_NAMES[line.index]}</th>
                  <td>{line.yang ? '阳 ⚊' : '阴 ⚋'}</td>
                  <td>{line.relation}</td>
                  <td>{line.najia.stem}{line.najia.branch}</td>
                  <td>{line.najia.element}</td>
                  <td className="text-signal">{line.shiYing ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-fog">
          {gua.fuShen.length > 0 ? (
            `伏神：本卦六亲不全，缺${gua.fuShen.map((entry) => entry.relation).join('、')}，取本宫首卦${palaceMembers[0]!.chineseName}：${
              gua.fuShen.map((entry) => `${entry.relation}${entry.najia.stem}${entry.najia.branch}${entry.najia.element}伏于${LINE_NAMES[entry.index]}`).join('；')
            }。`
          ) : (
            '伏神：本卦五类六亲俱全，无伏神。'
          )}
        </p>
        <p className="mt-2 text-[0.875rem] text-fog">
          六神随起卦日干而定，旬空、神煞随起卦时间而定，需起卦后在完整排盘中查看。
        </p>
      </section>

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="gua-related-title">
        <span className="panel-tag">卦变</span>
        <h2 id="gua-related-title" className="text-lg font-bold tracking-[0.16em] text-ink">
          {record.chineseName}的错卦、综卦与互卦
        </h2>
        <dl className="gua-related">
          <div>
            <dt>错卦</dt>
            <dd><GuaLink record={gua.cuo} /><span>六爻阴阳全反</span></dd>
          </div>
          <div>
            <dt>综卦</dt>
            <dd>
              {gua.zong.bits === record.bits
                ? <><span className="text-ink">{record.chineseName}</span><span>上下颠倒后仍为本卦</span></>
                : <><GuaLink record={gua.zong} /><span>上下颠倒</span></>}
            </dd>
          </div>
          <div>
            <dt>互卦</dt>
            <dd><GuaLink record={gua.hu} /><span>二三四爻为下卦，三四五爻为上卦</span></dd>
          </div>
        </dl>
      </section>

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="gua-palace-title">
        <span className="panel-tag">同宫</span>
        <h2 id="gua-palace-title" className="text-lg font-bold tracking-[0.16em] text-ink">
          {state.palace}八卦
        </h2>
        <ol className="gua-palace-list">
          {palaceMembers.map((member, rank) => (
            <li key={member.kingWenNumber}>
              <span>{RANK_NAMES[rank]}</span>
              {member.bits === record.bits
                ? <strong className="text-ink" aria-current="page">{member.chineseName}</strong>
                : <GuaLink record={member} />}
            </li>
          ))}
        </ol>
      </section>

      <nav aria-label="上一卦与下一卦" className="gua-pager">
        {previous ? <Link to={guaPath(previous.kingWenNumber)}>← 第 {previous.kingWenNumber} 卦 {previous.chineseName}</Link> : <span />}
        <Link to={GUA_INDEX_PATH}>六十四卦</Link>
        {next ? <Link to={guaPath(next.kingWenNumber)}>第 {next.kingWenNumber} 卦 {next.chineseName} →</Link> : <span />}
      </nav>

      <p className="mt-6 text-fog">
        卦象的吉凶需结合所问之事、动爻与起卦时间判断。可到<Link to="/" className="text-signal underline underline-offset-4">起卦页</Link>起卦，得到含六神、旬空、神煞与变卦的完整排盘。
      </p>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
