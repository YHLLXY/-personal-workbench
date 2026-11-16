#!/usr/bin/env node
/**
 * 体积体检（2026-11-16：从「预算门禁」改成「烟雾报警器」）
 *
 * 为什么改：v1.31 之后三条硬线里「JS 总量 ≤ 1150KB」只剩 1 KB 余量（实测 1149.4），
 * 任何一次正常修复都会红 —— 它开始挡开发，而不是挡事故。
 * 而且它量错了对象：总量把懒加载 chunk 和纯数据（changelog 42KB 文本）都算进去，
 * 也量的是未压缩字节，而用户实际下载的是 brotli（全站 1151→324KB，首屏 726→192KB）。
 *
 * 现在的定位：**只拦灾难，不做预算**。三条线都设在当前值的 2 倍以上，
 * 只为抓住「有人把一整个框架 import 进壳层」这种事故；正常加功能永远不会红。
 * 每次构建都打印真实数字（含 brotli），漂移看得见，但不拦路。
 *
 * 依赖取舍也随之回到工程准则 #5/#6：先翻已有依赖 → 成熟库 →
 * **只有「会进关键路径」才掂量体积**；懒加载页面里的依赖不再用手写的尺子量。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync } from 'node:zlib'

const ROOT = resolve(decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'))
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')

// 三条硬线：只为「事故」留的，不是给日常开发设的天花板。
// 参照 2026-11-16 实测：首屏 192KB(brotli) / 总量 1151KB(raw) / 最大 chunk 306KB(raw)。
const LIMIT = {
  firstScreenBrKb: 400, // 首屏关键路径（brotli，用户真正下载的量）
  totalKb: 2500,        // dist/assets 全部 chunk（raw）——只看量级，不做预算
  maxChunkKb: 800,      // 单个 chunk 别变成另一个 recharts
}
// 软提示：超过就在报告里标黄，但**不失败**
const NOTICE = { firstScreenBrKb: 300 }

if (!existsSync(ASSETS)) {
  console.error('✗ dist/assets 不存在——先跑 npm run build')
  process.exit(1)
}

const kb = n => Math.round(n / 1024)

function brSizeOf(file) {
  try { return brotliCompressSync(readFileSync(join(DIST, file))).length } catch { return 0 }
}
function sizeOf(file) {
  try { return statSync(join(DIST, file)).size } catch { return 0 }
}

// —— ① 首屏：从 vite manifest 的入口出发，沿静态 imports 走闭包 ——
const manifestPath = join(DIST, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('✗ 读不到清单：dist/.vite/manifest.json 缺失（vite.config.ts 已开 build.manifest）')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const entryKeys = Object.keys(manifest).filter(k => manifest[k].isEntry)
const seen = new Set()
const walk = k => {
  if (seen.has(k) || !manifest[k]) return
  seen.add(k)
  for (const dep of manifest[k].imports ?? []) walk(dep)
}
entryKeys.forEach(walk)
let firstRaw = 0
let firstBr = 0
for (const k of seen) {
  firstRaw += sizeOf(manifest[k].file)
  firstBr += brSizeOf(manifest[k].file)
}
const entryRaw = entryKeys.reduce((s, k) => s + sizeOf(manifest[k].file), 0)
const entryBr = entryKeys.reduce((s, k) => s + brSizeOf(manifest[k].file), 0)

// —— ② / ③ 总量与最大单 chunk ——
const files = readdirSync(ASSETS).filter(f => f.endsWith('.js'))
let totalRaw = 0
let totalBr = 0
let maxRaw = 0
let maxFile = ''
for (const f of files) {
  const raw = sizeOf(`assets/${f}`)
  totalRaw += raw
  totalBr += brSizeOf(`assets/${f}`)
  if (raw > maxRaw) { maxRaw = raw; maxFile = f }
}

const firstKb = kb(firstRaw)
const firstBrKb = kb(firstBr)
const totalKb = kb(totalRaw)
const maxKb = kb(maxRaw)

console.log('体积体检（只拦灾难，不做预算）')
console.log(`  入口 chunk   ${entryRaw / 1024 >= 100 ? Math.round(entryRaw / 1024) : (entryRaw / 1024).toFixed(1)} KB raw / ${Math.round(entryBr / 1024)} KB brotli   ← 每次发版真正重下的`)
console.log(`  首屏闭包     ${firstKb} KB raw / ${firstBrKb} KB brotli（${seen.size} 个 chunk，含入口）   ← 新设备第一次打开`)
console.log(`  全站总量     ${totalKb} KB raw / ${kb(totalBr)} KB brotli（${files.length} 个 chunk，含懒加载）`)
console.log(`  最大单 chunk ${maxKb} KB (raw, ${maxFile})`)

const bad = []
if (firstBrKb > LIMIT.firstScreenBrKb) bad.push(`首屏 brotli ${firstBrKb} KB 超过灾难线 ${LIMIT.firstScreenBrKb} KB`)
if (totalKb > LIMIT.totalKb) bad.push(`总量 ${totalKb} KB 超过灾难线 ${LIMIT.totalKb} KB`)
if (maxKb > LIMIT.maxChunkKb) bad.push(`最大 chunk ${maxKb} KB 超过灾难线 ${LIMIT.maxChunkKb} KB`)

if (bad.length) {
  console.error(`✗ ${bad.join('；')}`)
  console.error('  这个量级已经不是「加了个功能」，先去查是不是把某个大依赖 import 进了壳层。')
  process.exit(1)
}
if (firstBrKb > NOTICE.firstScreenBrKb) {
  console.log(`⚠ 首屏 brotli 已到 ${firstBrKb} KB（软提示线 ${NOTICE.firstScreenBrKb} KB）——没有失败，但值得看一眼是不是进了关键路径。`)
}
console.log('✓ 通过（门禁已放开；体积数字仅作体检记录）')
