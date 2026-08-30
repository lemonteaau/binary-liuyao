# Cloudflare 计数接口保护

站点当前通过 Cloudflare 提供服务，但 Cloudflare 的基础 DDoS 防护不等于业务接口防刷。`POST /api/hexagram-count` 仍应单独配置速率限制。

## 已在代码中启用

- 只接受同源、`application/json` 的 POST 请求。
- 事件 ID 必须是规范的 UUID v4；重复事件只返回原序号。
- 请求体最多 512 字节。
- D1 全局熔断默认阈值：每分钟 30 个、每小时 200 个、每天 500 个新事件。
- 熔断只暂停领取新序号，起卦、排盘和本地历史仍可正常使用。

阈值可在 `wrangler.jsonc` 的 `vars` 中调整。跨域预览环境如确有需要，可添加以英文逗号分隔的 `COUNTER_ALLOWED_ORIGINS` 环境变量。

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

不建议为本站开启整站 **Under Attack Mode** 或 **Bot Fight Mode**。大量国内用户可能共用代理、VPN 或机房出口，这类整站挑战更容易造成误伤；Cloudflare 橙云自带的 DDoS 防护、现有 Medium 安全等级和上述接口级限流已经形成基础防护层。

## 更强保护（可选）

如果将来计数需要具备更强的真实性，可给“领取序号”加 Cloudflare Turnstile，并在 Pages Function 中调用 Siteverify 验证。Turnstile 必须服务端验证，令牌单次有效且五分钟过期。该方案需要先在 Cloudflare 控制台生成 sitekey 和 secret，不应把 secret 提交到 GitHub。

## 监控

- 在 **Security → Analytics** 查看该路径被限流或挑战的请求。
- 在 Workers & Pages 日志中关注 `429`、`403` 和 `503`。
- 定期检查 D1 的 `hexagram_counter_events` 增长速度；如果真实流量接近熔断阈值，再提高 `wrangler.jsonc` 中的限额。
