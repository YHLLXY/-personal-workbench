#!/usr/bin/env node
/**
 * 发版自动化（VERSIONING.md §4 的机器实现）
 *
 * 用法：
 *   node scripts/release.mjs --dry-run          # 只判级+预览，不改任何文件
 *   node scripts/release.mjs --yes --title "标题"  # 完整发版：改文件→验证→commit→tag→push
 *   node scripts/release.mjs --yes --no-push    # 发版但不推送（本地确认后再 push）
 *
 * 判级规则（VERSIONING §2/§3）：BREAKING(! 或 footer)→major；feat→minor；fix/perf→patch；
 * 仅 docs/chore/test/style → 拒绝发版。
 */
import { execSync, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'))
const args = new Set(process.argv.slice(2))
const titleArg = process.argv.find(a => a.startsWith('--title='))?.slice('--title='.length)
const DRY = args.has('--dry-run')
const YES = args.has('--yes') || DRY
const NO_PUSH = args.has('--no-push') || DRY

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
// Windows 的 cmd.exe 会吞 git --pretty 的 % 占位符，git log 必须绕过 shell 直调
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

// 1. 取上个 tag 之后的提交（无 tag 则取全部）
let lastTag = ''
try { lastTag = sh('git describe --tags --abbrev=0') } catch { /* 首个版本 */ }
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const subjects = git('log', range, '--no-merges', '--pretty=%s').split('\n').map(s => s.trim()).filter(Boolean)
if (subjects.length === 0) { console.error('✗ 上个版本以来没有任何提交，无需发版'); process.exit(1) }

// 2. 判级（VERSIONING §2：取最高档）
const isBreaking = s => /^[a-z]+(\([^)]*\))?!:/.test(s) || /^BREAKING CHANGE:/m.test(s)
const isFeat = s => /^feat(\(|:)/.test(s)
const isFix = s => /^(fix|perf)(\(|:)/.test(s)
const releaseable = subjects.filter(s => isBreaking(s) || isFeat(s) || isFix(s) || /^(docs|chore|refactor|test|style)(\(|:)/.test(s))
if (releaseable.length === 0) { console.error('✗ 只有 docs/chore 等不可发版提交，按制度不发版'); process.exit(1) }
const level = subjects.some(isBreaking) ? 'major' : subjects.some(isFeat) ? 'minor' : 'patch'

// 3. 计算新版本号
const pkgPath = resolve(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [maj, min, pat] = pkg.version.replace(/^v/, '').split('.').map(Number)
const next = level === 'major' ? `${maj + 1}.0.0` : level === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`

// 4. 生成 changelog 条目（items 从提交主题聚合，中文类别词开头）
const strip = s => s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '')
const uniq = arr => [...new Set(arr)]
const items = [
  ...uniq(subjects.filter(isFeat).map(s => `新增：${strip(s)}`)),
  ...uniq(subjects.filter(isFix).map(s => `修复：${strip(s)}`)),
]
const fallbackTitle = items[0]?.replace(/^(新增|修复)：/, '') ?? strip(subjects[0])
const title = titleArg ?? (items.length > 1 ? `${fallbackTitle} 等 ${items.length} 项更新` : fallbackTitle)
const date = new Date().toISOString().slice(0, 10)
const entry = `  {\n    version: 'v${next}',\n    date: '${date}',\n    title: '${title.replaceAll("'", "\\'")}',\n    items: [\n${items.map(i => `      '${i.replaceAll("'", "\\'")}',`).join('\n')}\n    ],\n  },\n`

console.log(`上个版本: ${lastTag || '（无，首个版本）'}`)
console.log(`提交数: ${subjects.length} → 判级: ${level.toUpperCase()} → v${pkg.version} ⇒ v${next}`)
console.log(`changelog items:\n${items.map(i => `  - ${i}`).join('\n')}\n标题: ${title}`)

if (!YES) { console.log('（dry-run 结束；确认无误后加 --yes --title "..." 正式发版）'); process.exit(0) }

// 5. 写 changelog.ts + package.json
const clPath = resolve(ROOT, 'src/app/changelog.ts')
let cl = readFileSync(clPath, 'utf8')
const anchor = 'export const CHANGELOG: ChangelogEntry[] = [\n'
if (!cl.includes(anchor)) { console.error('✗ changelog.ts 结构不符（找不到数组锚点）'); process.exit(1) }
cl = cl.replace(anchor, anchor + entry)
writeFileSync(clPath, cl)
pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`✓ 已写入 changelog v${next} 并同步 package.json`)

// 6. 质量门禁
for (const cmd of ['npm test', 'npm run build']) {
  console.log(`⏳ ${cmd} …`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}
console.log('✓ 测试与构建通过')

// 7. commit + tag + push
sh('git add src/app/changelog.ts package.json')
sh(`git commit -m "docs: bump v${next} changelog"`)
sh(`git tag v${next}`)
console.log(`✓ commit + tag v${next}`)
if (!NO_PUSH) {
  sh('git push origin main --tags')
  console.log(`✓ 已推送（Vercel 自动部署 v${next}）`)
} else {
  console.log('（--no-push：请自行 git push origin main --tags）')
}
