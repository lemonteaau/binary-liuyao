import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FeedbackForm } from '@/components/FeedbackForm'

export function AboutPage() {
  const [searchParams] = useSearchParams()
  const feedbackSectionRef = useRef<HTMLElement>(null)
  const shouldFocusFeedback = searchParams.get('feedback') === '1'

  useEffect(() => {
    if (!shouldFocusFeedback) return
    const frame = window.requestAnimationFrame(() => {
      feedbackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [shouldFocusFeedback])

  return (
    <div className="pt-6 text-base leading-relaxed">
      <h1 className="mb-6 text-2xl font-bold tracking-[0.2em]">关于 HEX//64</h1>

      <Section tag="反馈" id="feedback" sectionRef={feedbackSectionRef}>
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
          所有排盘计算均在浏览器本地完成。本应用不会将起卦内容、输入数字、汉字或卦象上传至任何服务器；
          仅使用自托管 Umami 进行匿名访问统计，且不统计分享链接中的片段参数。
        </p>
      </Section>

      <Section tag="再次访问">
        <div className="bookmark-help">
          <h2 className="text-lg font-bold tracking-[0.16em] text-ink">把本站留在手边</h2>
          <p className="mt-2 text-fog">
            桌面浏览器可按 <kbd>⌘ D</kbd>（macOS）或 <kbd>Ctrl D</kbd>（Windows / Linux）加入书签。
            快捷键可能因浏览器设置而不同。
          </p>
          <p className="mt-2 text-fog">
            在手机上，可从浏览器的分享或菜单中选择“添加书签”或“添加到主屏幕”。
          </p>
        </div>
      </Section>

      <Section tag="输入算法">
        <dl className="space-y-3">
          <div>
            <dt className="text-signal">电脑起卦</dt>
            <dd className="text-fog">
              每爻通过 <code>crypto.getRandomValues()</code> 生成三枚虚拟铜钱，自然得到
              老阴 1/8 · 少阳 3/8 · 少阴 3/8 · 老阳 1/8 的概率。核心随机逻辑不使用 Math.random()。
            </dd>
          </div>
          <div>
            <dt className="text-signal">摇币起卦</dt>
            <dd className="text-fog">
              用户逐轮开始并停止三枚铜钱，从初爻到上爻累计六次。停止瞬间使用 Web Crypto
              采样；正面记 3、反面记 2，合计 6 / 7 / 8 / 9。动画只表现摇动过程，不参与随机计算。
            </dd>
          </div>
          <div>
            <dt className="text-signal">数字起卦</dt>
            <dd className="text-fog">
              上卦 = A mod 8 · 下卦 = B mod 8 · 动爻 = C mod 6。余数 0 取坤卦 / 上爻。
              两数时动爻 = (A+B) mod 6；单数按位自左向右切成三组（余数从左到右依次多一位）。
            </dd>
          </div>
          <div>
            <dt className="text-signal">时间起卦</dt>
            <dd className="text-fog">
              梅花式：上卦 = (农历年支数 + 月 + 日) mod 8；下卦 = (上式和 + 时支数) mod 8；
              动爻 = 总和 mod 6。年支数 子=1…亥=12，时支数同。闰月按本月数。
            </dd>
          </div>
          <div>
            <dt className="text-signal">汉字起卦</dt>
            <dd className="text-fog">
              单字按字形左右或上下拆分，第一部分笔画为上卦、第二部分笔画为下卦、总笔画定动爻。
              2–10 字前后分组，奇数时后组多一字，以两组笔画定上下卦、总笔画定动爻；
              11 字起以同样的分组字数代替笔画数。余数 0 取坤卦 / 上爻。
            </dd>
          </div>
        </dl>
      </Section>

      <Section tag="排盘引擎">
        <p className="text-fog">
          排盘引擎完整计算并输出：公历 / 农历 / 四柱干支（节气为界，晚子时日柱按次日）/
          旬空 / 纳甲 / 六亲（以本宫五行为准）/ 六神（按日干）/ 世应（京房八宫）/ 伏神 /
          卦身 / 神煞。全部结果包含在「复制排盘」文本中，可直接交给 AI 或六爻使用者解读。
        </p>
      </Section>

      <Section tag="六神与神煞流派">
        <p className="text-fog">
          六神起法：甲乙青龙、丙丁朱雀、戊勾陈、己腾蛇、庚辛白虎、壬癸玄武，自初爻向上排。
          神煞为可插拔规则表：贵人用「庚辛逢虎马」歌；天喜按日支季节；
          天医取日支退一位；羊刃仅阳干。其余按日支三合组推导。流派差异在传统实践中真实存在，
          如需其他流派可在规则表中增删。
        </p>
      </Section>

      <Section tag="分享链接">
        <p className="text-fog">
          分享链接会在 URL Hash 中保存卦象、原起卦时间、时区、起卦方式与排盘编号，打开后可还原本次排盘；
          Hash 不会随页面请求发送至服务器。旧版分享链接仍可打开，其历法信息会按查看者本地时刻计算。
        </p>
      </Section>
    </div>
  )
}

function Section({
  tag,
  children,
  id,
  sectionRef,
}: {
  tag: string
  children: React.ReactNode
  id?: string
  sectionRef?: React.Ref<HTMLElement>
}) {
  return (
    <section ref={sectionRef} id={id} className="panel mb-4 scroll-mt-4 p-4 sm:p-5">
      <span className="panel-tag">{tag}</span>
      {children}
    </section>
  )
}
