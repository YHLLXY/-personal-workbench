/**
 * AI 日报函数（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 *
 * 入口经 vercel.json rewrites 汇入（?entry= 区分）：
 *   GET/POST /api/digest-enrich  服务端定时：抓取 → 落库 → 逐条 AI 摘要 → 事件聚簇（Bearer CRON_SECRET）
 *   GET/POST /api/digest-build   服务端定时：按事件编排当日日报（Bearer CRON_SECRET）
 *   POST     /api/build-digest   用户手动重生成当日日报（Bearer JWT）
 *
 * 抓取直接 HTTP 自调用本站 /api/hot——单文件约束下无法 import api/hot.ts，
 * 与其把上百行 SOURCES + 解析器复制一份，不如走一次 HTTP（顺带复用它的 CDN 缓存）。
 *
 * 模型接入：OpenAI 兼容，三个环境变量切换供应商，**不引 openai SDK**
 *   LLM_BASE_URL（默认 https://api.deepseek.com）
 *   LLM_MODEL   （默认 deepseek-flash）
 *   LLM_API_KEY （缺省回落到 DEEPSEEK_API_KEY）
 *
 * 摘要与分类的提示词参考了 MIT 协议的 Thysrael/Horizon 与 KKKKhazix/AIHOT
 * 公开的 prompt 设计（见 docs/plans/RESEARCH_AI日报开源方案盘点.md §4），代码为自行实现。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'crypto'

// Vercel 函数为 Node 环境，但 tsconfig.app.json（DOM lib）无 process 类型——此声明仅过 tsc
declare const process: { env: Record<string, string | undefined> }

// ========== 纯函数（导出以便单测） ==========

/** URL 归一化：小写、http→https、去跟踪参数、去尾斜杠。层次 1 去重的输入 */
export function normalizeUrl(raw: string): string {
  const s = (raw ?? '').trim().toLowerCase().replace(/^http:\/\//, 'https://')
  const q = s.indexOf('?')
  if (q < 0) return s.replace(/\/$/, '')
  // 逐段过滤而不是正则替换整串：后者会把第一个参数删掉后残留的 '&' 留在原地
  // （https://a.com/x?utm_source=w&id=7 → 曾错误产出 https://a.com/x&id=7）
  const kept = s.slice(q + 1).split('&')
    .filter(p => p && !/^(utm_[a-z]+|fbclid|gclid|spm|from|ref|source|share_token|share_source|weibo_id)=/.test(p))
  const base = s.slice(0, q).replace(/\/$/, '')
  return kept.length > 0 ? base + '?' + kept.join('&') : base
}

/** 标题指纹：去掉所有非字母数字汉字后取 md5。层次 2 去重（不同站点转载同一篇） */
export function titleHash(title: string): string {
  const cleaned = (title ?? '').toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '')
  return createHash('md5').update(cleaned).digest('hex')
}

/** 从模型输出里抠出 JSON：兼容 ```json 围栏与前后废话（模型偶尔不守 response_format） */
export function parseLlmJson<T>(raw: string): T | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(s.slice(start, end + 1)) as T } catch { return null }
}

export interface EnrichedItem {
  skip: boolean
  score: number
  summary: string
  category: string
  tags: string[]
}

