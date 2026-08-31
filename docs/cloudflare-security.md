# Cloudflare 接口保护

站点当前通过 Cloudflare 提供服务，但 Cloudflare 的基础 DDoS 防护不等于业务接口防刷。`POST /api/hexagram-count` 与 `POST /api/feedback` 仍应分别配置速率限制。

## 已在代码中启用

- 只接受同源、`application/json` 的 POST 请求。
- 事件 ID 必须是规范的 UUID v4；重复事件只返回原序号。
- 请求体最多 512 字节。
- D1 全局熔断默认阈值：每分钟 30 个、每小时 200 个、每天 500 个新事件。
- 熔断只暂停领取新序号，起卦、排盘和本地历史仍可正常使用。
- 反馈接口只接受同源 JSON，正文限制为 2–1200 字符，请求体最多 8 KiB。
- 反馈提交 ID 必须是规范 UUID v4；重试同一提交不会重复写入。
- 反馈不保存 IP、User-Agent、卦象或历史记录，只保存正文、入口来源与提交时间。
- 反馈 D1 全局熔断默认阈值：每分钟 15 条、每小时 100 条、每天 500 条。
- D1 写入成功后，Pages Function 通过 Service Binding 调用私有邮件 Worker；邮件失败只写日志，不影响反馈提交结果。
- 邮件 Worker 的 `workers.dev` 与 Preview URL 均关闭，收件人与发件人地址只保存在其服务端绑定中。

阈值可在 `wrangler.jsonc` 的 `vars` 中调整。跨域预览环境如确有需要，可添加以英文逗号分隔的 `COUNTER_ALLOWED_ORIGINS` / `FEEDBACK_ALLOWED_ORIGINS` 环境变量。

## Cloudflare 控制台配置

以下规则已于 2026-08-31 通过 Cloudflare API 启用。

在域名 `liuyao.lemontea.xyz` 所属站点中进入 **Security → WAF → Rate limiting rules**，新建规则：

| 项目 | 值 |
| --- | --- |
| 规则名 | `protect-hexagram-counter` |
| 条件 | URI Path equals `/api/hexagram-count` |
| 统计维度 | IP |
| 阈值 | 10 秒内 20 次 |
| 动作 | Block |
| 持续时间 | 10 秒 |

这是 Cloudflare Free 套餐也能配置的规则。规则仅统计 POST，不影响页面、静态资源或读取当前计数的 GET。20 次/10 秒的阈值远高于正常用户操作频率，给多人共用代理/机房出口留出余量；触发后也只暂停该接口 10 秒，网页和本地排盘继续可用。

反馈接口再建一条独立规则（上线反馈功能前完成）：

| 项目 | 值 |
| --- | --- |
| 规则名 | `protect-feedback` |
| 条件 | URI Path equals `/api/feedback` 且 Method equals `POST` |
| 统计维度 | IP |
| 阈值 | 1 分钟内 5 次 |
| 动作 | Block |
| 持续时间 | 1 分钟 |

正常用户很少会在一分钟内连续提交五条反馈；该阈值仍允许失败重试，同时把单一来源的灌水挡在 D1 之前。

不建议为本站开启整站 **Under Attack Mode** 或 **Bot Fight Mode**。大量国内用户可能共用代理、VPN 或机房出口，这类整站挑战更容易造成误伤；Cloudflare 橙云自带的 DDoS 防护、现有 Medium 安全等级和上述接口级限流已经形成基础防护层。

## 更强保护（可选）

如果将来计数需要具备更强的真实性，可给“领取序号”加 Cloudflare Turnstile，并在 Pages Function 中调用 Siteverify 验证。Turnstile 必须服务端验证，令牌单次有效且五分钟过期。该方案需要先在 Cloudflare 控制台生成 sitekey 和 secret，不应把 secret 提交到 GitHub。

## 监控

- 在 **Security → Analytics** 查看该路径被限流或挑战的请求。
- 在 Workers & Pages 日志中关注 `429`、`403` 和 `503`。
- 定期检查 D1 的 `hexagram_counter_events` 增长速度；如果真实流量接近熔断阈值，再提高 `wrangler.jsonc` 中的限额。
- 在 D1 中按 `created_at DESC` 读取 `feedback_submissions`；不要把该表做成公开 GET 接口。

## 免费额度判断

反馈复用现有 Pages Function 与 D1，不需要新增付费产品。按 Cloudflare 2026-08-31 公布的 Free 额度，Pages Functions/Workers 共有每天 100,000 次动态请求；D1 每天包含 5,000,000 行读取、100,000 行写入，并有 5 GB 总存储。以当前每天最多 500 条反馈的代码熔断值计算，正常小型站点会远低于这些额度。免费额度耗尽时 D1 查询会失败，因此前端保留原文并提示稍后重试。

- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Pages Functions Pricing](https://developers.cloudflare.com/pages/functions/pricing/)

发送至 Cloudflare Email Routing 中已验证的目的地址不计入邮件发送配额，在 Workers Free 方案也可免费使用。本站使用独立子域 `feedback-mail.lemontea.xyz`，不会改动根域已有的邮件 MX。

- [Cloudflare Email Service Pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
