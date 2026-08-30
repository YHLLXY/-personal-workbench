// FLIP 动画截帧自检：完成任务滑入已完成区 / 加星滑顶 / toast 撤销飞回。
// 用法：先起 npm run preview（或 dev），FLIP_BASE_URL=http://localhost:4173 node scripts/flip-preview.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.env.FLIP_BASE_URL ?? 'http://localhost:4173'
const OUT = '.tmp-flip'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.route('**/api/**', r => r.fulfill({ status: 502, body: '{}' }))
await ctx.addInitScript(() => {
  localStorage.setItem('wb-onboarded', '1')
  localStorage.setItem('wb-boot-skip', '1')
})
const page = await ctx.newPage()
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.goto(BASE + '/tasks')
await page.getByText('我的工作台').waitFor()

for (const title of ['晨读 30 分钟', '写周报', '买咖啡豆']) {
  await page.getByRole('button', { name: '新建' }).click()
  await page.getByPlaceholder('任务内容').fill(title)
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.waitForTimeout(200)
}
await page.screenshot({ path: `${OUT}/0-初始.png` })

// 1) 完成"晨读"：320ms 滑入已完成区，抓 3 个中间帧
await page.getByLabel('完成', { exact: true }).first().click()
await page.waitForTimeout(90)
await page.screenshot({ path: `${OUT}/1-完成-90ms.png` })
await page.waitForTimeout(80)
await page.screenshot({ path: `${OUT}/2-完成-170ms.png` })
await page.waitForTimeout(100)
await page.screenshot({ path: `${OUT}/3-完成-270ms.png` })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/4-完成-落定.png` })

// 2) 给"买咖啡豆"加星：应从底部平滑滑到顶部
await page.getByLabel('设为今日焦点').last().click()
await page.waitForTimeout(110)
await page.screenshot({ path: `${OUT}/5-星标-110ms.png` })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/6-星标-落定.png` })

// 3) 点 toast「撤销」：任务从已完成区飞回今日区
await page.getByRole('button', { name: '撤销', exact: true }).click()
await page.waitForTimeout(110)
await page.screenshot({ path: `${OUT}/7-撤销-110ms.png` })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/8-撤销-落定.png` })

await browser.close()
console.log('done → ' + OUT)
