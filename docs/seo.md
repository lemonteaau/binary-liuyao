# SEO 与路由维护

页面使用 BrowserRouter。首页、教程和关于页可通过真实路径访问；排盘数据仍只放在 URL 片段中，不随页面请求发送。

## 地址与兼容

| 用途 | 现在的地址 | 兼容的旧地址 |
| --- | --- | --- |
| 起卦 | `/` | `/#/` |
| AI 教程 | `/ai-guide` | `/#/ai-guide` |
| 关于 | `/about` | `/#/about` |
| 设置 | `/settings` | `/#/settings` |
| 排盘分享 | `/result#v=2&s=…&m=…` | `/#/result?v=2&s=…&m=…`、旧版只有 s/m 的链接 |
| 打赏／反馈定位 | `/about?support=1`、`/about?feedback=1` | 对应的旧 Hash 入口 |

`src/lib/routing.ts` 在 React 启动前使用 history.replaceState 转换旧入口，不新增历史项、不重新请求带排盘数据的地址。运行中打开旧片段链接由 LegacyRouteRedirect 处理。分享的时间、时区、方式、编号、序号与 v1/v2 参数解析规则保留；localStorage 的键和数据格式不变。新链接供新版本使用，已发出的旧链接可以继续打开。

## 构建和部署

仍执行 `npm run build`，仍部署 `dist`。原来的 Cloudflare Pages Functions、D1 迁移、服务绑定、环境变量和统计代理无需更改；无需新增生产服务，也无需浏览器下载。

构建末尾的 `scripts/prerender.mjs` 复用现有 React 页面生成：

- `index.html`：首页现有的七种起卦方式、简短说明和可抓取导航链接。
- `about.html`、`ai-guide.html`：独立元信息及真实页面正文。
- `settings.html`、`result.html`：独立元信息与 noindex；用户设置和排盘仍在浏览器初始化，不写入静态 HTML。

三个公开页都将真实页面内容写入 `#root`，不再依赖 `noscript` 介绍，也不向爬虫提供单独的文案版本。功能说明与本地计算说明仍位于关于页，教程仍位于 AI 教程页；首页静态导航直接链接到这两个页面。

客户端继续使用原有 createRoot 启动流程，按用户设置、启动动画和本地历史初始化，不使用静态默认值覆盖用户存储。启用 JavaScript 时，在首次 React 提交前暂缓显示预渲染容器，避免默认首页先闪现再播放启动动画或切换字号；客户端在 layout effect 中恢复显示。禁用 JavaScript 时静态页面直接可见；应用脚本加载失败时，4 秒后恢复静态内容，导航仍可访问，起卦交互需要 JavaScript。所有访问者使用同一份 HTML，不根据 User-Agent 区分内容。

静态时钟使用占位符，不输出构建时间或构建机时区。设置页和排盘页继续只提供元信息，不预渲染用户设置、历史或排盘数据。

Cloudflare Pages 将 `/about` 匹配到 `about.html`，并将 `/about.html` 规范化为 `/about`。不增加顶层 404.html 或全局重写，保留既有 SPA 回退和 `/api/*`、`/x/*` Functions。资源基路径默认 `/`，避免深层路径刷新时误请求 `/about/assets/...`。

自行托管时，服务器需要支持 `.html` 无扩展名匹配或 SPA 回退；子目录部署需同时设置 Vite base 与服务器的挂载路径。不要直接把新版本复制到不支持路径回退的文件服务器后假定所有无扩展名地址可用。

## 搜索元信息

- 首页、教程、关于页各有 canonical、Open Graph URL、标题、描述和 JSON-LD；运行时和构建时共用 src/lib/seo.ts。
- sitemap 只列 `/`、`/ai-guide`、`/about`。设置、结果和未知路径使用 noindex,follow。
- 查询参数和分享片段不进入 canonical、结构化数据或统计 URL。统计过滤器继续兼容旧 Hash 和新路径。
- 时钟、累计起卦数、打赏和反馈区保留 data-nosnippet，不影响可见内容或交互。

## 验证

```bash
npm run build
npm run lint
npm test
```

首页预渲染回归使用 `scripts/test-prerender-browser.py --url <新版本本地预览地址> --baseline <改动前本地预览地址>`，需要 Python Playwright 和 Pillow。两个地址均使用生产构建的 Vite preview，接口和统计请求由测试模拟。

本地验证（2026-09-16）：生产构建、Lint、190 项测试通过。Chromium 禁用 JavaScript 时可读取首页七种起卦方式并访问关于／教程页；三个公开页在 1280×900、390×844 下与本次预渲染改动前的截图完全一致（保留此前已确认的 SEO 文案）。七种方式按钮可交互，已保存的大字号设置保持不变；延迟脚本时无默认页面闪现，启动动画正常；阻断应用脚本后可恢复静态正文与导航。此次未部署，也未验证线上重新抓取、收录或推荐排名。

浏览器回归需 Python Playwright。先在项目目录启动本地 Pages，再运行：

```bash
npx wrangler pages dev dist --ip 127.0.0.1 --port 42713
python3 scripts/test-routing-browser.py --url http://127.0.0.1:42713
```

本地模拟 D1 需要先应用现有迁移，且与 pages dev 使用同一 persist-to 目录。测试只对真实本地接口发起只读请求；浏览器内的计数、反馈写入与统计请求均模拟，不发送真实反馈。可用 `--browser webkit` 检查 WebKit。若本机 WebKit 无法直接连接回环地址，可加 `--proxy-local-requests`，由 Playwright 转发本地请求；WebKit 导出测试截获系统分享交接并验证实际生成的 PNG，不打开系统分享面板。用 `--baseline http://127.0.0.1:4174` 对照旧版预览的桌面和手机截图（需要 Pillow）。

本次本地验证（2026-09-12）：生产构建、Lint、188 项测试通过；Chromium 完成七种起卦、旧／新分享恢复、刷新、修改、复制与 PNG 下载。五个页面在 1280×900、390×844 下与迁移前截图完全一致。WebKit 在手机尺寸下通过同样的路由、起卦与图片生成检查；因本机 WebKit 原生回环连接对新旧版本均超时，使用本地请求转发，系统分享交接用模拟器捕获并校验真实 PNG，未验证真实系统分享面板。

已只读核对线上 Pages 项目：构建命令为 `npm run build`，输出 `dist`，生产分支 `main`，无需修改部署配置。

发布后再用 Search Console 检查公开页面及 sitemap。本次迁移本身不保证收录时间或排名。

## 依据

- [Google JavaScript SEO 基础](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Cloudflare Pages 路由与 SPA 回退](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare Pages Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)
