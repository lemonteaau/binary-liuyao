export function AboutPage() {
  return (
    <div className="max-w-3xl pt-6 text-base leading-relaxed">
      <p className="mb-1 text-[0.875rem] tracking-[0.24em] text-fog">协议 / 方法</p>
      <h1 className="mb-6 text-2xl font-bold tracking-[0.2em]">关于 HEX//64</h1>

      <Section tag="产品说明">
        <p>
          HEX//64 将六个二进制爻位映射到传统易经六十四卦结构。Cyber 界面之下运行一套完整的
          六爻排盘引擎；主界面只隐藏了大部分传统术语，并未删减底层数据。
        </p>
        <p className="mt-2">
          所有排盘计算均在浏览器本地完成。本应用不会将起卦内容、输入数字或卦象上传至任何服务器；
          无账号、无数据库，仅使用自托管 Umami 进行匿名访问统计，且不统计分享链接中的片段参数。
        </p>
      </Section>

      <Section tag="二进制模型">
        <pre className="overflow-x-auto border border-edge bg-void p-3 text-[0.9375rem] leading-relaxed">{`初始状态：6 bit，1 = 阳，0 = 阴    例如 010010（坎为水）
翻转掩码：1 = 动爻                  例如 000011
转换结果 = 初始状态 XOR 翻转掩码    →   010001（水雷屯）

位序（固定）：bit 0 = 初爻
显示顺序：L6 L5 L4 L3 L2 L1（MSB 在前）。`}</pre>
      </Section>

      <Section tag="输入算法">
        <dl className="space-y-3">
          <div>
            <dt className="text-signal">随机熵源</dt>
            <dd className="text-fog">
              每爻通过 <code>crypto.getRandomValues()</code> 生成三枚虚拟铜钱，自然得到
              老阴 1/8 · 少阳 3/8 · 少阴 3/8 · 老阳 1/8 的概率。核心随机逻辑不使用 Math.random()。
            </dd>
          </div>
          <div>
            <dt className="text-signal">摇币指定</dt>
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
          「复制链接」仅编码初始状态与翻转掩码（#/result?s=&m=），不携带时间戳。
          打开链接时的历法信息按查看者本地时刻重新采样。若需分享精确起卦时间，请使用「复制排盘」。
        </p>
      </Section>
    </div>
  )
}

function Section({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <section className="panel mb-4 p-4 sm:p-5">
      <span className="panel-tag">{tag}</span>
      {children}
    </section>
  )
}
