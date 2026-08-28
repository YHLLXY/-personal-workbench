#!/usr/bin/env node
/**
 * 体积预算门禁：dist/assets 下 JS 总量与最大单 chunk 不得超预算。
 * 背景：移动端首屏曾为此砍 312KB（recharts→SVG），红线靠机器把关不靠自觉。
 * 阈值 = 当前基线 + 10% 余量；确需上调时改 BUDGET，并在 commit message 说明理由。
 */
import { readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'))
const ASSETS = join(ROOT, 'dist', 'assets')
const BUDGET = { totalJsKb: 1120, maxChunkKb: 340 } // 基线 1016KB/306KB + 10%

const files = readdirSync(ASSETS).filter(f => f.endsWith('.js'))
let total = 0, max = 0, maxFile = ''
for (const f of files) {
  const size = statSync(join(ASSETS, f)).size
  total += size
  if (size > max) { max = size; maxFile = f }
}
const totalKb = Math.round(total / 1024), maxKb = Math.round(max / 1024)
console.log(`JS 总量: ${totalKb} KB / 预算 ${BUDGET.totalJsKb} KB`)
console.log(`最大 chunk: ${maxKb} KB (${maxFile}) / 预算 ${BUDGET.maxChunkKb} KB`)

const overs = []
if (totalKb > BUDGET.totalJsKb) overs.push(`JS 总量超预算（+${totalKb - BUDGET.totalJsKb} KB）`)
if (maxKb > BUDGET.maxChunkKb) overs.push(`最大 chunk 超预算（+${maxKb - BUDGET.maxChunkKb} KB）`)
if (overs.length) { console.error(`✗ ${overs.join('；')}——请懒加载或移除依赖，勿盲目上调 BUDGET`); process.exit(1) }
console.log('✓ 体积预算通过')
