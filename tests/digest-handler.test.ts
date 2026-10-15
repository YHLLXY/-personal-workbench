import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * api/digest.ts 的处理器级测试（v1.27）。
 *
 * 迁移 015 尚未在生产执行，这条链路没法靠线上验证——所以这里用一个有状态 fake
 * 把 Supabase + /api/hot + LLM 三处网络都接管，直接驱动 handler()。
 * 覆盖编排逻辑：鉴权、去重、状态机、聚簇、成刊、运行日志。
 * （模型输出质量属于提示词问题，不在这一层；纯函数见 tests/digest-api.test.ts）
 */

interface FakeRow { table: string; row: Record<string, unknown> }
const state = vi.hoisted(() => ({
  rows: [] as FakeRow[],
  hotPayload: { items: [] as unknown[], sources: [] as unknown[] },
  llmQueue: [] as string[],
  llmCalls: [] as Array<{ system: string; user: string }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  brokenTables: [] as string[],
  reset() { state.rows = []; state.hotPayload = { items: [], sources: [] }; state.llmQueue = []; state.llmCalls = []; state.rpcCalls = []; state.brokenTables = [] },
  rowsOf(table: string) { return state.rows.filter(r => r.table === table).map(r => r.row) },
}))

vi.mock('@supabase/supabase-js', () => {
  type Row = Record<string, unknown>
  /** 真实表里有 default 的列（迁移 015）。fake 不补默认值的话，`ai_status = 'pending'` 这类
   *  过滤会全部落空——第一版就是因为这个把 wb_claim_items 测成了「永远领不到条目」。 */
  function withDefaults(table: string, p: Row): Row {
    const out: Row = { ...p }
    if (table === 'wb_hot_items') {
      if (out.ai_status == null) out.ai_status = 'pending'
      if (out.ai_retry == null) out.ai_retry = 0
      if (out.ai_tags == null) out.ai_tags = []
      if (out.event_id === undefined) out.event_id = null
      if (out.claimed_at === undefined) out.claimed_at = null
      if (out.fetched_at == null) out.fetched_at = new Date().toISOString()
    }
    if (table === 'wb_hot_events') {
      if (out.source_count == null) out.source_count = 0
      if (out.heat == null) out.heat = 0
      if (out.item_ids == null) out.item_ids = []
      if (out.category == null) out.category = '其他'
    }
    if (table === 'wb_digest_runs') {
      if (out.items_in == null) out.items_in = 0
      if (out.items_out == null) out.items_out = 0
      if (out.status == null) out.status = 'running'
    }
    return out
  }
  function makeClient(): SupabaseClient {
    const rowsOf = (table: string) => state.rows.filter(r => r.table === table).map(r => r.row)

    function from(table: string): Record<string, unknown> {
      type Pred = (r: Row) => boolean
      const preds: Pred[] = []
      const matched = () => rowsOf(table).filter(r => preds.every(p => p(r)))
      // 模拟「表不存在」：自检要靠它把「迁移没执行」和「代码有 bug」分开
      const tableErr = () => state.brokenTables.includes(table)
        ? { code: 'PGRST205', message: "Could not find the table 'public." + table + "' in the schema cache" }
        : null

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => { preds.push(r => r[c] === v); return builder },
        is: (c: string, v: unknown) => { preds.push(r => r[c] === v); return builder },
        in: (c: string, vs: unknown[]) => { preds.push(r => vs.includes(r[c])); return builder },
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve({ data: tableErr() ? null : (matched()[0] ?? null), error: tableErr() }),
        maybeSingle: () => Promise.resolve({ data: tableErr() ? null : (matched()[0] ?? null), error: tableErr() }),
        then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: tableErr() ? null : matched(), error: tableErr() }).then(res, rej),

        insert: (payload: Row | Row[]) => {
          const list = (Array.isArray(payload) ? payload : [payload]).map(r => withDefaults(table, r))
          for (const r of list) state.rows.push({ table, row: r })
          return { select: () => ({ single: () => Promise.resolve({ data: list[0] ?? null, error: null }) }) }
        },
        update: (payload: Row) => {
          const ok = () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }), then: (res?: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res) })
          return {
            eq: (c: string, v: unknown) => {
              for (const r of state.rows) if (r.table === table && r.row[c] === v) r.row = { ...r.row, ...payload }
              return ok()
            },
            // 批量放回 pending 用（enrichPending 的时间预算路径）
            in: (c: string, vs: unknown[]) => {
              for (const r of state.rows) if (r.table === table && vs.includes(r.row[c])) r.row = { ...r.row, ...payload }
              return ok()
            },
          }
        },
        upsert: (payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          const keys = (opts?.onConflict ?? '').split(',').map(s => s.trim()).filter(Boolean)
          const list = Array.isArray(payload) ? payload : [payload]
          const written: Row[] = []
          for (const p of list) {
            const hit = keys.length ? state.rows.find(r => r.table === table && keys.every(k => r.row[k] === p[k])) : undefined
            if (hit) {
              if (opts?.ignoreDuplicates) continue          // on conflict do nothing：不覆盖、也不算新增
              hit.row = { ...hit.row, ...p }
              written.push(hit.row)
            } else {
              const row = withDefaults(table, p)
              state.rows.push({ table, row })
              written.push(row)
            }
          }
          return { data: written, error: null, select: () => Promise.resolve({ data: written, error: null }), then: (res?: (v: unknown) => unknown) => Promise.resolve({ data: written, error: null }).then(res) }
        },
      }
      return builder
    }

    // rpc：wb_claim_items（原子领取）与 wb_match_events（事件召回）
    function rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
      state.rpcCalls.push({ fn, args })
      if (fn === 'wb_claim_items') {
        // 镜像迁移 015 的 SQL：pending，以及【陈旧的 processing 行】——函数被平台超时掐死后的兜底
        const limit = Number(args.p_limit ?? 20)
        const staleMins = Math.max(Number(args.p_stale_minutes ?? 15), 1)
        const staleBefore = Date.now() - staleMins * 60_000
        const picked = state.rows.filter(r => r.table === 'wb_hot_items' && r.row.user_id === args.p_user && (
          r.row.ai_status === 'pending'
          || (r.row.ai_status === 'processing' && r.row.claimed_at != null && Date.parse(String(r.row.claimed_at)) < staleBefore)
        )).slice(0, limit)
        for (const r of picked) r.row = { ...r.row, ai_status: 'processing', claimed_at: new Date().toISOString() }
        return Promise.resolve({ data: picked.map(r => r.row), error: null })
      }
      return Promise.resolve({ data: [], error: null })
    }

    const user = { id: 'u1' }
    return {
      from,
      rpc,
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        admin: { listUsers: async () => ({ data: { users: [user] }, error: null }) },
      },
    } as unknown as SupabaseClient
  }
  return { createClient: vi.fn(() => makeClient()) }
})

