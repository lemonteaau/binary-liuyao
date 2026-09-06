const UMAMI_ORIGIN = 'https://umami.lemontea.xyz'

const ROUTES = new Map([
  ['client.js', {
    upstreamPath: '/script.js',
    methods: ['GET', 'HEAD'],
    cacheControl: 'public, max-age=3600, must-revalidate',
  }],
  ['api/send', {
    upstreamPath: '/api/send',
    methods: ['POST'],
    cacheControl: 'no-store',
  }],
])

export async function onRequest({ request, params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path
  const route = ROUTES.get(path)

  if (!route) {
    return new Response('Not found', { status: 404 })
  }

  if (!route.methods.includes(request.method)) {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: route.methods.join(', ') },
    })
  }

  if (path === 'api/send' && !isSameOriginRequest(request)) {
    return new Response('Forbidden origin', { status: 403 })
  }

  const upstreamUrl = new URL(route.upstreamPath, UMAMI_ORIGIN)
  const upstreamRequest = new Request(upstreamUrl, request)
  upstreamRequest.headers.delete('Host')
  upstreamRequest.headers.delete('Content-Length')
  upstreamRequest.headers.delete('Cookie')

  const clientIp = request.headers.get('CF-Connecting-IP')
  if (clientIp) {
    upstreamRequest.headers.set('X-Forwarded-For', clientIp)
    upstreamRequest.headers.set('X-Real-IP', clientIp)
  }

  try {
    const upstreamResponse = await fetch(upstreamRequest)
    const responseHeaders = new Headers(upstreamResponse.headers)
    responseHeaders.delete('Set-Cookie')
    responseHeaders.set('Cache-Control', route.cacheControl)
    responseHeaders.set('X-Content-Type-Options', 'nosniff')

    return new Response(request.method === 'HEAD' ? null : upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Umami proxy request failed',
      error: error instanceof Error ? error.message : String(error),
      path,
    }))
    return new Response('Analytics service unavailable', {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('Origin')
  if (!origin || origin !== new URL(request.url).origin) return false

  const fetchSite = request.headers.get('Sec-Fetch-Site')
  return !fetchSite || fetchSite === 'same-origin'
}
