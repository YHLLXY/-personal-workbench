import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---- mock @supabase/supabase-js：createClient 返回内存 fake ----
interface FakeRow { table: string; row: Record<string, unknown> }
const state = vi.hoisted(() => ({
  rows: [] as FakeRow[],
  sent: [] as Array<{ endpoint: string; payload: unknown }>,
  pushErrors: [] as Array<{ endpoint: string; error: unknown }>,
  fetchCalls: [] as Array<{ url: string; body?: string }>,
  fetchResults: [] as Array<{ status?: number; body?: string }>,
  // 重置
  reset() {
    state.rows = []
    state.sent = []
    state.pushErrors = []
    state.fetchCalls = []
    state.fetchResults = []
  },
  insert(table: string, row: Record<string, unknown>) { state.rows.push({ table, row }) },
}))

function makeFakeClient(_headers?: Record<string, string>): SupabaseClient {
  const from = (table: string) => {
    // select 返回可 await 的 thenable 链：直接 await 得 { data, error }；支持 order/single/maybeSingle/lte/is 链
    const makeChain = () => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const rows = () => state.rows.filter(r => r.table === table).map(r => r.row).filter(row => filters.every(f => f(row)))
      const chain = {
        order: vi.fn(() => Promise.resolve({ data: rows(), error: null })),
        single: vi.fn(() => Promise.resolve({ data: rows()[0] ?? null, error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: rows()[0] ?? null, error: null })),
        // lte 真实 ISO 字符串比较（scheduled_at 为 ISO 字符串，字典序即时间序）；is 按列值过滤
        lte: vi.fn((col: string, val: unknown) => { filters.push(row => String(row[col]) <= String(val)); return chain }),
        is: vi.fn((col: string, val: unknown) => { filters.push(row => row[col] === val); return chain }),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected),
      }
      return chain
    }
    return {
      select: vi.fn(makeChain),
      insert: vi.fn((rows: unknown[]) => { (Array.isArray(rows) ? rows : [rows]).forEach(r => state.insert(table, r as Record<string, unknown>)); return Promise.resolve({ error: null }) }),
      // update 真实应用 payload：eq 按列值匹配并把 payload 合并进命中行（供断言 sent_at）
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn((col: string, val: unknown) => {
          for (const r of state.rows) if (r.table === table && String(r.row[col]) === String(val)) r.row = { ...r.row, ...payload }
          return Promise.resolve({ error: null })
        }),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn((col: string, val: unknown) => {
          state.rows = state.rows.filter(r => !(r.table === table && r.row[col] === val))
          return Promise.resolve({ error: null })
        }),
        // v1.31：runCheck 用 .delete().in('id', ids) 批量清孤儿行
        in: vi.fn((col: string, vals: unknown[]) => {
          const set = new Set(vals.map(String))
          state.rows = state.rows.filter(r => !(r.table === table && set.has(String(r.row[col]))))
          return Promise.resolve({ error: null })
        }),
      })),
      upsert: vi.fn((rows: unknown[]) => { (Array.isArray(rows) ? rows : [rows]).forEach(r => state.insert(table, r as Record<string, unknown>)); return Promise.resolve({ error: null }) }),
      lte: vi.fn(() => Promise.resolve({ data: [], error: null })),
      is: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
  }
  return { from, auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) } } as unknown as SupabaseClient
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((_url: string, _key: string, opts?: { global?: { headers?: Record<string, string> } }) =>
    makeFakeClient(opts?.global?.headers)),
}))

// ---- mock web-push（实现按真实 API 传订阅对象，这里归一化出 endpoint 用于断言/410 匹配） ----
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn((subOrEndpoint: string | { endpoint: string }, payload: string) => {
      const endpoint = typeof subOrEndpoint === 'string' ? subOrEndpoint : subOrEndpoint.endpoint
      const err = state.pushErrors.find(e => e.endpoint === endpoint)
      if (err) return Promise.reject(err.error)
      state.sent.push({ endpoint, payload })
      return Promise.resolve({})
    }),
  },
}))

// ---- mock global fetch（Server酱通道） ----
const realFetch = globalThis.fetch
beforeEach(() => {
  state.reset()
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    state.fetchCalls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : undefined })
    // 默认模拟 Server酱成功（{"code":0}）；测试可通过 state.fetchResults 指定 status/body（如非 0 code）
    const mockRes = state.fetchResults.shift() ?? {}
    return new Response(mockRes.body ?? '{"code":0}', { status: mockRes.status ?? 200 })
  }) as unknown as typeof fetch
})
afterEach(() => { globalThis.fetch = realFetch })