const realFetch = globalThis.fetch
beforeEach(() => {
  state.reset()
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/hot')) return new Response(JSON.stringify(state.hotPayload), { status: 200 })
    if (u.includes('/chat/completions')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string }> }
      const system = body.messages?.find(m => m.role === 'system')?.content ?? ''
      const userMsg = body.messages?.find(m => m.role === 'user')?.content ?? ''
      state.llmCalls.push({ system, user: userMsg })
      const next = state.llmQueue.shift() ?? '{"skip":false,"score":7,"summary":"摘要","category":"科技","tags":["ai"]}'
      return new Response(JSON.stringify({ choices: [{ message: { content: next } }] }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
})
afterEach(() => { globalThis.fetch = realFetch })

process.env.VITE_SUPABASE_URL = 'https://x.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
process.env.CRON_SECRET = 'cron-secret-1'
process.env.LLM_API_KEY = 'llm-key'
delete process.env.DIGEST_USER_ID

import handler from '../api/digest'

function makeReq(partial: Partial<VercelRequest>): VercelRequest {
  return { method: 'GET', url: '/api/digest', headers: { host: 'workbench.test' }, query: {}, ...partial } as VercelRequest
}
function makeRes() {
  const res = { statusCode: 200, body: null } as VercelResponse & { statusCode: number; body: unknown }
  res.status = (c: number) => { res.statusCode = c; return res }
  res.json = (b: unknown) => { res.body = b; return res }
  res.setHeader = () => res
  return res
}
const CRON = { authorization: 'Bearer cron-secret-1' }
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

describe('api/digest 入口', () => {
  it('未知 entry → 404；cron 入口缺密钥 → 401', async () => {
    const a = makeRes(); await handler(makeReq({ query: { entry: 'nope' } }), a as never)
    expect(a.statusCode).toBe(404)
    const b = makeRes(); await handler(makeReq({ query: { entry: 'enrich' } }), b as never)
    expect(b.statusCode).toBe(401)
    const c = makeRes(); await handler(makeReq({ query: { entry: 'build' }, headers: { authorization: 'Bearer wrong' } }), c as never)
    expect(c.statusCode).toBe(401)
  })

  it('enrich：抓取 → 落库 → 逐条摘要 → 聚簇 → 写运行日志', async () => {
    state.hotPayload = {
      items: [
        { title: 'AI 芯片产能翻番', source: 'hn', url: 'https://a.com/1?utm_source=x', category: 'tech' },
        { title: '国内模型调用量进前五', source: 'hn', url: 'https://a.com/2', category: 'tech' },
      ],
      sources: [{ id: 'hn', name: 'Hacker News', category: 'tech' }],
    }
    state.llmQueue = [
      '{"skip":false,"score":9,"summary":"芯片产能每 9 个月翻番。","category":"科技","tags":["#芯片"]}',
      '{"skip":false,"score":7,"summary":"前五均为中国模型。","category":"科技","tags":[]}',
    ]
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: { ...CRON } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { fetched: number; added: number; processed: number; clustered: number }
    expect(body).toMatchObject({ fetched: 2, added: 2, processed: 2, clustered: 2 })

    const items = state.rowsOf('wb_hot_items')
    expect(items).toHaveLength(2)
    expect(items[0].url_hash).toBe('https://a.com/1')       // 跟踪参数被归一化掉
    expect(items[0]).toMatchObject({ ai_status: 'done', ai_score: 9, ai_category: '科技' })
    expect(items[0].ai_tags).toEqual(['芯片'])               // 标签去掉 # 号
    expect(state.rowsOf('wb_hot_events')).toHaveLength(2)
    expect(items.every(i => typeof i.event_id === 'string')).toBe(true)
    const runs = state.rowsOf('wb_digest_runs')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ stage: 'enrich', status: 'ok', items_in: 2, items_out: 2 })

    // 事件召回【不传 p_embedding】：显式传 null 要 PostgREST 把 JSON null 转成 vector，
    // 多一层失败面，而这层失败会让整条 enrich 在条目已处理完之后才 500
    const matchCalls = state.rpcCalls.filter(c => c.fn === 'wb_match_events')
    expect(matchCalls.length).toBe(2)
    for (const c of matchCalls) expect(Object.keys(c.args)).toEqual(['p_user', 'p_title', 'p_days', 'p_limit'])
  })

  it('enrich 第二次：同一批条目 added=0，不再重复调模型（去重 = 不重复花钱）', async () => {
    state.hotPayload = {
      items: [{ title: '同一条', source: 'hn', url: 'https://a.com/9', category: 'tech' }],
      sources: [{ id: 'hn', name: 'HN', category: 'tech' }],
    }
    const first = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), first as never)
    expect((first.body as { added: number }).added).toBe(1)
    const callsAfterFirst = state.llmCalls.length

    const second = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), second as never)
    const body = second.body as { fetched: number; added: number; processed: number }
    expect(body.fetched).toBe(1)
    expect(body.added).toBe(0)          // on conflict (user_id, url_hash) do nothing
    expect(body.processed).toBe(0)      // 没有 pending 条目可领
    expect(state.llmCalls.length).toBe(callsAfterFirst)
    expect(state.rowsOf('wb_hot_items')).toHaveLength(1)
  })

  it('enrich：模型报错时条目回 pending 并累加 ai_retry，3 次后转 failed 且不再领取', async () => {
    state.hotPayload = { items: [{ title: '会失败', source: 'hn', url: 'https://a.com/3', category: 'tech' }], sources: [] }
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/hot')) return new Response(JSON.stringify(state.hotPayload), { status: 200 })
      return new Response('boom', { status: 500 })
    }) as unknown as typeof fetch

    for (let i = 1; i <= 3; i++) {
      const res = makeRes()
      await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
      const item = state.rowsOf('wb_hot_items')[0]
      expect(item.ai_retry).toBe(i)
      expect(item.ai_status).toBe(i >= 3 ? 'failed' : 'pending')
    }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
    expect((res.body as { processed: number }).processed).toBe(0)
  })

  it('build：当天没有事件时不产出日报，但记一条 ok 的运行日志（幂等、可观测）', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    expect((res.body as { built: boolean }).built).toBe(false)
    expect(state.rowsOf('wb_daily_reports')).toHaveLength(0)
    const runs = state.rowsOf('wb_digest_runs')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ stage: 'digest', status: 'ok', items_out: 0 })
  })

  it('build：按事件编排日报——分类与来源由代码填，模型只写文字', async () => {
    const d = today()
    state.rows.push({ table: 'wb_hot_items', row: { id: 'i1', user_id: 'u1', event_id: 'e1', source_name: '纽约时报', url: 'https://a.com/1', title: '芯片' } })
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 'AI 芯片产能翻番', category: '科技', heat: 9, item_ids: ['i1'], source_count: 1 } })
    // 模型偶尔会套 Markdown 围栏——解析前要能剥掉
    state.llmQueue = ['```json\n{"title":"算力加速","overview":"今天的主线是算力。","points":[{"eventId":"e1","point":"每 9 个月翻番。"}]}\n```']

    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ built: true, items: 1, sources: 1 })

    const reports = state.rowsOf('wb_daily_reports')
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ report_date: d, title: '算力加速', overview: '今天的主线是算力。', item_count: 1, source_count: 1 })
    expect(reports[0].sections).toEqual([{
      category: '科技',
      items: [{ eventId: 'e1', title: 'AI 芯片产能翻番', point: '每 9 个月翻番。', sources: [{ name: '纽约时报', url: 'https://a.com/1' }] }],
    }])
  })

  it('build：模型返回不可解析内容时报 500，不写半截日报', async () => {
    const d = today()
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 't', category: '科技', heat: 1, item_ids: [], source_count: 0 } })
    state.llmQueue = ['完全不是 JSON']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(500)
    expect(state.rowsOf('wb_daily_reports')).toHaveLength(0)
  })

  it('force：未登录 401；登录后可覆盖当日日报', async () => {
    const noAuth = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'force' }, headers: {} }), noAuth as never)
    expect(noAuth.statusCode).toBe(401)

    const d = today()
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 't', category: '科技', heat: 1, item_ids: [], source_count: 0 } })
    state.llmQueue = ['{"title":"重生成","overview":"o","points":[]}']
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'force' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, built: true })
    expect(state.rowsOf('wb_daily_reports')[0].title).toBe('重生成')
  })
  it('时间预算用尽：条目放回 pending 而不是卡在 processing（v1.27.2）', async () => {
    state.hotPayload = {
      items: [
        { title: 'A', source: 'hn', url: 'https://a.com/a', category: 'tech' },
        { title: 'B', source: 'hn', url: 'https://a.com/b', category: 'tech' },
      ],
      sources: [{ id: 'hn', name: 'HN', category: 'tech' }],
    }
    process.env.DIGEST_BUDGET_MS = '0'   // 预算为 0 = 只落库不处理
    try {
      const res = makeRes()
      await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
      expect(res.statusCode).toBe(200)
      const body = res.body as { added: number; processed: number; deferred: number }
      expect(body.added).toBe(2)         // 抓取落库照样做完了
      expect(body.processed).toBe(0)
      expect(body.deferred).toBe(2)
      // 关键：没处理的必须回到 pending，否则只挑 pending 的 wb_claim_items 再也领不到它们
      const items = state.rowsOf('wb_hot_items')
      expect(items.every(i => i.ai_status === 'pending')).toBe(true)
      expect(items.every(i => i.claimed_at === null)).toBe(true)
    } finally { delete process.env.DIGEST_BUDGET_MS }
  })

  it('陈旧 processing 行会被重新领取（函数被平台超时掐死后的兜底）', async () => {
    const stale = new Date(Date.now() - 30 * 60_000).toISOString()
    state.hotPayload = { items: [], sources: [] }
    state.rows.push({ table: 'wb_hot_items', row: { id: 'stuck', user_id: 'u1', title: '上次卡住的', source_name: 'HN', url: 'https://a.com/x', ai_status: 'processing', claimed_at: stale } })
    state.rows.push({ table: 'wb_hot_items', row: { id: 'fresh', user_id: 'u1', title: '正在处理中', source_name: 'HN', url: 'https://a.com/y', ai_status: 'processing', claimed_at: new Date().toISOString() } })
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
    expect((res.body as { processed: number }).processed).toBe(1)   // 只捞回陈旧那条
    const rows = state.rowsOf('wb_hot_items')
    expect(rows.find(r => r.id === 'stuck')!.ai_status).toBe('done')
    expect(rows.find(r => r.id === 'fresh')!.ai_status).toBe('processing')  // 正常在跑的不能被抢
  })

  it('selftest：全绿时逐项 ok，且不回显任何密钥内容', async () => {
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }
    expect(body.ok).toBe(true)
    expect(body.checks.map(c => c.name)).toEqual(['环境变量', '数据库表', '归属用户', '热榜抓取', '模型连通'])
    expect(body.checks.every(c => c.ok)).toBe(true)
    // 只报「已配置 + 长度」，绝不回显 key 本身
    const env = body.checks[0].detail
    expect(env).toContain('llm-key'.length + ' 字符')
    expect(env).not.toContain(process.env.LLM_API_KEY!)
  })

  it('selftest：迁移没执行时明确指向迁移，而不是让人去猜代码', async () => {
    state.brokenTables = ['wb_daily_reports']
    // 抓取这条要单独给数据，否则「0 条」本身就会被判成 not ok，混掉本用例的焦点
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const body = res.body as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }
    expect(body.ok).toBe(false)
    const db = body.checks.find(c => c.name === '数据库表')!
    expect(db.ok).toBe(false)
    expect(db.detail).toContain('wb_daily_reports')
    expect(db.detail).toContain('迁移 015')
    // 一项失败不影响其余项继续检查
    expect(body.checks.find(c => c.name === '热榜抓取')!.ok).toBe(true)
  })

  it('selftest：热榜返回 0 条时也要标出来（说明抓取链路有上游问题，跑 enrich 会空转）', async () => {
    state.hotPayload = { items: [], sources: [] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const body = res.body as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }
    const hot = body.checks.find(c => c.name === '热榜抓取')!
    expect(hot.ok).toBe(false)
    expect(hot.detail).toContain('0 条')
  })

  it('selftest：没配模型 Key 时只跳过模型那一项，其余照常报', async () => {
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    const saved = process.env.LLM_API_KEY
    delete process.env.LLM_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    try {
      const res = makeRes()
      await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
      const body = res.body as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }
      expect(body.ok).toBe(false)
      expect(body.checks.find(c => c.name === '环境变量')!.detail).toContain('LLM_API_KEY')
      expect(body.checks.some(c => c.name === '模型连通')).toBe(false)   // 没 key 就不调，避免必然失败的一次外呼
      expect(body.checks.find(c => c.name === '数据库表')!.ok).toBe(true)
    } finally { process.env.LLM_API_KEY = saved }
  })

  it('selftest：没有 CRON_SECRET 一律 401', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: {} }), res as never)
    expect(res.statusCode).toBe(401)
  })

})
