import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FeedbackForm } from '@/components/FeedbackForm'
import { trackEvent } from '@/lib/analytics'
import { markSupportIntent } from '@/lib/support-nudge'

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/lemonteaau'

export function AboutPage() {
  const [searchParams] = useSearchParams()
  const feedbackSectionRef = useRef<HTMLElement>(null)
  const supportSectionRef = useRef<HTMLElement>(null)
  const shouldFocusFeedback = searchParams.get('feedback') === '1'
  const shouldFocusSupport = searchParams.get('support') === '1'

  useEffect(() => {
    if (!shouldFocusFeedback) return
    const frame = window.requestAnimationFrame(() => {
      feedbackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [shouldFocusFeedback])

  useEffect(() => {
    if (!shouldFocusSupport) return
    const frame = window.requestAnimationFrame(() => {
      const section = supportSectionRef.current
      if (!section) return
      section.querySelector('h2')?.focus({ preventScroll: true })
      section.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [shouldFocusSupport])

  return (
    <div className="pt-6 text-base leading-relaxed">
      <h1 className="mb-6 text-2xl font-bold tracking-[0.2em]">关于 HEX//64</h1>

      <Section excludeFromSnippet tag="支持项目" id="support" sectionRef={supportSectionRef}>
        <h2 tabIndex={-1} className="text-lg font-bold tracking-[0.16em] text-ink">支持作者</h2>
        <p className="mt-2 text-fog">
          如果 HEX//64 有帮到你，欢迎打赏本站，每笔打赏都能帮助本站保持免费、无广告的持续运营。
        </p>
        <div className="mt-4 grid max-w-[46.25rem] gap-5 sm:grid-cols-2">
          {[
            { name: '微信赞赏', file: 'wechat.jpg', width: 1152, height: 1152 },
            { name: '支付宝', file: 'alipay.jpg', width: 1708, height: 2125 },
          ].map(({ name, file, width, height }) => (
            <figure key={file} className="relative z-1 mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-sm border border-edge bg-surface sm:mx-0 sm:max-w-[22.5rem]">
              <div className="absolute inset-3">
                <img
                  src={`${import.meta.env.BASE_URL}support/${file}`}
                  alt={`${name}赞赏码`}
                  width={width}
                  height={height}
                  loading="lazy"
                  className="block size-full object-contain"
                />
              </div>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-[0.875rem] text-fog">
          手机上：{['长按保存', '微信/支付宝扫一扫', '从相册选取'].map((step, index) => (
            <span key={step} className="whitespace-nowrap">{index > 0 && ' → '}{step}</span>
          ))}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge pt-4">
          <a
            className="btn no-underline"
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackEvent('点击打赏方式', { 方式: 'Buy Me a Coffee' })
              markSupportIntent()
            }}
          >
            [ Buy Me a Coffee ↗ ]
          </a>
          <span className="text-[0.875rem] text-fog">海外用户可用银行卡或 Apple Pay / Google Pay 支付。</span>
        </div>
      </Section>

      <Section excludeFromSnippet tag="反馈" id="feedback" sectionRef={feedbackSectionRef}>
        <div className="mb-4 max-w-2xl">
          <h2 className="text-lg font-bold tracking-[0.16em] text-ink">写给作者</h2>
        </div>
        <FeedbackForm
          source={shouldFocusFeedback ? 'invite' : 'about'}
          focusOnMount={shouldFocusFeedback}
        />
      </Section>

      <Section tag="产品说明">
        <p className="mt-2">
          HEX//64 免费、无广告，源码以 MIT 许可证公开在<a className="text-signal underline underline-offset-4" href="https://github.com/lemonteaau/binary-liuyao" target="_blank" rel="noopener noreferrer">GitHub</a>，可自行部署。
        </p>
        <p className="mt-2">
          所有排盘计算均在浏览器本地完成，起卦内容、数字、汉字与卦象都不会上传；仅用自托管 Umami 做匿名访问统计。
        </p>
      </Section>

      <Section tag="输入算法">
        <dl className="space-y-3">
          <div>
            <dt className="text-signal">电脑起卦</dt>
            <dd className="text-fog">
              每爻用浏览器加密随机数抛三枚虚拟铜钱，老阴 1/8 · 少阳 3/8 · 少阴 3/8 · 老阳 1/8。
            </dd>
          </div>
          <div>
            <dt className="text-signal">摇币起卦</dt>
            <dd className="text-fog">
              从初爻到上爻逐爻摇六次，每次停止时取三枚铜钱：正面记 3、反面记 2，合计 6 / 7 / 8 / 9。动画不影响结果。
            </dd>
          </div>
          <div>
            <dt className="text-signal">数字起卦</dt>
            <dd className="text-fog">
              上卦 = A ➗ 8 · 下卦 = B ➗ 8 · 动爻 = C ➗ 6。余数 0 取坤卦 / 上爻。两数时动爻 = (A+B) ➗ 6；单数按位自左向右切成三组（余数从左到右依次多一位）。
            </dd>
          </div>
          <div>
            <dt className="text-signal">时间起卦</dt>
            <dd className="text-fog">
              梅花式：上卦 = (农历年支数 + 月 + 日) ➗ 8；下卦 = (上式和 + 时支数) ➗ 8；动爻 = 总和 ➗ 6。年支数 子=1…亥=12，时支数同。闰月按本月数。
            </dd>
          </div>
          <div>
            <dt className="text-signal">汉字起卦</dt>
            <dd className="text-fog">
              单字按字形左右或上下拆分，第一部分笔画为上卦、第二部分笔画为下卦、总笔画定动爻。2–10 字前后分组，奇数时后组多一字，以两组笔画定上下卦、总笔画定动爻；11 字起以同样的分组字数代替笔画数。余数 0 取坤卦 / 上爻。
            </dd>
          </div>
        </dl>
      </Section>

      <Section tag="排盘规则">
        <dl className="space-y-3">
          <div>
            <dt className="text-signal">装卦</dt>
            <dd className="text-fog">
              世应按京房八宫，六亲以本宫五行为准；四柱以节气为界，晚子时日柱按次日。
            </dd>
          </div>
          <div>
            <dt className="text-signal">六神</dt>
            <dd className="text-fog">
              甲乙青龙、丙丁朱雀、戊勾陈、己腾蛇、庚辛白虎、壬癸玄武，自初爻向上排。
            </dd>
          </div>
          <div>
            <dt className="text-signal">神煞</dt>
            <dd className="text-fog">
              贵人用「庚辛逢虎马」歌；天喜按日支季节；天医取日支退一位；羊刃仅阳干；其余按日支三合推导。
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}

function Section({
  tag,
  children,
  id,
  sectionRef,
  excludeFromSnippet = false,
}: {
  tag: string
  children: React.ReactNode
  id?: string
  sectionRef?: React.Ref<HTMLElement>
  excludeFromSnippet?: boolean
}) {
  return (
    <section ref={sectionRef} id={id} data-nosnippet={excludeFromSnippet ? '' : undefined} className="panel mb-4 scroll-mt-4 p-4 sm:p-5">
      <span className="panel-tag">{tag}</span>
      {children}
    </section>
  )
}