/** 归一化模型返回的单条结果：钳制分数区间、限制标签数量与长度、兜底分类 */
export function normalizeEnrichment(raw: Partial<EnrichedItem> | null): EnrichedItem {
  const score = Number(raw?.score)
  return {
    skip: raw?.skip === true,
    score: Number.isFinite(score) ? Math.min(Math.max(score, 0), 10) : 0,
    summary: String(raw?.summary ?? '').trim().slice(0, 300),
    category: String(raw?.category ?? '').trim().slice(0, 12) || '其他',
    tags: Array.isArray(raw?.tags)
      ? raw!.tags!.map(t => String(t).trim().replace(/^#/, '').slice(0, 16)).filter(Boolean).slice(0, 5)
      : [],
  }
}

/** 分组 + 组内按分数排序 + 每组限量。**排序用代码，模型只写文字**（AIHOT/Horizon 的共同选择） */
export function groupByCategory<T extends { ai_category: string | null; ai_score: number | null }>(
  items: T[], perCategory = 4,
): Array<{ category: string; items: T[] }> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const c = (it.ai_category ?? '').trim() || '其他'
    const list = map.get(c) ?? []
    list.push(it)
    map.set(c, list)
  }
  return [...map.entries()]
    .map(([category, list]) => ({ category, items: list.sort((a, b) => Number(b.ai_score ?? 0) - Number(a.ai_score ?? 0)).slice(0, perCategory) }))
    .sort((a, b) => Number(b.items[0]?.ai_score ?? 0) - Number(a.items[0]?.ai_score ?? 0))
}

