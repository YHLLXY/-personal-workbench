import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeManifestIcons: false,
      manifest: {
        name: '个人工作台',
        short_name: '工作台',
        description: '个人专属工作台：学习、资讯、健康、复盘一站式管理',
        theme_color: '#5B8A72',
        background_color: '#F8F6F2',
        display: 'standalone',
        lang: 'zh-CN',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  // Meteocons 动画 SVG 走独立文件（不内联 base64）：14 个图标共 ~51KB，内联会撑爆主 chunk（check-bundle 上限 340KB）；
  // SW 预缓存 globPatterns 已含 svg，离线启动动画不受影响
  build: {
    assetsInlineLimit: (filePath, content) => !filePath.endsWith('.svg') && content.length < 4096,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // dev 环境没有 Vercel serverless：/api/weather 直连 Open-Meteo 原始 JSON，
    // 与生产 /api/weather（api/weather.ts 薄代理）返回同构数据，共用前端解析。
    // 坐标=重庆——改动时同步 api/weather.ts 的 UPSTREAM。
    proxy: {
      '/api/weather': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        rewrite: () => '/v1/forecast?latitude=29.563&longitude=106.5516&current=weather_code,temperature_2m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=Asia%2FShanghai',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    // Playwright 的 e2e/*.spec.ts 交给 playwright test 跑，vitest 不要扫
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
