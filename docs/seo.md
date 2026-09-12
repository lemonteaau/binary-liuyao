# SEO 维护

本次优化只修改文档元信息、JSON-LD 和搜索摘要标记，不改变页面文案、样式、起卦算法、Hash 路由或分享参数。

## 已实现

- `index.html` 直接提供首页标题、描述、canonical、Open Graph、Twitter 卡片及 JSON-LD；无需执行 JavaScript 即可读取这些信息。
- `src/lib/seo.ts` 管理现有路由的标题与描述，导航时同步更新普通描述、Open Graph 和 Twitter 元信息。首页静态元信息与运行时值由测试校验一致。
- JSON-LD 通过稳定的实体 ID 关联 WebSite、WebPage、WebApplication 和实际分享图片；不添加虚构评分、评论或搜索功能。
- 实时时钟、累计起卦数、打赏与反馈表单使用 `data-nosnippet`，只控制搜索摘要的选材，不隐藏页面内容，也不影响点击、复制或表单提交。
- `tests/seo.test.tsx` 检查静态元信息、站点地图与 canonical 一致性、JSON-LD 引用与图片尺寸，以及导航恢复和分享参数不进入元信息。

## Hash 路由边界

目前所有页面仍使用 `#/...`。片段不会随 HTTP 请求发送，搜索引擎通常不会将这些视图作为独立 URL 收录。因此：

- canonical 和 `og:url` 保持为 `https://liuyao.lemontea.xyz/`，不包含片段或查询参数。
- sitemap 只列真实可抓取的首页，不能添加 `/#/about`、`/#/ai-guide` 或个人排盘链接。
- 不按 Hash 切换全局 `noindex`，避免影响共用的首页文档。
- 不执行 JavaScript 的分享抓取器仍读取首页卡片；客户端同步元信息不等同于独立页面服务端分享卡片。
- 当前没有预渲染正文，正文抓取仍依赖搜索引擎执行 JavaScript。若以后需要让教程、关于页独立收录，应另行实现真实路径、静态生成或服务端渲染，并验证旧 Hash 分享链接兼容。

## 发布后验证

运行 `npm run build`、`npm run lint` 和 `npm test`。部署后检查线上首页、`robots.txt`、`sitemap.xml` 和 `og-liuyao.png`，再使用 Search Console URL 检查和富媒体搜索结果测试验证线上版本。本次代码变更不包含生产部署、索引提交或排名保证。

## 依据

- [Google JavaScript SEO 基础](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [规范网址与重复页面](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [data-nosnippet 与 robots 规则](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
