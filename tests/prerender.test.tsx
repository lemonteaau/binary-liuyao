import { describe, expect, it } from 'vitest'
import { renderPublicPage } from '../src/prerender'

describe('public HTML without a browser', () => {
  it('exposes all seven real homepage modes and crawlable public links', () => {
    const html = renderPublicPage('/')
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(7)
    for (const mode of ['摇币起卦', '电脑起卦', '手动排卦', '卦名起卦', '数字起卦', '时间起卦', '汉字起卦']) {
      expect(html).toContain(mode)
    }
    expect(html).toMatch(/<h1[^>]*>选择起卦方式<\/h1>/)
    for (const href of ['/about', '/ai-guide']) {
      expect(html).toContain(`href="${href}"`)
    }
    expect(html).not.toContain('系统正在启动，跳过启动动画')
    expect(html).toMatch(/class="app-clock[^>]*>—<\/span>/)
  })

  it('keeps product details and the guide in their existing public pages', () => {
    const about = renderPublicPage('/about')
    const guide = renderPublicPage('/ai-guide')
    expect(about).toContain('所有排盘计算均在浏览器本地完成')
    expect(about).toContain('href="https://github.com/lemonteaau/binary-liuyao"')
    expect(guide).toContain('<article')
    expect(guide).toContain('AI解卦教程')
  })
})
