export const CANONICAL_URL = 'https://liuyao.lemontea.xyz/'
export const PUBLIC_ROUTES = ['/', '/ai-guide', '/about'] as const
export const APP_ROUTES = [...PUBLIC_ROUTES, '/settings', '/result', '/history'] as const

export function normalizePagePath(pathname: string): string {
  return pathname.replace(/\/+$/, '').toLowerCase() || '/'
}

export function canonicalUrl(pathname: string): string {
  const path = normalizePagePath(pathname)
  return new URL(APP_ROUTES.some((route) => route === path) ? path.slice(1) : '', CANONICAL_URL).href
}

export function robotsContent(pathname: string): string {
  return PUBLIC_ROUTES.some((route) => route === normalizePagePath(pathname))
    ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
    : 'noindex,follow'
}

const DEFAULT_DESCRIPTION =
  'HEX//64 免费在线六爻排盘：支持摇币、电脑、手动、卦名、数字、时间、汉字七种起卦方式，自动纳甲装卦，排出六亲、六神、世应、伏神、卦身、旬空、神煞与四柱，附周易卦辞爻辞。开源无广告，无需下载注册，手机电脑打开即用；排盘在浏览器本地计算，可复制排盘文本或生成分享图交给 AI 解卦。'

export function routeMetadata(pathname: string): { title: string; description: string } {
  switch (normalizePagePath(pathname)) {
    case '/result':
      return {
        title: '六爻排盘结果 - HEX//64',
        description: '查看 HEX//64 生成的六爻排盘结果，包括本卦、动爻、变卦、周易卦辞爻辞、纳甲、六亲、六神、世应、伏神、卦身、神煞与四柱。',
      }
    case '/settings':
      return {
        title: '设置 - HEX//64 六爻排盘',
        description: '设置 HEX//64 六爻排盘的时区、字号、动效与排盘复制选项。',
      }
    case '/history':
      return {
        title: '历史排盘 - HEX//64 六爻排盘',
        description: '查看保存在本机浏览器中的六爻排盘记录、所问之事与应验备注，并可导出或导入备份。',
      }
    case '/ai-guide':
      return {
        title: '用 AI 解读六爻排盘 - HEX//64 教程',
        description: '图文教程：在 ChatGPT 安装八讲六爻解读 Skill，把 HEX//64 生成的完整排盘交给 AI 分析。',
      }
    case '/about':
      return {
        title: '关于 - HEX//64 六爻排盘',
        description: '了解 HEX//64 在线六爻排盘的起卦算法与排盘规则：免费开源、无广告、无需注册，排盘在浏览器本地计算；MIT 许可，可自行部署。',
      }
    default:
      return {
        title: '六爻排盘｜免费在线起卦、纳甲装卦，开源无广告 - HEX//64',
        description: DEFAULT_DESCRIPTION,
      }
  }
}

/** Update only the document head; never include reading inputs or URL parameters. */
export function updatePageMetadata(pathname: string, document: Document = window.document): void {
  const metadata = routeMetadata(pathname)
  document.title = metadata.title

  const tags: Record<string, string> = {
    'meta[name="description"]': metadata.description,
    'meta[name="robots"]': robotsContent(pathname),
    'meta[property="og:url"]': canonicalUrl(pathname),
    'meta[property="og:title"]': metadata.title,
    'meta[property="og:description"]': metadata.description,
    'meta[name="twitter:title"]': metadata.title,
    'meta[name="twitter:description"]': metadata.description,
  }

  for (const [selector, content] of Object.entries(tags)) {
    document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
  }

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"], link[rel="alternate"][hreflang]')) {
    link.setAttribute('href', canonicalUrl(pathname))
  }

  const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
  if (script?.textContent) {
    const schema = JSON.parse(script.textContent)
    // Keep the homepage/app graph stable and replace only the active subpage.
    schema['@graph'] = schema['@graph'].filter((node: Record<string, unknown>) =>
      node['@type'] !== 'AboutPage' &&
      (node['@type'] !== 'WebPage' || node['@id'] === `${CANONICAL_URL}#webpage`),
    )
    const canonical = canonicalUrl(pathname)
    if (canonical !== CANONICAL_URL) {
      schema['@graph'].push({
        '@type': normalizePagePath(pathname) === '/about' ? 'AboutPage' : 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: metadata.title,
        description: metadata.description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${CANONICAL_URL}#website` },
        about: { '@id': `${CANONICAL_URL}#app` },
        primaryImageOfPage: { '@id': `${CANONICAL_URL}#primaryimage` },
      })
    }
    script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c')
  }
}
