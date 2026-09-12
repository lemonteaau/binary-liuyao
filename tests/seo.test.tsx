// @vitest-environment jsdom

import html from '../index.html?raw'
import sitemap from '../public/sitemap.xml?raw'
import robots from '../public/robots.txt?raw'
import pngDataUrl from '../public/og-liuyao.png?inline'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { CANONICAL_URL, PUBLIC_ROUTES, canonicalUrl, robotsContent, routeMetadata, updatePageMetadata } from '@/lib/seo'

const parseHtml = () => new DOMParser().parseFromString(html, 'text/html')

beforeEach(() => {
  document.head.innerHTML = parseHtml().head.innerHTML
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  document.head.innerHTML = ''
  vi.unstubAllGlobals()
})

function expectMetadata(pathname: string) {
  const { title, description } = routeMetadata(pathname)
  expect(document.title).toBe(title)
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    expect(document.querySelector(selector)?.getAttribute('content')).toBe(title)
  }
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    expect(document.querySelector(selector)?.getAttribute('content')).toBe(description)
  }
}

describe('SEO and path-route compatibility', () => {
  it('serves complete, consistent homepage metadata before JavaScript executes', () => {
    expectMetadata('/')
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(CANONICAL_URL)
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(CANONICAL_URL)

    const xml = new DOMParser().parseFromString(sitemap, 'application/xml')
    expect(xml.querySelector('parsererror')).toBeNull()
    expect(Array.from(xml.querySelectorAll('loc'), (node) => node.textContent)).toEqual(PUBLIC_ROUTES.map(canonicalUrl))
    expect(robots).toContain(`Sitemap: ${CANONICAL_URL}sitemap.xml`)
    expect(robots).not.toMatch(/^Disallow:\s*\/$/m)
  })

  it('connects the webpage, website, app and a real image without invented rating data', () => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts).toHaveLength(1)
    const schema = JSON.parse(scripts[0]!.textContent!)
    const graph = schema['@graph'] as Array<Record<string, unknown>>
    const ids = new Set(graph.map((node) => node['@id']))
    expect(ids.size).toBe(graph.length)
    for (const node of graph) {
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object' && '@id' in value) {
          expect(ids.has(value['@id'])).toBe(true)
        }
      }
    }
    expect(graph.find((node) => node['@type'] === 'WebPage')).toMatchObject({
      url: CANONICAL_URL,
      name: routeMetadata('/').title,
      description: routeMetadata('/').description,
      mainEntity: { '@id': `${CANONICAL_URL}#app` },
    })
    const png = new DataView(Uint8Array.from(atob(pngDataUrl.split(',')[1]!), (char) => char.charCodeAt(0)).buffer)
    const image = graph.find((node) => node['@type'] === 'ImageObject')!
    expect(image.width).toBe(png.getUint32(16))
    expect(image.height).toBe(png.getUint32(20))
    expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|reviewRating/)
  })

  it('never copies private hash parameters into head metadata or changes the visible DOM', () => {
    window.history.replaceState(null, '', '/?utm_source=test#/result?private=secret-reading')
    document.body.innerHTML = '<main><h1>排盘完成</h1><button>复制排盘</button></main>'
    const originalBody = document.body.innerHTML
    const originalUrl = window.location.href
    for (const route of ['/result', '/settings', '/ai-guide', '/about', '/unknown', '/']) {
      updatePageMetadata(route)
      expectMetadata(route)
      expect(document.body.innerHTML).toBe(originalBody)
      expect(window.location.href).toBe(originalUrl)
      expect(document.head.innerHTML).not.toContain('secret-reading')
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonicalUrl(route))
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(robotsContent(route))
      expect(document.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    }
    document.body.innerHTML = ''
  })

  it('synchronizes metadata on real navigation and restores homepage metadata', async () => {
    localStorage.setItem('hex64.settings.v1', JSON.stringify({ animation: false }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline in test')))
    render(<App />)
    expectMetadata('/')
    fireEvent.click(screen.getByRole('link', { name: '[设置]' }))
    await waitFor(() => expect(window.location.pathname).toBe('/settings'))
    expectMetadata('/settings')
    fireEvent.click(screen.getByRole('link', { name: '[起卦]' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expectMetadata('/')
    expect(screen.getByRole('heading', { name: '选择起卦方式' })).toBeTruthy()
  })
})
