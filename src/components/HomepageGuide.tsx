import { Link } from 'react-router-dom'
import { trackEvent } from '@/lib/analytics'
import './homepage-guide.css'

const HIGHLIGHTS = [
  {
    title: '七种起卦方式',
    body: '摇币、电脑、手动、卦名、数字、时间与汉字起卦，逐爻摇币或一键完成。',
  },
  {
    title: '完整纳甲装卦',
    body: '本卦、变卦、世应、六亲、六神、伏神、卦身、旬空、神煞与四柱，附周易卦辞爻辞。',
  },
  {
    title: '本地计算 · 无广告',
    body: '起卦内容不上传，无需下载注册，手机和电脑浏览器打开即用。',
  },
]

/** A short, below-the-fold introduction for first-time visitors on the idle homepage. */
export function HomepageGuide() {
  return (
    <section className="homepage-guide" aria-labelledby="homepage-guide-title">
      <h2 id="homepage-guide-title" className="homepage-guide-title">免费在线六爻排盘</h2>
      <p className="homepage-guide-lead">
        HEX//64 按京房八宫纳甲法自动装卦。在上方选择起卦方式，即可得到完整的六爻排盘，可复制文本、保存分享图，或交给 AI 解读。
      </p>

      <div className="homepage-guide-grid">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title} className="homepage-guide-card">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </div>
        ))}
      </div>

      <h2 className="homepage-guide-title">常见问题</h2>
      <div className="homepage-guide-faq">
        <details>
          <summary>六爻排盘是免费的吗？</summary>
          <p>
            完全免费，没有广告，也不需要注册账号，源码以 MIT 许可证公开在<a href="https://github.com/lemonteaau/binary-liuyao" target="_blank" rel="noopener noreferrer">GitHub</a>。{''}
            如果它帮到了你，欢迎<Link to="/about?support=1" onClick={() => trackEvent('点击支持作者', { 入口: '首页问答' })}>打赏作者</Link>，帮助本站持续保持免费、无广告的运营。
          </p>
        </details>
        <details>
          <summary>起卦内容会上传到服务器吗？</summary>
          <p>不会。起卦与排盘都在浏览器本地计算，输入的数字、汉字和卦象不会上传。</p>
        </details>
        <details>
          <summary>排盘依据什么规则？</summary>
          <p>
            世应按京房八宫，六亲以本宫五行为准，六神按日干起，四柱以节气为界。{''}
            各起卦方式的算法与神煞流派见<Link to="/about">关于页</Link>。
          </p>
        </details>
        <details>
          <summary>怎样用 AI 解读排盘？</summary>
          <p>
            排盘完成后复制完整排盘文本，按<Link to="/ai-guide">AI 解卦教程</Link>安装六爻解读 Skill，再把排盘和问题一起交给 AI 分析。
          </p>
        </details>
      </div>
    </section>
  )
}
