# HEX//64

`HEX//64` 是一个完全运行在浏览器本地的六爻起卦与排盘工具。界面保留二进制编码和终端视觉语言，同时统一采用本卦、动爻、变卦等六爻常用名称；「复制排盘」输出传统六爻排盘，便于直接交给 AI 或六爻使用者。

## 功能

- Web Crypto 三枚铜钱模拟，概率为 `1/8 : 3/8 : 3/8 : 1/8`
- 三枚像素铜钱逐轮启停的摇币起卦
- 手动设置阴阳与动爻
- 六十四卦名称/文王序号检索
- 数字起卦
- 时间起卦
- 汉字起卦（繁简笔画、单字结构拆分）
- 公历、农历、四柱干支、旬空和 IANA 时区
- 纳甲、六亲、六神、世应、伏神、卦身、神煞
- Cyber 风格本卦、动爻标记和变卦展示
- 完整纯文本传统排盘复制
- 最近 20 次结果本地存储
- 从历史基数 166 开始的全局起卦计数
- 关于页常驻匿名反馈栏，以及累计前台使用 8 分钟后出现一次的温和反馈邀请
- 反馈写入 D1 后通过私有 Cloudflare Worker 异步发送邮件提醒
- 保留起卦时间、时区、起卦方式与排盘编号的 URL 卦象分享
- Mobile-first、键盘可操作、Reduced Motion 支持

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

质量检查：

```bash
npm run typecheck
npm run lint
npm test
```

## 核心规范

- `bit 0 = 初爻`
- 内部整数最低位代表最下方一爻
- 二进制显示串按 `L6 L5 L4 L3 L2 L1` 输出
- `1 = 阳`，`0 = 阴`
- `RESULT = PRIMARY XOR MUTATION_MASK`
- 原始爻值保留 `6 | 7 | 8 | 9`

## 输入规则

### Entropy

每爻通过 `crypto.getRandomValues()` 生成三枚虚拟铜钱：

- 老阴 6：`1/8`
- 少阳 7：`3/8`
- 少阴 8：`3/8`
- 老阳 9：`1/8`

核心随机逻辑不使用 `Math.random()`。

### 摇币起卦

- 三枚铜钱初始静止，用户点击开始摇动，再点击停止并记录本轮
- 六轮按 `初爻 → 二爻 → 三爻 → 四爻 → 五爻 → 上爻` 依次完成
- 正面记 `3`，反面记 `2`，三枚相加得到原始爻值 `6 | 7 | 8 | 9`
- 停止瞬间使用 `crypto.getRandomValues()` 采样，动画帧和停止时长不参与随机计算

### 数字起卦

- 三个数：`上卦 = A mod 8`，`下卦 = B mod 8`，`动爻 = C mod 6`
- 两个数：动爻使用 `(A + B) mod 6`
- 一个数：数字位从左向右切为三组，余数位依次分给左侧分组
- 余数 `0`：卦取坤，动爻取上爻

### 时间起卦

- 上卦：`农历年支数 + 农历月 + 农历日`，取模 8
- 下卦：上式再加时支数，取模 8
- 动爻：总和取模 6
- 年支和时支按 `子=1 ... 亥=12`
- 闰月按该月月数处理

### 汉字起卦

- 单个汉字：左部或上部笔画数取上卦，右部或下部笔画数取下卦，总笔画数取动爻
- `2–10` 个汉字：前后分为两组；奇数时前组少一字、后组多一字，偶数时均分
- `2–10` 个汉字的两组总笔画数分别取上下卦，全部总笔画数取动爻
- `11` 个汉字及以上：分组方式不变，以两组字数及总字数代替笔画数
- 余数 `0`：卦取坤，动爻取上爻；空格会忽略，其他非汉字字符会提示修正
- 繁简笔画与部首由 `cnchar` 计算；单字部件方向由 CCD 汉字结构数据校正，全部在浏览器本地完成

## 架构

