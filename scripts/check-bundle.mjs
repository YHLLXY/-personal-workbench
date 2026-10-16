#!/usr/bin/env node
/**
 * 体积预算门禁：三个独立数字——
 *   ① **首屏 JS** = 入口 chunk + 它静态 import 的闭包（真正决定手机打开速度，**这是红线**）
 *   ② JS 总量 = dist/assets 下全部 .js 之和（含懒加载 chunk，防代码总量失控）
 *   ③ 最大单 chunk（防某个页面把首屏拖慢）
 *
 * 为什么拆开（v1.26）：注释一直声称红线是为「移动端首屏」（recharts→SVG 那次砍 312KB），
 * 但旧实现只量 dist/assets 全部文件之和——那其实是「代码总量」，懒加载并不能绕开它。
 * 判据和它声称保护的东西对不上，于是拆成两个数字、各自设阈值。
 *
 * 阈值 = 当前基线 + 约 10% 余量。确需上调时改 BUDGET，并在 commit message 说明理由。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'))
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')
// 2026-10-15 重新定基（拆分口径后的第一次实测）：
//   首屏 723 KB（entry 303 + 静态 import 闭包共 13 chunk）——**这是新引入的真红线**
//   总量 1103 KB（52 chunk）——旧口径下的 1120 只剩 17 KB，收紧到无法作为门禁用，故按新基线 +4% 重定
//   最大 chunk 303 KB（未变，沿用 340）
// 2026-10-16 追加实测：首屏 724 / 总量 1141 / 最大 304（v1.31 月亮+提醒重构后，本轮 +12 KB，余量仅 9 KB）
//   ⚠️ 上面那行 1103 是定基当天的数，**引用前先实测**——注释里的基线同样会过期（v1.31 就被它误导过一次）
const BUDGET = { firstScreenJsKb: 790, totalJsKb: 1150, maxChunkKb: 340 }

if (!existsSync(ASSETS)) {
  console.error('✗ dist/assets 不存在——先跑 npm run build')
  process.exit(1)
}

const kb = (n) => Math.round(n / 1024)
const sizeOf = (rel) => { try { return statSync(join(DIST, rel)).size } catch { return 0 } }

// —— ① 首屏：从 vite manifest 的入口出发，沿静态 imports 走闭包 ——
const manifestPath = join(DIST, '.vite', 'manifest.json')
let firstScreen = null
let entries = 0
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entryKeys = Object.keys(manifest).filter((k) => manifest[k].isEntry)
  entries = entryKeys.length
  if (entryKeys.length > 0) {
    const seen = new Set()
    const walk = (key) => {
      if (seen.has(key) || !manifest[key]) return
      seen.add(key)
      for (const dep of manifest[key].imports ?? []) walk(dep)
    }
    for (const k of entryKeys) walk(k)
    firstScreen = [...seen].reduce((sum, k) => sum + sizeOf(manifest[k].file), 0)
  }
}
if (firstScreen == null) {
  console.error('✗ 读不到首屏清单：dist/.vite/manifest.json 缺失或没有入口。跑一次 npm run build 生成（vite.config.ts 已开 build.manifest）')
  process.exit(1)
}

// —— ② / ③ 总量与最大单 chunk ——
const files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'))
let total = 0
let max = 0
let maxFile = ''
for (const f of files) {
  const size = statSync(join(ASSETS, f)).size
  total += size
  if (size > max) { max = size; maxFile = f }
}

const fsKb = kb(firstScreen)
const totalKb = kb(total)
const maxKb = kb(max)
console.log(`首屏 JS:    ${fsKb} KB / 预算 ${BUDGET.firstScreenJsKb} KB（入口 ${entries} 个 + 静态 import 闭包）`)
console.log(`JS 总量:    ${totalKb} KB / 预算 ${BUDGET.totalJsKb} KB（${files.length} 个 chunk，含懒加载）`)
console.log(`最大 chunk: ${maxKb} KB (${maxFile}) / 预算 ${BUDGET.maxChunkKb} KB`)

const overs = []
if (fsKb > BUDGET.firstScreenJsKb) overs.push(`首屏 JS 超预算（+${fsKb - BUDGET.firstScreenJsKb} KB）——首屏红线优先`)
if (totalKb > BUDGET.totalJsKb) overs.push(`JS 总量超预算（+${totalKb - BUDGET.totalJsKb} KB）`)
if (maxKb > BUDGET.maxChunkKb) overs.push(`最大 chunk 超预算（+${maxKb - BUDGET.maxChunkKb} KB）`)
if (overs.length) {
  console.error(`✗ ${overs.join('；')}`)
  console.error('  请优先懒加载 / 换更小的实现（零依赖优先），勿盲目上调 BUDGET')
  process.exit(1)
}
console.log('✓ 体积预算通过')
