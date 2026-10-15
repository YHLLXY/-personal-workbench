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
  reset() { state.rows = []; state.hotPayload = { items: [], sources: [] }; state.llmQueue = []; state.llmCalls = [] },
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

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => { preds.push(r => r[c] === v); return builder },
        is: (c: string, v: unknown) => { preds.push(r => r[c] === v); return builder },
        in: (c: string, vs: unknown[]) => { preds.push(r => vs.includes(r[c])); return builder },
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
        maybeSingle: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
        then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: matched(), error: null }).then(res, rej),

        insert: (payload: Row | Row[]) => {
          const list = (Array.isArray(payload) ? payload : [payload]).map(r => withDefaults(table, r))
          for (const r of list) state.rows.push({ table, row: r })
          return { select: () => ({ single: () => Promise.resolve({ data: list[0] ?? null, error: null }) }) }
        },
        update: (payload: Row) => ({
          eq: (c: string, v: unknown) => {
            for (const r of state.rows) if (r.table === table && r.row[c] === v) r.row = { ...r.row, ...payload }
            return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }), then: (res?: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res) }
          },
        }),
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
      if (fn === 'wb_claim_items') {
        const limit = Number(args.p_limit ?? 20)
        const picked = state.rows.filter(r => r.table === 'wb_hot_items' && r.row.user_id === args.p_user && r.row.ai_status === 'pending').slice(0, limit)
        for (const r of picked) r.row = { ...r.row, ai_status: 'processing' }
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
})
