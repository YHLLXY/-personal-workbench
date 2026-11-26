import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 迁移文件的幂等性守卫（v1.35 起）。
 *
 * 为什么要有这条：001 / 006 里 `create policy` 没有配套的 `drop policy if exists`，
 * 重跑同一个迁移会直接报「policy already exists」——于是"幂等迁移"这句话就只写在文档里。
 * 迁移是**用户手工执行**的，重跑失败意味着他要在控制台里猜哪些语句已经生效过。
 *
 * 从 019 开始，新迁移必须在解析层面就能证明幂等：每个 create 都有 if not exists 或前置 drop。
 */

const DIR = 'supabase/migrations'
/** 本测试只对 v1.35 之后新增的迁移生效；旧文件是历史既成写法，不改名不改内容 */
const FROM = '019'

function migrationFiles(): string[] {
  return readdirSync(DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => f.slice(0, 3) >= FROM)
}
function read(f: string): string {
  return readFileSync(join(DIR, f), 'utf8')
}

describe('迁移幂等性（019 起）', () => {
  it('存在新的迁移文件，且至少有一个真的创建了策略（否则这条守卫形同虚设）', () => {
    expect(migrationFiles().length).toBeGreaterThan(0)
    expect(migrationFiles().filter(f => /create\s+policy/i.test(read(f))).length).toBeGreaterThan(0)
  })

  for (const file of migrationFiles()) {
    const sql = read(file)

    it(`${file}: create table / index 都带 if not exists`, () => {
      for (const m of sql.matchAll(/create\s+(table|index)\s+(?!if\s+not\s+exists)/gi)) {
        throw new Error(`${file}: "create ${m[1]}" 缺 if not exists（重跑会失败）`)
      }
      expect(true).toBe(true)
    })

    it(`${file}: add column 都带 if not exists`, () => {
      for (const m of sql.matchAll(/add\s+column\s+(?!if\s+not\s+exists)/gi)) {
        throw new Error(`${file}: "add column" 缺 if not exists（重跑会失败）：${sql.slice(m.index, m.index + 60)}`)
      }
      expect(true).toBe(true)
    })

    it(`${file}: 每个 create policy 前都有对应的 drop policy if exists`, () => {
      const created = [...sql.matchAll(/create\s+policy\s+(\w+)/gi)].map(m => m[1])
      const dropped = new Set([...sql.matchAll(/drop\s+policy\s+if\s+exists\s+(\w+)/gi)].map(m => m[1]))
      // 只加列的迁移不创建策略，天然通过；创建了策略的必须配 drop（否则重跑报 already exists）
      expect(created.filter(p => !dropped.has(p))).toEqual([])
    })
  }
})

describe('019 计划项表与代码写入的列名一致', () => {
  const sql = read('019_plan_items.sql')

  it('表名与主键就是 (user_id, plan_date, task_id)', () => {
    expect(sql).toContain('create table if not exists public.wb_plan_items')
    expect(sql).toMatch(/primary key \(user_id, plan_date, task_id\)/)
  })

  it('代码会写的每一列都在建表语句里出现（防 42703 / PGRST204）', () => {
    // 与 supabase-repository.ts 的 planItemToRow / upsertPlanItem 载荷一一对应
    for (const col of ['user_id', 'plan_date', 'task_id', 'title', 'goal_id', 'amount', 'done_at', 'moved_to', 'created_at']) {
      expect(sql).toContain(col)
    }
  })

  it('RLS 四类策略齐全（select / insert / update / delete）', () => {
    for (const op of ['for select', 'for insert', 'for update', 'for delete']) {
      expect(sql).toContain(op)
    }
    expect(sql).toContain('enable row level security')
  })
})
