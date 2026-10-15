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
  // 注入一个 PostgREST 风格的【普通对象】错误：它故意不是 Error 实例，
  // 因为老代码正是用 `instanceof Error` 判断、把真正的原因吞成了 internal error（v1.28.5）
  rpcError: null as null | { code: string; message: string },
  llmBodies: [] as Array<Record<string, unknown>>,
  // 注入 finish_reason：用来复现「额度被思考吃光 → 输出截断」（v1.28.6）
  llmFinishReason: null as string | null,
  extraUsers: 0,   // 让 listUsers 多返回几个用户，测「归属用户可能选错」的告警
  reset() { state.rows = []; state.hotPayload = { items: [], sources: [] }; state.llmQueue = []; state.llmCalls = []; state.rpcCalls = []; state.brokenTables = []; state.rpcError = null; state.llmBodies = []; state.llmFinishReason = null; state.extraUsers = 0 },
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
      // Postgres 把空串当非法 uuid：eq("user_id", "") 在真库上必然 22P02。
      // 替身不模拟这一条，force 入口把 "" 当 user_id 送进数据库的 bug 就永远测不出来（v1.28.7）。
      let badUuid = false
      const dbErr = () => badUuid
        ? { code: '22P02', message: 'invalid input syntax for type uuid: ""' }
        : tableErr()

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => { preds.push(r => r[c] === v); if (c === 'user_id' && v === '') badUuid = true; return builder },
        is: (c: string, v: unknown) => { preds.push(r => r[c] === v); return builder },
        in: (c: string, vs: unknown[]) => { preds.push(r => vs.includes(r[c])); return builder },
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve({ data: dbErr() ? null : (matched()[0] ?? null), error: dbErr() }),
        maybeSingle: () => Promise.resolve({ data: dbErr() ? null : (matched()[0] ?? null), error: dbErr() }),
        then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: dbErr() ? null : matched(), error: dbErr() }).then(res, rej),

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
          const err = dbErr()   // 表不存在时，upsert 同样会报错（自检之外的失败路径也要能造出来）
          return { data: err ? null : written, error: err, select: () => Promise.resolve({ data: err ? null : written, error: err }), then: (res?: (v: unknown) => unknown) => Promise.resolve({ data: err ? null : written, error: err }).then(res) }
        },
      }
      return builder
    }

    // rpc：wb_claim_items（原子领取）与 wb_match_events（事件召回）
    function rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }> {
      state.rpcCalls.push({ fn, args })
      if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError })
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
        // 忠实于真库：只有【显式传 token】才拿得到用户。persistSession: false 的客户端没有 session，
        // 不带参数调 getUser() 只会得到 null——force 入口正是栽在这里（旧代码 ?? '' → 22P02）
        getUser: async (token?: string) => token
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } },
        admin: { listUsers: async () => ({ data: { users: [user, ...Array.from({ length: state.extraUsers }, (_, i) => ({ id: 'u' + (i + 2) }))] }, error: null }) },
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
    // Telegram getMe（自检只校验 Token，不发消息）
    if (u.includes('api.telegram.org')) return new Response(JSON.stringify({ ok: true, result: { username: 'moyanwushangbot' } }), { status: 200 })
    if (u.includes('/chat/completions')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string }> }
      const system = body.messages?.find(m => m.role === 'system')?.content ?? ''
      const userMsg = body.messages?.find(m => m.role === 'user')?.content ?? ''
      state.llmBodies.push(body as Record<string, unknown>)
      state.llmCalls.push({ system, user: userMsg })
      const next = state.llmQueue.shift() ?? '{"skip":false,"score":7,"summary":"摘要","category":"科技","tags":["ai"]}'
      const fields: Record<string, unknown> = { message: { content: next } }
      if (state.llmFinishReason) fields.finish_reason = state.llmFinishReason
      return new Response(JSON.stringify({ choices: [fields] }), { status: 200 })
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

  it('摘要吃满自己的份额后，聚簇仍然能建事件（否则 build 只能产出空日报）', async () => {
    // 预算 0 → 摘要阶段立即到期、全部顺延；此时没有 done 条目可聚，clustered 应为 0。
    // 这条守的是「两段预算互不侵占」：摘要到期不等于聚簇也到期。
    state.hotPayload = { items: [{ title: 'A', source: 'hn', url: 'https://a.com/a', category: 'tech' }], sources: [] }
    process.env.DIGEST_BUDGET_MS = '0'
    try {
      const res = makeRes()
      await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
      const body = res.body as { processed: number; clustered: number }
      expect(body.processed).toBe(0)
      expect(body.clustered).toBe(0)
      // 条目还在队列里，没有变成「done 但无事件」的孤儿状态
      expect(state.rowsOf('wb_hot_items')[0].ai_status).toBe('pending')
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
    expect(body.checks.map(c => c.name)).toEqual(['环境变量', '数据库表', '归属用户', 'Telegram', '热榜抓取', '模型连通'])
    // 没配 Telegram 时是「可选、未配置」而不是失败——可选功能不该把整个自检拖红
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

  it('selftest：模型只回空正文也算连通（思考模式会吃满 token 额度——线上实测踩到过）', async () => {
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    state.llmQueue = ['']            // 2xx 但 content 为空
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const body = res.body as { ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string }> }
    const m = body.checks.find(c => c.name === '模型连通')!
    expect(m.ok).toBe(true)          // 判据是「通不通」，不是「有没有正文」
    expect(m.detail).toContain('未返回正文')
    expect(body.ok).toBe(true)
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

  it('enrich 失败时回传真正的原因与失败阶段，而不是一句 internal error（v1.28.5）', async () => {
    // 伪装 PostgREST 的错误对象：它是普通对象、【不是】Error 实例，
    // 正是老代码 `err instanceof Error ? err.message : 'internal error'` 吞掉原因的地方。
    // 线上真实发生过：wb_claim_items 写 'processing' 撞上 015 的 CHECK 约束，稳定 500 却查不出原因。
    state.rpcError = { code: '23514', message: 'new row for relation "wb_hot_items" violates check constraint "wb_hot_items_ai_status_check"' }
    state.hotPayload = { items: [{ title: 'A', source: 'hn', url: 'https://a.com/a', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(500)
    const body = res.body as { ok: boolean; stage: string; error: string }
    expect(body.ok).toBe(false)
    expect(body.stage).toBe('enrich-items')            // 一眼看出是哪一段炸的
    expect(body.error).toContain('check constraint')   // 真正的原因没有被吞掉
    expect(body.error).toContain('code=23514')
    expect(body.error).not.toBe('internal error')
  })

  it('落库阶段失败时 stage 指向 persist-items，不会误报成别的段', async () => {
    state.brokenTables.push('wb_hot_items')
    state.hotPayload = { items: [{ title: 'A', source: 'hn', url: 'https://a.com/a', category: 'tech' }], sources: [] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'enrich' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(500)
    const body = res.body as { stage: string; error: string }
    expect(body.stage).toBe('persist-items')
    expect(body.error).toContain('wb_hot_items')
  })

  it('模型输出被截断时报「截断」，而不是含糊的「无法解析」（v1.28.6）', async () => {
    // 线上实测：18 条真实标题在 max_tokens=2000 下 reasoning 吃掉 1925，正文只剩 100 出头，
    // finish_reason=length。老代码把半截 JSON 交给 parseLlmJson，只说「无法解析」——
    // 真正的原因（额度不够）被这层措辞盖住了整整一轮排查。
    state.llmFinishReason = 'length'
    const d = today()
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 't', category: '科技', heat: 1, item_ids: [], source_count: 0 } })
    state.llmQueue = ['{"title":"半截']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(500)
    const body = res.body as { error: string }
    expect(body.error).toContain('截断')
    expect(body.error).toContain('max_tokens')
    expect(body.error).not.toContain('无法解析')
    expect(state.rowsOf('wb_daily_reports')).toHaveLength(0)
  })

  it('默认给 DeepSeek 发 thinking=disabled，把额度全留给正文（v1.28.6）', async () => {
    const d = today()
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 'AI 芯片', category: '科技', heat: 9, item_ids: [], source_count: 0 } })
    state.llmQueue = ['{"title":"t","overview":"o","points":[]}']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    expect(state.llmBodies.length).toBeGreaterThan(0)
    expect(state.llmBodies[0].thinking).toEqual({ type: 'disabled' })
    expect(state.llmBodies[0].response_format).toEqual({ type: 'json_object' })
    expect(Number(state.llmBodies[0].max_tokens)).toBeGreaterThanOrEqual(4000)
  })

  it('自检在库里有多个用户时告警——日报可能写到你看不到的账号下（v1.28.7）', async () => {
    // resolveUserId 没配 DIGEST_USER_ID 时取「库里的第一个用户」，它未必是应用里登录的那个。
    // 写错账号的表现极具迷惑性：日报真的生成了，前端却被 RLS 过滤掉，只显示「还没有日报」。
    state.extraUsers = 1
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const checks = (res.body as { checks: Array<{ name: string; detail: string }> }).checks
    const detail = checks.find(c => c.name === '归属用户')!.detail
    expect(detail).toContain('2 个用户')
    expect(detail).toContain('DIGEST_USER_ID')
    expect(detail).toContain('库里的第一个用户')
  })

  it('编排时把 enrich 已经生成的摘要一起喂给模型（v1.29）', async () => {
    // 线上首版日报「信息太少」的主因：payload 里只有 title + category，模型看不到任何内容，
    // 只能拿标题硬编要点。而这两三句摘要 enrich 阶段早就生成好、也早就付过钱了。
    const d = today()
    state.rows.push({ table: 'wb_hot_items', row: { id: 'i1', user_id: 'u1', event_id: 'e1', source_name: 'HN', url: 'https://a.com/1', title: '芯片', ai_summary: '这家公司把产能翻了一番，明年一季度量产。', ai_score: 9 } })
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: 'AI 芯片产能翻番', category: '科技', heat: 9, item_ids: ['i1'], source_count: 1 } })
    state.llmQueue = ['{"title":"t","overview":"o","points":[]}']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    const sent = JSON.parse(state.llmCalls.at(-1)!.user) as Array<{ eventId: string; title: string; summary: string }>
    expect(sent[0].summary).toContain('产能翻了一番')
  })

  it('同一事件有多条摘要时，取 ai_score 最高的那条送给模型（v1.29）', async () => {
    const d = today()
    state.rows.push({ table: 'wb_hot_items', row: { id: 'i1', user_id: 'u1', event_id: 'e1', source_name: 'A', url: 'https://a.com/1', title: 'a', ai_summary: '次要来源的说法。', ai_score: 2 } })
    state.rows.push({ table: 'wb_hot_items', row: { id: 'i2', user_id: 'u1', event_id: 'e1', source_name: 'B', url: 'https://a.com/2', title: 'b', ai_summary: '主要来源的说法。', ai_score: 9 } })
    state.rows.push({ table: 'wb_hot_events', row: { id: 'e1', user_id: 'u1', event_date: d, title: '事件', category: '科技', heat: 5, item_ids: ['i1', 'i2'], source_count: 2 } })
    state.llmQueue = ['{"title":"t","overview":"o","points":[]}']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    const sent = JSON.parse(state.llmCalls.at(-1)!.user) as Array<{ summary: string }>
    expect(sent[0].summary).toContain('主要来源的说法')
  })

  it('重点关注分类（科技）用更宽的配额，其他分类维持 4 条上限（v1.29）', async () => {
    // 热榜约 85% 是科技/AI，统一按 4 条切的话砍掉的正好是最想看的那块。
    const d = today()
    for (let i = 0; i < 6; i++) {
      state.rows.push({ table: 'wb_hot_events', row: { id: 't' + i, user_id: 'u1', event_date: d, title: '科技' + i, category: '科技', heat: 20 - i, item_ids: [], source_count: 0 } })
      state.rows.push({ table: 'wb_hot_events', row: { id: 'f' + i, user_id: 'u1', event_date: d, title: '财经' + i, category: '财经', heat: 10 - i, item_ids: [], source_count: 0 } })
    }
    state.llmQueue = ['{"title":"t","overview":"o","points":[]}']
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'build' }, headers: CRON }), res as never)
    expect(res.statusCode).toBe(200)
    const sections = state.rowsOf('wb_daily_reports')[0].sections as Array<{ category: string; items: unknown[] }>
    expect(sections.find(s => s.category === '科技')!.items).toHaveLength(6)   // 6 < 12，全进
    expect(sections.find(s => s.category === '财经')!.items).toHaveLength(4)   // 撞上默认 4 条上限
  })

  it('自检报出 Telegram 配置状态：没配是「可选」而非失败（v1.29.1）', async () => {
    // 可选功能配错了要在自检里看得见，否则只有等到某条提醒该发而没发时才发现。
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [{ id: 'hn', name: 'HN', category: 'tech' }] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const tg = (res.body as { checks: Array<{ name: string; ok: boolean; detail: string }> }).checks.find(c => c.name === 'Telegram')!
    expect(tg.ok).toBe(true)
    expect(tg.detail).toContain('未配置')
  })

  it('自检：Token 与 Chat ID 只填了一半 → 判失败并说清两个都要（v1.29.1）', async () => {
    state.rows.push({ table: 'wb_channel_configs', row: { user_id: 'u1', telegram_bot_token: '123:abc', telegram_chat_id: '' } })
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const tg = (res.body as { checks: Array<{ name: string; ok: boolean; detail: string }> }).checks.find(c => c.name === 'Telegram')!
    expect(tg.ok).toBe(false)
    expect(tg.detail).toContain('只填了一个')
  })

  it('自检：配置齐了就用 getMe 校验 Token，并报出 Bot 用户名（v1.29.1）', async () => {
    state.rows.push({ table: 'wb_channel_configs', row: { user_id: 'u1', telegram_bot_token: '123:abc', telegram_chat_id: '999' } })
    state.hotPayload = { items: [{ title: 'x', source: 'hn', url: 'https://a.com/1', category: 'tech' }], sources: [] }
    const res = makeRes()
    await handler(makeReq({ query: { entry: 'selftest' }, headers: CRON }), res as never)
    const tg = (res.body as { checks: Array<{ name: string; ok: boolean; detail: string }> }).checks.find(c => c.name === 'Telegram')!
    expect(tg.ok).toBe(true)
    expect(tg.detail).toContain('@moyanwushangbot')
  })

})
