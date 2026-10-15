import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// vitest 的 cwd 就是仓库根；找不到就直接报错，别让用例静默地什么都不检查
const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
if (!existsSync(MIGRATIONS)) throw new Error('找不到迁移目录: ' + MIGRATIONS)

/** 所有迁移按文件名排序拼起来——后写的定义覆盖先写的。 */
function migrationSql(): string {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n')
}

/** 抠出某个列【最新一次】 check (列 in ('a','b')) 允许的取值。 */
function allowedValues(sql: string, column: string): Set<string> {
  const re = new RegExp('check\\s*\\(\\s*' + column + '\\s+in\\s*\\(([^)]*)\\)', 'gi')
  let last: string[] | null = null
  for (const m of sql.matchAll(re)) last = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  return new Set(last ?? [])
}

/** 找出所有「把字面量写进这个列」的地方：列: 'x' / 列 = 'x' / 列', 'x'。 */
function writtenValues(text: string, column: string): Set<string> {
  const re = new RegExp(column + "\\s*['\"]?\\s*(?:=|:|,)\\s*['\"]([a-z_]+)['\"]", 'g')
  return new Set([...text.matchAll(re)].map(m => m[1]))
}

const SQL = migrationSql()
const API_SRC = readFileSync(join(ROOT, 'api', 'digest.ts'), 'utf8')

describe('迁移里的状态机与代码必须一致（v1.28.5 的根因固化）', () => {
  it('CHECK 约束确实定义了 ai_status 的取值', () => {
    const allowed = allowedValues(SQL, 'ai_status')
    expect(allowed.size).toBeGreaterThan(0)
    expect([...allowed]).toContain('pending')
  })

  it('代码与 SQL 写进 ai_status 的每个取值，都在最新 CHECK 的允许范围内', () => {
    // 015 建表时状态机漏了 'processing'，而同一个文件里的 wb_claim_items() 正是写 'processing'。
    // 后果：领取函数【每次】都抛 23514，enrich 稳定 500，条目一条也领不出来。
    // 单测里的 Supabase 替身是 JS 实现的，只认逻辑不认 CHECK，所以这个矛盾在测试里完全不可见。
    const allowed = allowedValues(SQL, 'ai_status')
    const written = new Set([...writtenValues(SQL, 'ai_status'), ...writtenValues(API_SRC, 'ai_status')])
    expect(written.size).toBeGreaterThan(0)
    expect([...written].filter(v => !allowed.has(v))).toEqual([])
  })

  it('状态机必须包含 processing —— 领取与陈旧回收都依赖它', () => {
    expect([...allowedValues(SQL, 'ai_status')]).toContain('processing')
    expect([...writtenValues(SQL, 'ai_status')]).toContain('processing')
  })
})
