import { defineConfig, devices } from '@playwright/test'

/** E2E 冒烟：本地 IndexedDB 模式（无 env），vite dev server 默认起在 5173。
 *  端口被其他项目占用时可用 E2E_PORT 换端口（如 E2E_PORT=5199 npx playwright test），
 *  冒烟用例里的独立 context（启动动画两个用例）通过 E2E_BASE_URL 同步 */
const PORT = Number(process.env.E2E_PORT ?? 5173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 1, // 本地 dev server 冷编译偶发超时，重试一次兜底（复跑已验证用例本身稳定）
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
