import { afterEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error Cloudflare Pages Functions are deployed as plain JavaScript.
import { onRequest } from '../functions/x/[[path]].js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function proxyRequest(path: string[], init?: RequestInit) {
  const request = new Request(`https://liuyao.lemontea.xyz/x/${path.join('/')}`, init)
  return onRequest({ request, params: { path } })
}

describe('Umami 同域代理', () => {
  it('流式代理 tracker 脚本并移除上游 Cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('tracker-code', {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Set-Cookie': 'upstream=blocked',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxyRequest(['client.js'])

    expect(fetchMock).toHaveBeenCalledOnce()
    const upstreamRequest = fetchMock.mock.calls[0]![0] as Request
    expect(upstreamRequest.url).toBe('https://umami.lemontea.xyz/script.js')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/javascript')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('Cache-Control')).toContain('max-age=3600')
    expect(await response.text()).toBe('tracker-code')
  })

  it('仅接受同源的事件请求并原样转发请求体', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://umami.lemontea.xyz/api/send')
      expect(request.headers.get('Cookie')).toBeNull()
      expect(request.headers.get('X-Forwarded-For')).toBe('203.0.113.8')
      expect(await request.text()).toBe('{"type":"event"}')
      return Response.json({ cache: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxyRequest(['api', 'send'], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.8',
        Cookie: 'session=private',
        Origin: 'https://liuyao.lemontea.xyz',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: '{"type":"event"}',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ cache: 'ok' })
  })

  it('拒绝未知路径、错误方法和跨站采集请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const unknown = await proxyRequest(['anything'])
    const wrongMethod = await proxyRequest(['client.js'], { method: 'POST' })
    const crossSite = await proxyRequest(['api', 'send'], {
      method: 'POST',
      headers: {
        Origin: 'https://example.com',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: '{}',
    })

    expect(unknown.status).toBe(404)
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('Allow')).toBe('GET, HEAD')
    expect(crossSite.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('上游不可用时返回不泄露细节的 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream error')))

    const response = await proxyRequest(['client.js'])

    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('Analytics service unavailable')
  })
})