// 环境变量：Vite 构建内联的 VITE_* 在函数里用 process.env 读取，这里直接设
const VITE_URL = 'https://x.supabase.co'
const VITE_ANON = 'anon-key'
const SERVICE_KEY = 'service-role-key'
const CRON_SECRET = 'cron-secret-1'
const VAPID_PUB = 'Bpub'
const VAPID_PRIV = 'priv'
process.env.VITE_SUPABASE_URL = VITE_URL
process.env.VITE_SUPABASE_ANON_KEY = VITE_ANON
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
process.env.CRON_SECRET = CRON_SECRET
process.env.VITE_VAPID_PUBLIC_KEY = VAPID_PUB
process.env.VAPID_PRIVATE_KEY = VAPID_PRIV

import handler from '../api/reminders'

function makeReq(partial: Partial<VercelRequest>): VercelRequest {
  return { method: 'GET', url: '/api/check-reminders', headers: {}, query: {}, ...partial } as VercelRequest
}
function makeRes() {
  const res: VercelResponse & { statusCode: number; body: unknown } = { statusCode: 200, body: null } as never
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  res.setHeader = () => res
  return res
}

describe('api/reminders 入口', () => {
  it('cron：无/错误密钥 → 401', async () => {
    const res1 = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: {} }), res1 as never)
    expect(res1.statusCode).toBe(401)
    const res2 = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: { authorization: 'Bearer wrong' } }), res2 as never)
    expect(res2.statusCode).toBe(401)
  })

  it('cron：正确密钥 → 生成并插入新提醒，返回 created 数', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-08-08', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r0', user_id: 'u1', ref_type: 'task', ref_id: 't9', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, created_at: '2026-08-08T00:00:00.000Z' }) // 孤儿行：t9 已不存在
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: { authorization: `Bearer ${CRON_SECRET}` } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { ok: boolean; created: number; removed: number }
    expect(body.ok).toBe(true)
    expect(body.created).toBe(1) // t1 的 due 节点新增
    expect(body.removed).toBe(1) // 引用对象已消失的孤儿行被删
    expect(state.rows.some(r => r.table === 'wb_reminders' && r.row.ref_type === 'task' && r.row.ref_id === 't1')).toBe(true)
    expect(state.rows.some(r => r.table === 'wb_reminders' && r.row.id === 'r0')).toBe(false)
  })

  it('cron：重复触发幂等（created 为 0）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-08-08', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, created_at: '2026-08-08T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: { authorization: `Bearer ${CRON_SECRET}` } }), res as never)
    const body = res.body as { created: number; updated: number; removed: number }
    expect(body.created).toBe(0)
    expect(body.updated).toBe(0)
    expect(body.removed).toBe(0)
  })

  it('check：无 JWT → 401；有效 JWT → 返回 reminders 与 vapidPublicKey', async () => {
    const res401 = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: {} }), res401 as never)
    expect(res401.statusCode).toBe(401)
    // 提醒行必须有一个「活着」的引用对象，否则会被 runCheck 当孤儿行删掉（v1.31）
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { reminders: Array<Record<string, unknown>>; vapidPublicKey: string }
    expect(Array.isArray(body.reminders)).toBe(true)
    // 行已映射为前端 Reminder 的 camelCase 形状（云端模式内层依赖此形状，snake_case 会导致 countUnread 恒 0 / 列表全显「已删除」）
    const first = body.reminders[0] as Record<string, unknown>
    expect(first).toHaveProperty('refType', 'task')
    expect(first).toHaveProperty('refId', 't1')
    expect(first).toHaveProperty('scheduledAt')
    expect(first).not.toHaveProperty('dismissedAt') // v1.31：忽略态整体移除
    expect(first).not.toHaveProperty('ref_type')
    expect(first).not.toHaveProperty('scheduled_at')
    expect(body.vapidPublicKey).toBe(VAPID_PUB)
  })

  it('check：到期未发提醒 → 调用 web-push 发送并标记 sent_at（410 过期订阅被删除）', async () => {
    const { default: webpush } = await import('web-push')
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 'test', created_at: '2026-01-01T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect(state.sent.length).toBe(1)
    expect(state.sent[0].endpoint).toBe('https://push.example/1')
    expect(JSON.parse(String(state.sent[0].payload))).toMatchObject({ title: '个人工作台提醒', url: '/reminders' })
    // 真实送达 → sent_at 已标记（ISO 字符串）
    const sentRow = state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')
    expect(sentRow).toBeDefined()
    expect(sentRow?.row.sent_at).toBeTruthy()

    // 过期订阅（410）→ 删除该行；未送达 → sent_at 不标记
    state.reset()
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's2', user_id: 'u1', endpoint: 'https://push.example/410', keys_p256dh: 'p', keys_auth: 'a', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    state.pushErrors.push({ endpoint: 'https://push.example/410', error: { statusCode: 410 } })
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(state.rows.some(r => r.table === 'wb_push_subscriptions' && String(r.row.endpoint).includes('410'))).toBe(false)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeNull()
    expect(webpush.setVapidDetails).toHaveBeenCalled()
  })

  it('check：未来提醒不发送（scheduled_at 在 now 之后，lte 过滤）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2099-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2099-01-01T01:30:00.000Z', sent_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect(state.sent.length).toBe(0)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeNull()
  })

  it('check：任务已完成 → 到期提醒行被删除（v1.31：不再 skipped 保留等人点「忽略」）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '已完成', status: 'done', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { sent: number; skipped: number; removed: number }
    expect(body.removed).toBe(1)
    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(0)
    expect(state.sent.length).toBe(0) // 未调用 web-push
    expect(state.rows.some(r => r.table === 'wb_reminders' && r.row.id === 'r1')).toBe(false) // 行已消失
  })

  it('check：推送非 410/404 错误 → skipped，sent_at 不标记（下次可补发）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/500', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    state.pushErrors.push({ endpoint: 'https://push.example/500', error: { statusCode: 500 } })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { sent: number; skipped: number }
    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(state.rows.some(r => r.table === 'wb_push_subscriptions')).toBe(true) // 非 410/404 不删除订阅
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeNull()
  })

  it('check：Server酱 返回非 0 code → skipped，sent_at 不标记', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', serverchan_key: 'SCU123' })
    state.fetchResults.push({ status: 200, body: '{"code":400}' }) // HTTP 200 但 code 非 0 → 失败
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { sent: number; skipped: number }
    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeNull()
  })

  it('check：改了任务的提醒时间 → 已有行 update 到新时刻（v1.31 回归：旧版按 key 去重，改时间永远不生效）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2099-01-02', due_time: '18:00', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2099-01-02T01:30:00.000Z', sent_at: null, created_at: '2026-08-08T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { created: number; updated: number }
    expect(body.created).toBe(0)
    expect(body.updated).toBe(1)
    // 2099-01-02 18:00 上海 = 10:00 UTC
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.scheduled_at).toBe('2099-01-02T10:00:00.000Z')
  })

  it('check：新建一个已经过期的提醒节点 → 直接标记已发送，不补发历史通知', async () => {
    state.insert('wb_tasks', { id: 't1', title: '补录的旧任务', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { created: number; sent: number }
    expect(body.created).toBe(1)
    expect(body.sent).toBe(0)
    expect(state.sent.length).toBe(0)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.ref_id === 't1')?.row.sent_at).toBeTruthy()
  })

  it('test-notify：向本人通道发送测试通知', async () => {
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-08-08T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', serverchan_key: 'SCU123' })
    state.fetchResults.push({ status: 200, body: '{"code":0}' }) // Server酱
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'test' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect((res.body as { sent: number }).sent).toBe(2) // web push 1 + serverchan 1
    expect(state.fetchCalls.some(c => c.url.includes('SCU123'))).toBe(true)
  })

  // —— v1.26 Telegram 通道 ——

  it('check：配置了 Telegram 时同时推送，成功才标记 sent_at', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"message_id":1}}' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect((res.body as { sent: number }).sent).toBe(1)
    const call = state.fetchCalls.find(c => c.url.includes('api.telegram.org'))
    // 端点按 token 拼、正文走 JSON（parse_mode HTML 避免 Markdown 转义坑）
    expect(call?.url).toBe('https://api.telegram.org/bot123:ABC/sendMessage')
    expect(call?.body).toContain('"chat_id":"456"')
    expect(call?.body).toContain('"parse_mode":"HTML"')
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).not.toBeNull()
  })

  it('check：Telegram 返回 ok:false（如 chat not found）→ skipped，sent_at 不标记', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    state.fetchResults.push({ status: 400, body: '{"ok":false,"description":"chat not found"}' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { sent: number; skipped: number }
    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeNull()
  })

  it('telegram-test：Token 无效 → step=token（UI 据此提示「Bot Token 有误」）', async () => {
    state.fetchResults.push({ status: 401, body: '{"ok":false,"description":"Unauthorized"}' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'telegram-test' }, headers: { authorization: 'Bearer jwt-1' }, body: { botToken: 'bad', chatId: '456' } } as never), res as never)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: false, step: 'token', error: 'Unauthorized' })
    expect(state.fetchCalls.filter(c => c.url.includes('sendMessage')).length).toBe(0)
  })

  it('telegram-test：Token 通过但 Chat ID 错 → step=chat', async () => {
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"username":"my_bot"}}' })
    state.fetchResults.push({ status: 400, body: '{"ok":false,"description":"chat not found"}' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'telegram-test' }, headers: { authorization: 'Bearer jwt-1' }, body: { botToken: '123:ABC', chatId: '000' } } as never), res as never)
    expect(res.body).toMatchObject({ ok: false, step: 'chat', botUsername: 'my_bot' })
  })

  it('telegram-test：全部通过 → ok + botUsername，且未登录返回 401', async () => {
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"username":"my_bot"}}' })
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"message_id":1}}' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'telegram-test' }, headers: { authorization: 'Bearer jwt-1' }, body: { botToken: '123:ABC', chatId: '456' } } as never), res as never)
    expect(res.body).toMatchObject({ ok: true, botUsername: 'my_bot' })
    const noAuth = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'telegram-test' }, headers: {} } as never), noAuth as never)
    expect(noAuth.statusCode).toBe(401)
  })

  // —— v1.32：补发窗口 + 通道级记账 ——

  /** 上海时区的「N 分钟前」→ { dueDate, dueTime }（服务端按 +8 固定偏移解析，与机器时区无关） */
  function recentDue(minutesAgo: number): { dueDate: string; dueTime: string } {
    const d = new Date(Date.now() + 8 * 3600_000 - minutesAgo * 60_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return { dueDate: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, dueTime: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` }
  }

  it('check：首次扫描晚于到期 5 分钟 → 仍然补发（v1.31 回归：这种情况会被永久静默）', async () => {
    const { dueDate, dueTime } = recentDue(5)
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: dueDate, due_time: dueTime, user_id: 'u1' })
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"message_id":1}}' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { created: number; sent: number }
    expect(body.created).toBe(1)
    expect(body.sent).toBe(1)
    // 迟到超过 5 分钟 → 文案里说明这是补发，别让人以为是刚发生的
    expect(state.fetchCalls.find(c => c.url.includes('api.telegram.org'))?.body).toContain('（补发）')
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.ref_id === 't1')?.row.sent_at).toBeTruthy()
  })

  it('check：迟到超过补发窗口（12 小时）→ 只当历史，不补发', async () => {
    const { dueDate, dueTime } = recentDue(13 * 60)
    state.insert('wb_tasks', { id: 't1', title: '很久以前的任务', status: 'todo', due_date: dueDate, due_time: dueTime, user_id: 'u1' })
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { created: number; sent: number }
    expect(body.created).toBe(1)
    expect(body.sent).toBe(0)
    expect(state.fetchCalls.filter(c => c.url.includes('api.telegram.org')).length).toBe(0)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.ref_id === 't1')?.row.sent_at).toBeTruthy()
  })

  it('check：推送成功、Telegram 失败 → sent_at 不写；下一轮只补发 Telegram（推送不重发）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-01-01T01:30:00.000Z', sent_at: null, created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p', keys_auth: 'a', user_agent: 't', created_at: '2026-01-01T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    state.fetchResults.push({ status: 400, body: '{"ok":false,"description":"chat not found"}' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { sent: number; skipped: number }
    expect(body.sent).toBe(1) // 只有推送送达
    expect(body.skipped).toBe(1) // 这一行没送齐
    const row = state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row
    expect(row?.sent_at).toBeNull() // 旧的单一 sent_at 会在这里被推送「掩盖」掉
    expect(row?.sent_channels).toMatchObject({ webpush: true, errors: { telegram: 'chat not found' } })

    // 第二轮：Telegram 修好 → 只补发 Telegram，推送不再重发
    state.fetchResults.push({ status: 200, body: '{"ok":true,"result":{"message_id":2}}' })
    const res2 = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res2 as never)
    expect(state.sent.length).toBe(1)
    expect(state.fetchCalls.filter(c => c.url.includes('api.telegram.org')).length).toBe(2)
    expect(state.rows.find(r => r.table === 'wb_reminders' && r.row.id === 'r1')?.row.sent_at).toBeTruthy()
  })

  it('check：返回 scannedAt（提醒中心据此显示「上次扫描 N 分钟前」）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-01-01', due_time: '09:30', user_id: 'u1' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { scannedAt?: string }
    expect(typeof body.scannedAt).toBe('string')
    expect(Math.abs(Date.now() - new Date(String(body.scannedAt)).getTime())).toBeLessThan(60_000)
  })

  it('test-notify：逐通道返回结果与失败原因（旧版只回一个 sent 计数，Telegram 失败被吞）', async () => {
    state.insert('wb_channel_configs', { user_id: 'u1', telegram_bot_token: '123:ABC', telegram_chat_id: '456' })
    state.fetchResults.push({ status: 400, body: '{"ok":false,"description":"chat not found"}' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'test' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    const body = res.body as { sent: number; results: Array<{ channel: string; ok: boolean; error?: string }> }
    expect(body.sent).toBe(0)
    expect(body.results).toEqual([{ channel: 'telegram', ok: false, error: 'chat not found' }])
  })
})
