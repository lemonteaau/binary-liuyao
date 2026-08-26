# HEX//64

`HEX//64` 是一个完全运行在浏览器本地的六爻起卦与排盘工具。主界面使用二进制、状态翻转和终端协议语言展示；「复制完整排盘」输出传统六爻排盘，便于直接交给 AI 或六爻使用者。

## 功能

- Web Crypto 三枚铜钱模拟，概率为 `1/8 : 3/8 : 3/8 : 1/8`
- 三枚像素铜钱逐轮启停的摇币指定
- 手动指定阴阳与动爻
- 六十四卦名称/文王序号检索
- 数字起卦
- 时间起卦
- 公历、农历、四柱干支、旬空和 IANA 时区
- 纳甲、六亲、六神、世应、伏神、卦身、神煞
- Cyber 风格本卦、翻转掩码和变卦展示
- 完整纯文本传统排盘复制
- 最近 20 次结果本地存储
- 不含时间戳的 URL 状态分享
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

### 摇币指定

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

## 架构

```text
src/
├── calendar/      农历、四柱、旬空、时区
├── components/    通用 Cyber UI 组件
├── data/          八卦、纳甲、六十四卦数据
├── engine/        与 UI 无关的完整排盘引擎
├── features/      数字、时间、卦名等输入算法
├── formatters/    RAW DATA 文本输出
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
- 不包含后端 API、账号或数据库；使用自托管 Umami 进行匿名访问统计
- Umami 仅统计页面访问，并排除分享链接的 Hash 参数；不收集输入数字、卦象、排盘或剪贴板内容
- 输入数字、卦象、排盘和剪贴板内容不会上传
- 历史记录仅保存于 `localStorage`
- 分享链接只编码 `PRIMARY` 和 `MUTATION MASK`，不携带时间戳
- 分享链接打开时，历法数据按查看者当地时间重新计算

## 历法与规则

农历、节气四柱和旬空由纯客户端库 `lunar-typescript` 提供。晚子时采用 `sect=1`，即 23:00 后日柱按次日计算。

神煞规则存在流派差异。本项目按 PRD 样本锁定流派：贵人使用“庚辛逢虎马”版本，天喜按日支季节，天医按日支退一位，羊刃仅计算阳干。规则集中在 `src/engine/shensha.ts`，可独立替换。
