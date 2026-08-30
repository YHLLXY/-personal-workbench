import { test, expect, type Page } from '@playwright/test'

/** 关键链路 E2E 冒烟（本地 IndexedDB 模式，每个用例独立 localStorage 上下文） */

// 每个用例独立上下文 → 新手引导弹层每次都会出现并拦截点击，加载前直接标记已完成；
// 启动动画同理打跳过钩子（wb-boot-skip），否则每个用例都要多等 3 秒；
// /api/* 一律拦断（502）——动画/天气卡自带降级链，E2E 不依赖外网、不受上游抖动影响
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 502, body: '{}' }))
  await page.addInitScript(() => {
    localStorage.setItem('wb-onboarded', '1')
    localStorage.setItem('wb-boot-skip', '1')
  })
})

async function goto(page: Page, path: string) {
  await page.goto(path)
  // 侧边栏出现即应用挂载完成
  await expect(page.getByText('我的工作台')).toBeVisible()
}

test('首页加载：侧边栏导航渲染（KPI 卡在移动端容器，桌面视口不显示）', async ({ page }) => {
  await goto(page, '/')
  await expect(page.getByRole('link', { name: '工作台总览' })).toBeVisible()
  await expect(page.getByRole('link', { name: '今日待办' })).toBeVisible()
})

test('待办闭环：新建 → 显示 → 勾选完成 → 划线保留 → 撤销', async ({ page }) => {
  await goto(page, '/tasks')
  await page.getByRole('button', { name: '新建' }).click()
  await page.getByPlaceholder('任务内容').fill('E2E 冒烟任务')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await expect(page.getByText('今日 1 项')).toBeVisible()
  // 勾选完成 → 移入「已完成」分区（划线保留，不消失），今日计数归零
  await page.getByLabel('完成').first().click()
  await expect(page.getByText('今日 0 项')).toBeVisible()
  await expect(page.getByText('已完成 1 项 · 点方块可撤销')).toBeVisible()
  // 撤销：再点一次勾选框，任务回到今日待办
  await page.getByLabel('完成').first().click()
  await expect(page.getByText('今日 1 项')).toBeVisible()
})

test('启动动画：冷启动播放 → 点击任意处跳过', async ({ browser }) => {
  // 独立上下文：不打 wb-boot-skip 钩子，让动画正常播放
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 800 } })
  await ctx.route('**/api/**', route => route.fulfill({ status: 502, body: '{}' }))
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('wb-onboarded', '1'))
  await p.goto('/tasks')
  await expect(p.locator('.boot')).toBeVisible()
  await p.locator('.boot').click()
  await expect(p.locator('.boot')).toHaveCount(0, { timeout: 2500 })
  await ctx.close()
})

test('启动动画：不操作则播放结束自动淡出卸载', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 800 } })
  await ctx.route('**/api/**', route => route.fulfill({ status: 502, body: '{}' }))
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('wb-onboarded', '1'))
  await p.goto('/tasks')
  await expect(p.locator('.boot')).toBeVisible()
  await expect(p.locator('.boot')).toHaveCount(0, { timeout: 5000 }) // 2.6s 播放 + 0.65s 淡出 + 余量
  await ctx.close()
})

test('学习目标：新建 → +10 步进 → 精确进度显示', async ({ page }) => {
  await goto(page, '/study')
  await page.getByRole('tab', { name: '学习目标' }).click()
  await page.getByRole('button', { name: '新建目标' }).click()
  await page.locator('#goal-title').fill('E2E 刷题')
  await page.locator('#goal-target').fill('50')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText('E2E 刷题')).toBeVisible()
  await page.getByLabel('进度 +10').click()
  await expect(page.getByText('10 / 50')).toBeVisible()
})

test('主题切换：一击必变（html.dark 切换）', async ({ page }) => {
  await goto(page, '/')
  const root = page.locator('html')
  await page.getByRole('button', { name: /切换主题/ }).click()
  await expect(root).toHaveClass(/dark/)
  await page.getByRole('button', { name: /切换主题/ }).click()
  await expect(root).not.toHaveClass(/dark/)
})

test('速记：新建自动保存 → 归档 → 归档箱可见', async ({ page }) => {
  await goto(page, '/notes')
  await page.getByRole('button', { name: '速记', exact: true }).click() // 打开编辑器
  await page.getByPlaceholder('想到什么就写什么，支持 Markdown…').fill('E2E 速记内容')
  await expect(page.getByText(/已保存/)).toBeVisible({ timeout: 10_000 }) // 停笔 1.2s 自动保存
  await page.getByLabel('归档').first().click({ force: true }) // 归档按钮 hover 才显示
  await expect(page.getByText(/归档箱/)).toBeVisible()
})

test('复盘：展开成就分区 → 填写保存 → 成功反馈', async ({ page }) => {
  await goto(page, '/review')
  await page.getByRole('button', { name: '今日成就' }).click() // 展开折叠分区
  await page.getByPlaceholder('今天完成了什么？值得记录的小胜利…').fill('跑通 E2E 冒烟')
  await page.getByPlaceholder('今天做了什么？有什么收获和遗憾？').fill('一切顺利')
  await page.getByRole('button', { name: '保存复盘' }).click()
  await expect(page.getByText('今日复盘已保存')).toBeVisible()
})
