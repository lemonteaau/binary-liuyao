import { readdir, readFile } from 'node:fs/promises'

// Ask Bing (and other IndexNow engines) to recrawl the public pages after a
// production deploy: `node scripts/indexnow.mjs`. The key file must already be
// live at the site root, so run this only after the deployment finishes.
const HOST = 'liuyao.lemontea.xyz'
const publicDir = new URL('../public/', import.meta.url)

const keyFile = (await readdir(publicDir)).find((name) => /^[0-9a-f]{32}\.txt$/.test(name))
if (!keyFile) throw new Error('IndexNow key file not found in public/')
const key = (await readFile(new URL(keyFile, publicDir), 'utf8')).trim()
const sitemap = await readFile(new URL('sitemap.xml', publicDir), 'utf8')
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }),
})
console.log(`IndexNow ${response.status} ${response.statusText}: ${urlList.join(', ')}`)
if (!response.ok && response.status !== 202) process.exitCode = 1
