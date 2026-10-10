/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The a.b.c release number from package.json. Tabs left open are only asked to
// refresh when a or b moves, so bump those for releases worth interrupting for.
const appVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version
// Identifies the deployment itself, to explain a lazy chunk that went missing.
const appBuild = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36)

function versionManifest(): Plugin {
  return {
    name: 'hex64-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion, build: appBuild }),
      })
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), versionManifest()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD__: JSON.stringify(appBuild),
  },
  build: {
    // Lower range media queries (`width<=767px`) to min/max-width so that
    // Safari < 16.4 and Chrome < 104 still apply the responsive layout.
    cssTarget: ['chrome90', 'safari15'],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'lunar',
              test: /node_modules[\\/]lunar-typescript/,
              priority: 4,
            },
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 3,
            },
            {
              name: 'router',
              test: /node_modules[\\/](?:react-router|react-router-dom)[\\/]/,
              priority: 2,
            },
            {
              name: 'icons',
              test: /node_modules[\\/]@phosphor-icons[\\/]react/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
