import { describe, expect, it } from 'vitest'
import { renderPublicPage } from '../src/prerender'

describe('public HTML without a browser', () => {
  it('exposes all seven real homepage modes and crawlable public links', () => {
    const html = renderPublicPage('/')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(7)
    for (const mode of ['摇币起卦', '电脑起卦', '手动排卦', '卦名起卦', '数字起卦', '时间起卦', '汉字起卦']) {
      expect(html).toContain(mode)
    }
    expect(html).toMatch(/<h1[^>]*>六爻排盘<\/h1>/)
    for (const href of ['/about', '/ai-guide', '/gua']) {
      expect(html).toContain(`href="${href}"`)
    }
    expect(html).not.toContain('系统正在启动，跳过启动动画')
    expect(html).toMatch(/<h2[^>]*>免费在线六爻排盘<\/h2>/)
    expect(html).toContain('<summary>起卦内容会上传到服务器吗？</summary>')
    expect(html).toContain('href="/about?support=1"')
  })

  it('keeps product details and the guide in their existing public pages', () => {
    const about = renderPublicPage('/about')
    const guide = renderPublicPage('/ai-guide')
    expect(about).toContain('所有排盘计算均在浏览器本地完成')
    expect(about).toContain('href="https://github.com/lemonteaau/binary-liuyao"')
    expect(guide).toContain('<article')
    expect(guide).toContain('AI解卦教程')
  })

  it('renders a not-found page for unknown paths instead of the generator', () => {
    for (const path of ['/foo', '/404']) {
      const html = renderPublicPage(path)
      expect(html).toMatch(/<h1[^>]*>页面不存在<\/h1>/)
      expect(html).toContain('href="/"')
      expect(html).toContain('href="/gua"')
      expect(html).not.toContain('卦号应为')
      expect(html).not.toMatch(/<h1[^>]*>六爻排盘<\/h1>/)
      expect(html).not.toContain('摇币起卦')
    }
  })
})
