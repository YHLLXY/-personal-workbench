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
  // 重置
  reset() {
    state.rows = []
    state.sent = []
    state.pushErrors = []
    state.fetchCalls = []
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
        // lte 为 no-op（保持时间无关的确定性测试；is 按列值过滤）
        lte: vi.fn((_col: string, _val: string) => chain),
        is: vi.fn((col: string, val: unknown) => { filters.push(row => row[col] === val); return chain }),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected),
      }
      return chain
    }
    return {
      select: vi.fn(makeChain),
      insert: vi.fn((rows: unknown[]) => { (Array.isArray(rows) ? rows : [rows]).forEach(r => state.insert(table, r as Record<string, unknown>)); return Promise.resolve({ error: null }) }),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      delete: vi.fn(() => ({
        eq: vi.fn((col: string, val: unknown) => {
          state.rows = state.rows.filter(r => !(r.table === table && r.row[col] === val))
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
    return new Response('{}', { status: 200 })
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
    state.insert('wb_reminders', { ref_type: 'exam', ref_id: 'e1', kind: 'exam-3d' }) // 已存在节点
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: { authorization: `Bearer ${CRON_SECRET}` } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { ok: boolean; created: number }
    expect(body.ok).toBe(true)
    expect(body.created).toBe(1) // t1 的 due 节点新增；exam-3d 已存在跳过
    expect(state.rows.some(r => r.table === 'wb_reminders' && r.row.ref_type === 'task' && r.row.ref_id === 't1')).toBe(true)
  })

  it('cron：重复触发幂等（created 为 0）', async () => {
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-08-08', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { ref_type: 'task', ref_id: 't1', kind: 'due' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'cron' }, headers: { authorization: `Bearer ${CRON_SECRET}` } }), res as never)
    expect((res.body as { created: number }).created).toBe(0)
  })

  it('check：无 JWT → 401；有效 JWT → 返回 reminders 与 vapidPublicKey', async () => {
    const res401 = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: {} }), res401 as never)
    expect(res401.statusCode).toBe(401)
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-08-08T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    const body = res.body as { reminders: Array<Record<string, unknown>>; vapidPublicKey: string }
    expect(Array.isArray(body.reminders)).toBe(true)
    expect(body.vapidPublicKey).toBe(VAPID_PUB)
  })

  it('check：到期未发提醒 → 调用 web-push 发送并标记 sent（410 过期订阅被删除）', async () => {
    const { default: webpush } = await import('web-push')
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-08-08', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-08-08T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 'test', created_at: '2026-08-08T00:00:00.000Z' })
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect(state.sent.length).toBe(1)
    expect(state.sent[0].endpoint).toBe('https://push.example/1')
    expect(JSON.parse(String(state.sent[0].payload))).toMatchObject({ title: '个人工作台提醒', url: '/reminders' })

    // 过期订阅（410）→ 删除该行
    state.reset()
    state.insert('wb_tasks', { id: 't1', title: '交报告', status: 'todo', due_date: '2026-08-08', due_time: '09:30', user_id: 'u1' })
    state.insert('wb_reminders', { id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-08-08T00:00:00.000Z' })
    state.insert('wb_push_subscriptions', { id: 's2', user_id: 'u1', endpoint: 'https://push.example/410', keys_p256dh: 'p', keys_auth: 'a', user_agent: 't', created_at: '2026-08-08T00:00:00.000Z' })
    state.pushErrors.push({ endpoint: 'https://push.example/410', error: { statusCode: 410 } })
    await handler(makeReq({ method: 'GET', query: { entry: 'check' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(state.rows.some(r => r.table === 'wb_push_subscriptions' && String(r.row.endpoint).includes('410'))).toBe(false)
    expect(webpush.setVapidDetails).toHaveBeenCalled()
  })

  it('test-notify：向本人通道发送测试通知', async () => {
    state.insert('wb_push_subscriptions', { id: 's1', user_id: 'u1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 't', created_at: '2026-08-08T00:00:00.000Z' })
    state.insert('wb_channel_configs', { user_id: 'u1', serverchan_key: 'SCU123' })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', query: { entry: 'test' }, headers: { authorization: 'Bearer jwt-1' } }), res as never)
    expect(res.statusCode).toBe(200)
    expect((res.body as { sent: number }).sent).toBe(2) // web push 1 + serverchan 1
    expect(state.fetchCalls.some(c => c.url.includes('SCU123'))).toBe(true)
  })
})