/** 并发限流：内置实现，不引 p-limit（单文件约束下能少一个依赖就少一个） */
export async function mapLimit<T, R>(list: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(list.length)
  let cursor = 0
  // 并发数非法时退化成串行，而不是起 0 个 worker 把整批活静默丢掉
  const width = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), list.length)) : Math.max(1, list.length)
  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= list.length) return
      out[i] = await fn(list[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

// ========== 基础设施 ==========

function env(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`missing env ${k}`)
  return v
}

/** 读一个整数环境变量：空值 / 非数字一律回落默认，越界钳制。
 *  ⚠️ 不能直接用 Number(process.env.X)——配成 'abc' 会得到 NaN：
 *  NaN 传给 wb_claim_items 的 p_limit 会在 SQL 里炸；
 *  传给 mapLimit 的并发数会让它起 0 个 worker，**静默什么都不做**（最难查的那种）。 */
export function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

/** 单次调用的时间预算（毫秒）。Vercel 函数有平台级超时，跑不完的条目必须放回 pending，
 *  否则会卡在 processing。设小一点没坏处——状态是持久的，下次 cron 接着跑。 */
// 下限允许 0：那等于「只落库、不处理」——函数超时限制极紧时，可以把抓取与处理拆到两次调用里跑
const BUDGET_MS = () => intEnv('DIGEST_BUDGET_MS', 20_000, 0, 280_000)

function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

async function authUser(req: VercelRequest): Promise<SupabaseClient | null> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
  if (!token) return null
  const anon = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
  const { data } = await anon.auth.getUser(token)
  if (!data.user) return null
  return createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${token}` } } })
}

/** 定时入口鉴权：常数时间比较，且不向未认证调用者泄漏环境变量名 */
function isCron(req: VercelRequest): boolean {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  const actual = req.headers.authorization ?? ''
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

/** 单用户应用：service role 下 auth.uid() 为 NULL，插入必须显式带 user_id。
 *  优先 DIGEST_USER_ID 环境变量，没配就取库里的第一个用户（个人自用，无需多租户） */
async function resolveUserId(sb: SupabaseClient): Promise<string> {
  const configured = process.env.DIGEST_USER_ID
  if (configured) return configured
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) throw error
  const id = data?.users?.[0]?.id
  if (!id) throw new Error('库里还没有用户，先在应用里登录一次，或配置 DIGEST_USER_ID')
  return id
}

// ========== 模型调用 ==========

const LLM_BASE = () => process.env.LLM_BASE_URL ?? 'https://api.deepseek.com'
const LLM_MODEL = () => process.env.LLM_MODEL ?? 'deepseek-flash'
const LLM_KEY = () => process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''

interface ChatResult { text: string }

/** 唯一的模型调用出口。json=true 时要求 JSON 输出（DeepSeek 支持 response_format） */
async function chat(system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}): Promise<ChatResult> {
  const key = LLM_KEY()
  if (!key) throw new Error('未配置 LLM_API_KEY / DEEPSEEK_API_KEY')
  const r = await fetch(`${LLM_BASE()}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: LLM_MODEL(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json === false ? {} : { response_format: { type: 'json_object' } }),
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`LLM ${r.status} ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { text: j.choices?.[0]?.message?.content ?? '' }
}

/** 单条资讯 → 结构化结果。提示词参考 Horizon 的 analysis rubric 与 AIHOT 的答案前置模式 */
const ENRICH_SYSTEM = [
  '你是一个中文资讯编辑，负责把聚合来的热点条目整理成日报素材。',
  '对给定的单条资讯，输出严格的 JSON 对象，字段：',
  '{"skip": boolean, "score": number, "summary": string, "category": string, "tags": string[]}',
  '规则：',
  '1. skip=true 仅用于纯广告、纯标题党、无法判断内容的空条目；宁可不跳过。',
  '2. score 为 0-10 的重要性打分，按「对普通读者的信息价值」评，不要都给高分。',
  '3. summary 用两三句中文说清「发生了什么 + 为什么值得看」，不要复述标题，不要用「本文」「该报道」开头。',
  '4. category 只能取：科技、财经、社会、国际、文化、健康、其他。',
  '5. tags 最多 5 个，不要带 # 号。',
  '6. 只输出 JSON，不要任何解释或 Markdown 围栏。',
].join('\n')

async function enrichOne(title: string, sourceName: string): Promise<EnrichedItem> {
  const { text } = await chat(ENRICH_SYSTEM, `来源：${sourceName}\n标题：${title}`, { maxTokens: 500 })
  return normalizeEnrichment(parseLlmJson<Partial<EnrichedItem>>(text))
}

/** 判断两条标题是否在说同一件事（只在文本相似度落在灰区时才花这一次调用） */
async function isSameEvent(a: string, b: string): Promise<boolean> {
  const { text } = await chat(
    '你判断两条新闻标题是否在讲同一件事（同一事件的后续进展算同一件事）。只输出 JSON：{"same": boolean}',
    `标题一：${a}\n标题二：${b}`,
    { maxTokens: 60 },
  )
  return parseLlmJson<{ same?: boolean }>(text)?.same === true
}

// ========== 流程 1：抓取 → 落库 → 摘要 → 聚簇 ==========

interface HotItem { title: string; source: string; url: string; category: string }
interface HotSourceMeta { id: string; name: string; category: string }

function genId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }

/** 自调用本站 /api/hot 拉取当日条目。origin 从请求头推导（Vercel 上即部署域名） */
async function fetchHot(origin: string): Promise<{ items: HotItem[]; sources: HotSourceMeta[] }> {
  const r = await fetch(`${origin}/api/hot`, { headers: { 'user-agent': 'personal-workbench-digest/1.0' }, signal: AbortSignal.timeout(25_000) })
  if (!r.ok) throw new Error(`/api/hot ${r.status}`)
  const j = (await r.json()) as { items?: HotItem[]; sources?: HotSourceMeta[] }
  return { items: j.items ?? [], sources: j.sources ?? [] }
}

/** 落库：url_hash 唯一索引兜底，冲突忽略（层次 1 去重）。
 *  返回本次真正新增的条数——重复抓取不会重复计费。 */
async function persistItems(sb: SupabaseClient, userId: string, items: HotItem[], sources: HotSourceMeta[]): Promise<number> {
  const nameOf = new Map(sources.map(s => [s.id, s.name]))
  const rows = items.map(it => ({
    id: genId(),
    user_id: userId,
    source_id: it.source,
    source_name: nameOf.get(it.source) ?? it.source,
    title: it.title.slice(0, 300),
    url: it.url,
    url_hash: normalizeUrl(it.url),
    title_hash: titleHash(it.title),
  }))
  if (rows.length === 0) return 0
  const { data, error } = await sb.from('wb_hot_items')
    .upsert(rows, { onConflict: 'user_id,url_hash', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** 领取待处理条目并逐条做 AI 摘要，写回 ai_* 字段。
 *  超出时间预算的条目**放回 pending**（而不是留在 processing）——下次 cron 接着跑。 */
async function enrichPending(sb: SupabaseClient, userId: string, limit: number, concurrency: number, deadline: number): Promise<{ processed: number; deferred: number }> {
  const { data: claimed, error } = await sb.rpc('wb_claim_items', { p_user: userId, p_limit: limit })
  if (error) throw error
  const items = (claimed ?? []) as Array<{ id: string; title: string; source_name: string; ai_retry?: number }>
  if (items.length === 0) return { processed: 0, deferred: 0 }

  const todo: typeof items = []
  const deferred: typeof items = []
  for (const it of items) (Date.now() < deadline ? todo : deferred).push(it)
  if (deferred.length > 0) {
    // 没轮到的放回去；claimed_at 一并清掉（配合 wb_claim_items 的陈旧回收形成双保险）
    await sb.from('wb_hot_items').update({ ai_status: 'pending', claimed_at: null }).in('id', deferred.map(i => i.id))
  }
  if (todo.length === 0) return { processed: 0, deferred: deferred.length }

  await mapLimit(todo, concurrency, async (it) => {
    try {
      const r = await enrichOne(it.title, it.source_name)
      await sb.from('wb_hot_items').update({
        ai_status: r.skip ? 'skipped' : 'done',
        ai_score: r.score, ai_summary: r.summary, ai_category: r.category, ai_tags: r.tags,
        ai_model: LLM_MODEL(), processed_at: new Date().toISOString(),
      }).eq('id', it.id)
    } catch (err) {
      // 失败要留痕并允许重试：ai_retry 超过 2 次就不再领（避免坏条目反复烧钱）
      const msg = err instanceof Error ? err.message : String(err)
      const retry = Number((it as { ai_retry?: number }).ai_retry ?? 0) + 1
      await sb.from('wb_hot_items').update({
        ai_status: retry >= 3 ? 'failed' : 'pending', ai_retry: retry, claimed_at: null,
        ai_summary: `[失败] ${msg.slice(0, 120)}`,
      }).eq('id', it.id)
    }
  })
  return { processed: todo.length, deferred: deferred.length }
}

/** 事件聚簇（层次 3）：先召回候选，灰区才让模型判定，否则新建事件。
 *  超预算即停——未聚的条目 event_id 仍为 null，下次 enrich 接着聚。 */
async function clusterItems(sb: SupabaseClient, userId: string, deadline: number): Promise<{ clustered: number; deferred: number }> {
  const { data: rows, error } = await sb.from('wb_hot_items')
    .select('id,title,ai_score,ai_category').eq('user_id', userId).eq('ai_status', 'done').is('event_id', null).limit(60)
  if (error) throw error
  const items = (rows ?? []) as Array<{ id: string; title: string; ai_score: number | null; ai_category: string | null }>
  let clustered = 0
  for (const it of items) {
    if (Date.now() > deadline) break
    const { data: cands } = await sb.rpc('wb_match_events', { p_user: userId, p_title: it.title, p_embedding: null, p_days: 14, p_limit: 3 })
    const best = (cands ?? [])[0] as { event_id: string; title: string; similarity: number } | undefined
    let eventId: string | null = null
    if (best && best.similarity >= 0.75) eventId = best.event_id
    else if (best && best.similarity >= 0.35) eventId = (await isSameEvent(best.title, it.title)) ? best.event_id : null

    if (eventId) {
      const { data: ev } = await sb.from('wb_hot_events').select('item_ids,source_count,heat').eq('id', eventId).maybeSingle()
      const ids = [...((ev?.item_ids as string[] | null) ?? []), it.id]
      await sb.from('wb_hot_events').update({
        item_ids: ids, source_count: ids.length,
        heat: Number(ev?.heat ?? 0) + Number(it.ai_score ?? 0),
        last_seen_at: new Date().toISOString(),
      }).eq('id', eventId)
    } else {
      const { data: created, error: insErr } = await sb.from('wb_hot_events').insert({
        id: genId(), user_id: userId, title: it.title.slice(0, 200),
        category: it.ai_category ?? '其他', item_ids: [it.id], source_count: 1,
        heat: Number(it.ai_score ?? 0),
      }).select('id').single()
      if (insErr) throw insErr
      eventId = created.id as string
    }
    await sb.from('wb_hot_items').update({ event_id: eventId }).eq('id', it.id)
    clustered++
  }
  return { clustered, deferred: items.length - clustered }
}

// ========== 流程 2：事件 → 日报 ==========

interface ReportSectionItem { eventId: string; title: string; point: string; sources: Array<{ name: string; url: string }> }
interface ReportSection { category: string; items: ReportSectionItem[] }

/** 编排提示词：**分类排序由代码做完，模型只写文字**（这是 AIHOT / Horizon 的核心共识） */
const DIGEST_SYSTEM = [
  '你是一个中文日报主编。给你今天已经分好类、排好序的新闻事件，请写一份当日简报。',
  '输出严格的 JSON 对象：',
  '{"title": string, "overview": string, "points": [{"eventId": string, "point": string}]}',
  '规则：',
  '1. title 是一句话概括今天最值得注意的事，不超过 24 字。',
  '2. overview 是三到五句的今日总述，点出跨领域的共同线索；不要逐条罗列，不要用「今天」「本日」开头。',
  '3. points 与输入事件一一对应，每个 point 一到两句，说清「这件事的关键信息是什么」，不复述标题。',
  '4. 不要编造输入里没有的事实、数字、公司名。',
  '5. 只输出 JSON，不要 Markdown 围栏。',
].join('\n')

async function buildReport(sb: SupabaseClient, userId: string, date: string, perCategory: number): Promise<{ items: number; sources: number } | null> {
  const { data: evRows, error } = await sb.from('wb_hot_events')
    .select('id,title,category,heat,item_ids,source_count')
    .eq('user_id', userId).eq('event_date', date)
    .order('heat', { ascending: false }).limit(60)
  if (error) throw error
  const events = (evRows ?? []) as Array<{ id: string; title: string; category: string; heat: number; item_ids: string[]; source_count: number }>
  if (events.length === 0) return null

  // 分类与排序全在代码里做完
  const sections: ReportSection[] = []
  const seen = new Set<string>()
  for (const e of events) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    let sec = sections.find(s => s.category === e.category)
    if (!sec) { sec = { category: e.category, items: [] }; sections.push(sec) }
    if (sec.items.length >= perCategory) continue
    sec.items.push({ eventId: e.id, title: e.title, point: '', sources: [] })
  }

  // 取来源（每个事件最多 3 条，用于「这件事有 N 家媒体在说」）
  const allItemIds = [...new Set(events.flatMap(e => e.item_ids ?? []))]
  const { data: itemRows } = await sb.from('wb_hot_items').select('id,event_id,source_name,url').in('id', allItemIds.slice(0, 300))
  const byEvent = new Map<string, Array<{ name: string; url: string }>>()
  for (const r of (itemRows ?? []) as Array<{ event_id: string | null; source_name: string; url: string }>) {
    if (!r.event_id) continue
    const list = byEvent.get(r.event_id) ?? []
    if (list.length < 3) list.push({ name: r.source_name, url: r.url })
    byEvent.set(r.event_id, list)
  }
  for (const sec of sections) for (const it of sec.items) it.sources = byEvent.get(it.eventId) ?? []

  const flat = sections.flatMap(s => s.items)
  const payload = flat.map(i => ({ eventId: i.eventId, title: i.title, category: sections.find(s => s.items.includes(i))?.category ?? '其他' }))
  const { text } = await chat(DIGEST_SYSTEM, JSON.stringify(payload), { maxTokens: 2000 })
  const parsed = parseLlmJson<{ title?: string; overview?: string; points?: Array<{ eventId?: string; point?: string }> }>(text)
  if (!parsed) throw new Error('模型未返回可解析的 JSON')

  const pointOf = new Map((parsed.points ?? []).map(p => [String(p.eventId ?? ''), String(p.point ?? '')]))
  for (const sec of sections) for (const it of sec.items) it.point = pointOf.get(it.eventId) ?? ''

  const itemCount = flat.length
  const sourceCount = new Set(flat.flatMap(i => i.sources.map(s => s.name))).size
  const { error: upErr } = await sb.from('wb_daily_reports').upsert({
    id: genId(), user_id: userId, report_date: date,
    title: String(parsed.title ?? '今日简报').slice(0, 60),
    overview: String(parsed.overview ?? '').slice(0, 1200),
    sections, item_count: itemCount, source_count: sourceCount, model: LLM_MODEL(),
    generated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,report_date' })
  if (upErr) throw upErr
  return { items: itemCount, sources: sourceCount }
}

// ========== 运行日志 ==========

async function logRun(sb: SupabaseClient, userId: string, date: string, stage: string, patch: { status: string; detail?: string; items_in?: number; items_out?: number }) {
  await sb.from('wb_digest_runs').upsert({
    id: genId(), user_id: userId, run_date: date, stage,
    status: patch.status, detail: patch.detail ?? null,
    items_in: patch.items_in ?? 0, items_out: patch.items_out ?? 0,
    finished_at: new Date().toISOString(),
  }, { onConflict: 'user_id,run_date,stage' })
}

function todayShanghai(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  return t.toISOString().slice(0, 10)
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now()
  try {
    const entry = req.query.entry as string | undefined
    const date = todayShanghai()

    if (entry === 'enrich') {
      if (!isCron(req)) return res.status(401).json({ ok: false })
      const sb = adminClient()
      const userId = await resolveUserId(sb)
      const origin = `https://${req.headers.host ?? ''}`
      // 整条 enrich 共用一个时间预算：抓取已经花掉的时间也算在内
      const deadline = t0 + BUDGET_MS()
      const { items, sources } = await fetchHot(origin)
      const added = await persistItems(sb, userId, items, sources)
      const enriched = await enrichPending(sb, userId, intEnv('DIGEST_ENRICH_LIMIT', 35, 1, 200), intEnv('DIGEST_CONCURRENCY', 5, 1, 20), deadline)
      const clustered = await clusterItems(sb, userId, deadline)
      await logRun(sb, userId, date, 'enrich', {
        status: 'ok', items_in: items.length, items_out: enriched.processed,
        detail: `新增 ${added} / 处理 ${enriched.processed}（顺延 ${enriched.deferred}）/ 聚簇 ${clustered.clustered}（顺延 ${clustered.deferred}）`,
      })
      return res.json({ ok: true, fetched: items.length, added, processed: enriched.processed, deferred: enriched.deferred, clustered: clustered.clustered, ms: Date.now() - t0 })
    }

    if (entry === 'build') {
      if (!isCron(req)) return res.status(401).json({ ok: false })
      const sb = adminClient()
      const userId = await resolveUserId(sb)
      const r = await buildReport(sb, userId, date, intEnv('DIGEST_PER_CATEGORY', 4, 1, 20))
      await logRun(sb, userId, date, 'digest', { status: 'ok', items_out: r?.items ?? 0, detail: r ? `${r.items} 条事件 / ${r.sources} 个来源` : '今天还没有可编排的事件' })
      return res.json({ ok: true, built: r !== null, ...(r ?? {}), ms: Date.now() - t0 })
    }

    if (entry === 'force') {
      const sb = await authUser(req)
      if (!sb) return res.status(401).json({ ok: false })
      const r = await buildReport(sb, (await sb.auth.getUser()).data.user?.id ?? '', date, intEnv('DIGEST_PER_CATEGORY', 4, 1, 20))
      if (!r) return res.json({ ok: true, built: false, error: '今天还没有可编排的事件——先跑一次 enrich' })
      return res.json({ ok: true, built: true, ...r, ms: Date.now() - t0 })
    }

    return res.status(404).json({ ok: false, error: 'not found' })
  } catch (err) {
    console.error('digest handler error', err)
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'internal error' })
  }
}
