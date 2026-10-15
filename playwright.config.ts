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
  // 本机 16 核时 Playwright 默认开 8 个 worker：12 个用例同时起 8 个 Chromium，
  // browserContext.close() 会被挤到超过 30s 的用例超时——表现为「4~5 个 flaky」，
  // 但断言其实早就过了，挂在 teardown（Tearing down "context" exceeded the test timeout）。
  // 实测限到 4：26.8s 全绿零 flaky（默认 8：1.3m、4~5 个 flaky）——又快又稳。
  // CI 的机器规格固定，交给 Playwright 自己决定。
  workers: process.env.CI ? undefined : 4,
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