```text
src/
├── calendar/      农历、四柱、旬空、时区
├── components/    通用 Cyber UI 组件
├── data/          八卦、纳甲、六十四卦数据
├── engine/        与 UI 无关的完整排盘引擎
├── features/      数字、时间、汉字、卦名等输入算法
├── formatters/    RAW DATA 文本输出
├── cloudflare/    仅供 Service Binding 调用的邮件通知 Worker
├── functions/     Cloudflare Pages 计数与匿名反馈接口
├── pages/         Generator / Result / Settings / About
├── store/         设置、当前结果和本地历史
└── types/         领域模型
```

核心入口：

```ts
const chart = generateChart({
  inputMethod: 'manual',
  rawLines: [6, 9, 8, 8, 7, 8],
  when: new Date(),
  timezone: 'Asia/Shanghai',
})
```

## 隐私与分享

- 所有计算均在浏览器本地完成
- 新生成的卦仅向 Cloudflare D1 发送一个随机事件 ID，用于领取全局序号；不发送起卦输入或排盘内容
- 只有用户主动发送的反馈文字会写入 Cloudflare D1；仅一并保存随机提交 ID、入口来源和提交时间，不保存 IP、UA、卦象或本地历史
- 通知收件地址仅配置在 Cloudflare Worker 服务端绑定中，不写入仓库、前端资源或公开 API
- 不包含账号系统；除匿名计数外，使用自托管 Umami 进行匿名访问统计
- Umami 仅统计页面访问，并排除分享链接的 Hash 参数；不收集输入数字、汉字、卦象、排盘或剪贴板内容
- 输入数字、汉字、卦象、排盘和剪贴板内容不会上传
- 历史记录仅保存于 `localStorage`
- 反馈邀请的累计前台使用时长、关闭状态和已提交状态仅保存于 `localStorage`；关闭后 30 天内不再出现，提交后不再出现
- 分享链接在 URL Hash 中编码卦象、原起卦时间、时区、起卦方式与排盘编号；Hash 不会随页面请求发送至服务器
- 旧版仅含 `PRIMARY` 和 `MUTATION MASK` 的链接仍可打开，其历法数据会按查看者当地时间计算

## Cloudflare 接口安全

计数与反馈接口仅接收同源 JSON 请求，并带有请求体限制、UUID v4 幂等去重和 D1 全局熔断。反馈正文限制为 2–1200 字符。生产环境还应在 Cloudflare WAF 中分别对 `/api/hexagram-count` 和 `/api/feedback` 启用按 IP 的速率限制；具体配置见 [Cloudflare 接口保护](docs/cloudflare-security.md)。

反馈表使用现有的 Pages Function 与 `hex64-counter` D1 数据库。部署前需应用新增迁移：

```bash
npx wrangler d1 migrations apply hex64-counter --remote
```

## 历法与规则

农历、节气四柱和旬空由纯客户端库 `lunar-typescript` 提供。晚子时采用 `sect=1`，即 23:00 后日柱按次日计算。

神煞规则存在流派差异。本项目按 PRD 样本锁定流派：贵人使用“庚辛逢虎马”版本，天喜按日支季节，天医按日支退一位，羊刃仅计算阳干。规则集中在 `src/engine/shensha.ts`，可独立替换。

## 参考与鸣谢

- [likeSo/liu-yao](https://github.com/likeSo/liu-yao)：汉字、数字、时间与铜钱等起卦入口及汉字分段规则的功能参考。本项目根据自身数据模型独立实现，并补充了单字部件方向校正、输入校验和测试。
- [theajack/cnchar](https://github.com/theajack/cnchar)：提供繁简汉字笔画、部首和字形结构信息，采用 MIT License。
- [leonsilicon/chinese-characters-decomposition](https://github.com/leonsilicon/chinese-characters-decomposition)：提供 CCD 汉字顶层部件拆分数据，用于区分单字的左/右或上/下部分；代码包采用 MIT License，底层数据来源与条款见其项目说明。
- [6tail/lunar-typescript](https://github.com/6tail/lunar-typescript)：提供农历、节气与干支历法计算，采用 MIT License。

## 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
