/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
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
