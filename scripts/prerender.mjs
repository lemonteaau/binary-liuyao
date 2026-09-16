import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

// Build-time only: deployment remains a static dist directory plus the existing
// Pages Functions. No browser download, runtime server or extra service is needed.
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom',
})
try {
  const { renderPublicPage } = await server.ssrLoadModule('/src/prerender.tsx')
  const { APP_ROUTES, PUBLIC_ROUTES, updatePageMetadata } = await server.ssrLoadModule('/src/lib/seo.ts')
  const output = resolve(server.config.build.outDir)
  const template = await readFile(resolve(output, 'index.html'), 'utf8')
  for (const route of APP_ROUTES) {
    const dom = new JSDOM(template)
    const document = dom.window.document
    updatePageMetadata(route, document)
    if (PUBLIC_ROUTES.includes(route)) {
      document.getElementById('root').innerHTML = renderPublicPage(route)
      document.getElementById('root').setAttribute('data-prerendered', '')
      // The public content already works without JS; avoid the homepage-only fallback.
      document.querySelector('noscript')?.remove()
    }
    await writeFile(resolve(output, route === '/' ? 'index.html' : `${route.slice(1)}.html`), dom.serialize())
    dom.window.close()
  }
} finally {
  await server.close()
}
