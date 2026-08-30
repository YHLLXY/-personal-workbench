/**
 * 启动动画 + 天气卡视觉预览截图：npm run dev 起着时运行 `node scripts/boot-preview.mjs`
 * 输出到 .tmp-boot/*.png（不进 git）。搭配组件里的 ?boot= / ?wx= 预览钩子使用。
 */
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const SHOTS = [
  ['dawn', 'clear'], ['dawn', 'drizzle'],
  ['noon', 'mostly-clear'], ['noon', 'thunder'],
  ['dusk', 'heavy-rain'], ['dusk', 'snow'],
  ['night', 'clear'], ['night', 'rain'], ['night', 'fog'], ['dusk', 'overcast'],
]
mkdirSync('.tmp-boot', { recursive: true })
const BASE = process.env.BOOT_BASE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
for (const [seg, wx] of SHOTS) {
  await page.goto(`${BASE}/tasks?boot=${seg}&wx=${wx}`)
  await page.waitForSelector('.boot')
  await page.waitForTimeout(1600) // 动画中段：主角已入场浮动、品牌已浮现
  await page.screenshot({ path: `.tmp-boot/${seg}-${wx}.png` })
  console.log(`✓ ${seg}-${wx}.png`)
}
// 天气卡（桌面首页 + 移动端首页）：跳过新手引导 + 点掉启动动画，再等 React Query 拉到 /api/weather（走 dev proxy）
await page.addInitScript(() => localStorage.setItem('wb-onboarded', '1'))
await page.goto(`${BASE}/`)
await page.waitForSelector('.boot')
await page.locator('.boot').click()
await page.waitForTimeout(2200)
await page.screenshot({ path: '.tmp-boot/home-desktop.png' })
console.log('✓ home-desktop.png')
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mobile.addInitScript(() => localStorage.setItem('wb-onboarded', '1'))
await mobile.goto(`${BASE}/`)
await mobile.waitForSelector('.boot')
await mobile.locator('.boot').click()
await mobile.waitForTimeout(2200)
await mobile.screenshot({ path: '.tmp-boot/home-mobile.png' })
console.log('✓ home-mobile.png')
await browser.close()
