# HEX//64

`HEX//64` 是一款运行在浏览器本地的六爻起卦与排盘工具，支持多种起卦方式、完整传统排盘以及适合交给 AI 解读的文本输出。

## 支持作者

如果 HEX//64 刚好帮到了你，可以酌情打赏，支持后续维护，工具将持续保持免费。

<p>微信赞赏</p>
<a href="public/support/wechat.jpg"><img src="public/support/wechat.jpg" alt="微信赞赏码" width="288" /></a>

<p>支付宝</p>
<a href="public/support/alipay.jpg"><img src="public/support/alipay.jpg" alt="支付宝赞赏码" width="288" /></a>

## 本地运行

```bash
npm install
npm run dev       # 开发
npm run build
npm run preview   # 预览生产构建
npm run typecheck # 类型检查
npm run lint      # 代码检查
npm test          # 测试
```

## 核心规范

- `bit 0` 与内部整数最低位均代表初爻
- 二进制显示串按 `L6 L5 L4 L3 L2 L1` 输出
- `1 = 阳`，`0 = 阴`
- `RESULT = PRIMARY XOR MUTATION_MASK`
- 原始爻值保留 `6 | 7 | 8 | 9`

## 输入规则

| 方式 | 规则 |
| --- | --- |
| 电脑 / 摇币 | 使用 `crypto.getRandomValues()` 模拟三枚铜钱；6、7、8、9 的概率为 `1/8 : 3/8 : 3/8 : 1/8` |
| 数字 | 三数分别定上卦、下卦、动爻；两数以和定动爻；单数按位分为三组 |
| 时间 | 农历年支、月、日定上卦，加时支定下卦与动爻 |
| 汉字 | 单字按部件笔画，多字按前后分组；11 字起改用字数 |

取模余数为 `0` 时，卦取坤、动爻取上爻。汉字笔画与结构由 `cnchar` 和 CCD 数据在本地计算。

## 目录

```text
src/
├── calendar/      农历、四柱、旬空、时区
├── components/    通用 UI 组件
├── data/          八卦、纳甲、六十四卦数据
├── engine/        与 UI 无关的完整排盘引擎
├── features/      数字、时间、汉字、卦名等输入算法
├── formatters/    RAW DATA 文本输出
├── cloudflare/    邮件通知 Worker
├── functions/     计数与反馈接口
├── pages/         Generator / Result / Settings / About
├── store/         设置、当前结果和本地历史
└── types/         类型定义
```

## 隐私与分享

- 起卦输入、排盘与历史记录只保存在浏览器本地
- D1 仅接收领取全局序号所需的随机事件 ID，以及用户主动提交的反馈
- 自托管 Umami 只记录匿名页面访问，不采集卦象、输入或剪贴板内容
- 页面使用普通路径；分享数据保存在 URL Hash 中，不会随页面请求发送；旧版 Hash 页面和分享链接仍可打开
- 构建自动生成教程、关于页的静态 HTML；部署仍使用 `dist`，详见 [SEO 与路由维护](docs/seo.md)

## Cloudflare 接口安全

接口包含同源校验、请求体限制、UUID 去重和 D1 熔断；生产环境还应配置 WAF 速率限制，详见 [Cloudflare 接口保护](docs/cloudflare-security.md)。部署前执行：

```bash
npx wrangler d1 migrations apply hex64-counter --remote
```

## 历法与规则

- 农历、节气四柱和旬空由 `lunar-typescript` 提供；23:00 后日柱按次日计算
- 神煞按项目既定流派计算，规则集中在 `src/engine/shensha.ts`

## 参考与鸣谢

- [likeSo/liu-yao](https://github.com/likeSo/liu-yao)：起卦入口与汉字分段规则参考
- [theajack/cnchar](https://github.com/theajack/cnchar)：汉字笔画与结构数据
- [leonsilicon/chinese-characters-decomposition](https://github.com/leonsilicon/chinese-characters-decomposition)：汉字部件拆分数据
- [6tail/lunar-typescript](https://github.com/6tail/lunar-typescript)：农历、节气与干支历法

## 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
