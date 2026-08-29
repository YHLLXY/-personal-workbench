/**
 * 启动动画视觉预览截图：npm run dev 起着时运行 `node scripts/boot-preview.mjs`
 * 输出到 .tmp-boot/*.png（不进 git）。搭配组件里的 ?boot= / ?wx= 预览钩子使用。
 */
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const SHOTS = [
  ['dawn', 'clear'], ['dawn', 'rain'], ['dawn', 'fog'],
  ['noon', 'clear'], ['noon', 'thunder'],
  ['dusk', 'clear'], ['dusk', 'snow'],
  ['night', 'clear'], ['night', 'rain'],
]
mkdirSync('.tmp-boot', { recursive: true })
const BASE = process.env.BOOT_BASE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
for (const [seg, wx] of SHOTS) {
  await page.goto(`${BASE}/tasks?boot=${seg}&wx=${wx}`)
  await page.waitForSelector('.boot')
  await page.waitForTimeout(1300) // 动画中段：天体已升起、品牌已浮现
  await page.screenshot({ path: `.tmp-boot/${seg}-${wx}.png` })
  console.log(`✓ ${seg}-${wx}.png`)
}
await browser.close()
