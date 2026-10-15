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

/** 把任意抛出物摊平成可读文本。
 *
 *  ⚠️ PostgREST 的错误是**普通对象**（{ message, code, details, hint }），不是 Error 实例。
 *  所以 err instanceof Error ? err.message : 'internal error' 这种写法会把真正的原因整个吞掉，
 *  调用方只看到一句没用的 internal error——v1.28.4 之前 enrich 稳定 500 却查不出原因，
 *  正是栽在这里。本文件里每条链式查询都写了 `if (error) throw error`，全都会走到这个分支。 */
export function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    const parts: string[] = []
    if (o.message) parts.push(String(o.message))
    if (o.code) parts.push('code=' + String(o.code))
    if (o.details) parts.push('details=' + String(o.details))
    if (o.hint) parts.push('hint=' + String(o.hint))
    if (parts.length > 0) return parts.join(' | ')
    try { return JSON.stringify(err) } catch { return 'unknown error' }
  }
  return String(err)
}

/** 单次调用的时间预算（毫秒）。Vercel 函数有平台级超时，跑不完的条目必须放回 pending，
 *  否则会卡在 processing。设小一点没坏处——状态是持久的，下次 cron 接着跑。
 *
 *  ⚠️ 默认 50 秒是量出来的，不是拍的：线上自检接口实测 12.4 秒返回，其中 /api/hot
 *  抓 25 个源就要约 11 秒。那 11 秒是**固定开销**——预算只有 20 秒时留给模型的时间
 *  不到 1 秒，一次只处理得了 5 条、顺延 30 条，要跑 7 轮才消化得完。
 *  50 秒下摘要实得约 23 秒（并发 5 → 25~35 条）。
 *
 *  平台上限：Vercel Fluid compute 最长 300 秒；而线上自检能跑满 12.4 秒正常返回，
 *  说明本项目的函数超时至少 > 13 秒（老的 10 秒限额下自检早就被掐断了）。 */
// 下限允许 0：那等于「只落库、不处理」——函数超时限制极紧时，可以把抓取与处理拆到两次调用里跑
/** 日报里每个分类最多几条事件。 */
const PER_CATEGORY = () => intEnv('DIGEST_PER_CATEGORY', 4, 1, 40)

/** 「重点关注分类」用它自己更宽的配额。
 *
 *  ⚠️ 为什么需要它：本项目的热榜约 85% 是科技/AI（11 个科技源 + 8 个学术源），
 *  模型归出来的事件也大多落在「科技」。统一按 4 条切的话，砍掉的正好是最想看的那一块——
 *  线上实测第一份日报只剩 10 条事件，科技只有 4 条。
 *  DIGEST_FOCUS_CATEGORY 设为空字符串可以关掉这个特权，退回统一配额。 */
const FOCUS_CATEGORY = () => (process.env.DIGEST_FOCUS_CATEGORY ?? '科技').trim()
const FOCUS_PER_CATEGORY = () => intEnv('DIGEST_FOCUS_PER_CATEGORY', 12, 1, 40)

const BUDGET_MS = () => intEnv('DIGEST_BUDGET_MS', 50_000, 0, 280_000)

/** 把【剩余】预算按 60/40 拆给「逐条摘要」与「事件聚簇」，返回各自的截止时刻。
 *
 *  ⚠️ 为什么不让摘要吃满整个预算：摘要一吃满，聚簇就**颗粒无收**——
 *  条目全都 `done` 了，但一个事件都没建，随后 `build` 拿不到任何事件、
 *  只能产出一份空日报。第一次跑最容易撞上。
 *
 *  ⚠️ 为什么按「剩余」而不是按「总量」拆：调用方是在**抓取热榜之后**才调这个函数的，
 *  而抓取（实测约 11 秒）不吃模型、也不该占模型的时间份额。按总量拆的话，那 11 秒
 *  会直接从摘要的份额里扣掉，等于白白少跑十几条。
 *
 *  deadline <= now（预算已耗尽）时两段都立即到期，等价于「只抓取落库」。 */
export function splitBudget(now: number, deadline: number): { enrichUntil: number; clusterUntil: number } {
  const remain = Math.max(deadline - now, 0)
  return { enrichUntil: now + Math.floor(remain * 0.6), clusterUntil: Math.max(deadline, now) }
}

function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

/** 用请求头里的【用户 JWT】建一个「以该用户身份」的客户端。
 *
 *  ⚠️ 必须把 userId 一起返回，调用方**不要**再调 sb.auth.getUser()：
 *  这个客户端是 persistSession: false、不存 session 的，不带参数调 getUser() 只会拿到 null。
 *  v1.28.7 之前 force 入口就是这么写的——`getUser().data.user?.id ?? ''` 把空串当 user_id
 *  送进数据库，Postgres 回 22P02（invalid input syntax for type uuid: ""），
 *  「立即生成」按钮**从来没有成功过**。测试替身每次都给回一个用户，所以完全看不见。 */
async function authUser(req: VercelRequest): Promise<{ sb: SupabaseClient; userId: string } | null> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
  if (!token) return null
  const anon = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
  const { data } = await anon.auth.getUser(token)
  if (!data.user) return null
  const sb = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${token}` } } })
  return { sb, userId: data.user.id }
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

/** 是否给模型关掉思考模式（默认关，即「不发思考」）。LLM_THINKING=on 可以打开。
 *
 *  ⚠️ 为什么默认关：DeepSeek 的**思考 token 计入 max_tokens**。2026-10-15 线上实测，
 *  一份 18 条真实标题的日报请求在 max_tokens=2000 下 reasoning 吃掉 1925，正文只剩 100 出头，
 *  finish_reason=length → JSON 截断。逐条摘要的 500 额度同样可能被思考吃光，而那条路径**不报错**：
 *  parseLlmJson 返回 null、normalizeEnrichment 静默套用兜底值，条目照样标成 done——
 *  故障表现只有「摘要质量悄悄变差」。关掉之后不再产生 reasoning token，实测快 2~4 倍、额度全给正文。
 *
 *  只对 DeepSeek 端点发这个字段：换成别的 OpenAI 兼容端点时，未知字段可能被 400 拒掉。 */
function thinkingOff(): boolean {
  if ((process.env.LLM_THINKING ?? '').trim().toLowerCase() === 'on') return false
  return LLM_BASE().includes('deepseek')
}

interface ChatResult { text: string }

/** 唯一的模型调用出口。json=true 时要求 JSON 输出（DeepSeek 支持 response_format） */
async function chat(system: string, user: string, opts: { json?: boolean; maxTokens?: number; timeoutMs?: number } = {}): Promise<ChatResult> {
  const key = LLM_KEY()
  if (!key) throw new Error('未配置 LLM_API_KEY / DEEPSEEK_API_KEY')
  const mt = opts.maxTokens ?? 1200
  const r = await fetch(`${LLM_BASE()}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: LLM_MODEL(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
      max_tokens: mt,
      // 思考 token 也吃这个额度，默认关掉（见 thinkingOff 的说明）
      ...(thinkingOff() ? { thinking: { type: 'disabled' } } : {}),
      ...(opts.json === false ? {} : { response_format: { type: 'json_object' } }),
    }),
    // 单次调用也要受时间预算约束：固定 60s 的话，一个卡住的请求会把预算和平台超时一起撑爆
    signal: AbortSignal.timeout(Math.min(Math.max(opts.timeoutMs ?? 60_000, 3_000), 60_000)),
  })
  if (!r.ok) throw new Error(`LLM ${r.status} ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> }
  const choice = j.choices?.[0]
  // ⚠️ 截断必须当场抛错，不能把半截 JSON 交给调用方：
  // 调用方拿到它只会说「无法解析」，而真正的原因是额度不够——2026-10-15 线上就这么绕了一圈。
  if (choice?.finish_reason === 'length') {
    throw new Error(`模型输出被截断（max_tokens=${mt} 用尽）。思考 token 也计入这个额度，可调大 maxTokens，或设 LLM_THINKING=off 关掉思考模式`)
  }
  return { text: choice?.message?.content ?? '' }
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

async function enrichOne(title: string, sourceName: string, timeoutMs?: number): Promise<EnrichedItem> {
  const { text } = await chat(ENRICH_SYSTEM, `来源：${sourceName}\n标题：${title}`, { maxTokens: 500, timeoutMs })
  return normalizeEnrichment(parseLlmJson<Partial<EnrichedItem>>(text))
}

/** 判断两条标题是否在说同一件事（只在文本相似度落在灰区时才花这一次调用） */
async function isSameEvent(a: string, b: string, timeoutMs?: number): Promise<boolean> {
  const { text } = await chat(
    '你判断两条新闻标题是否在讲同一件事（同一事件的后续进展算同一件事）。只输出 JSON：{"same": boolean}',
    `标题一：${a}\n标题二：${b}`,
    { maxTokens: 60, timeoutMs },
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
      // 单次调用最多等到预算耗尽为止（下限 5s）：否则一个卡住的请求会把整个函数拖过平台超时
      const r = await enrichOne(it.title, it.source_name, Math.max(5_000, deadline - Date.now()))
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
    // ⚠️ 刻意【不传】p_embedding：让它走 SQL 里的默认值 NULL。
    // 显式传 null 需要 PostgREST 把 JSON null 转成 vector 类型——多一层没必要的失败面，
    // 而这层失败会让整条 enrich 在「条目已经处理完」之后才 500（事件全没建、日报为空）。
    // 当前没有 embedding 服务，这个参数永远是 null；将来接了向量服务再按需带上。
    const matchArgs: Record<string, unknown> = { p_user: userId, p_title: it.title, p_days: 14, p_limit: 3 }
    const { data: cands } = await sb.rpc('wb_match_events', matchArgs)
    const best = (cands ?? [])[0] as { event_id: string; title: string; similarity: number } | undefined
    let eventId: string | null = null
    if (best && best.similarity >= 0.75) eventId = best.event_id
    else if (best && best.similarity >= 0.35) eventId = (await isSameEvent(best.title, it.title, Math.max(5_000, deadline - Date.now()))) ? best.event_id : null

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
  '每个事件带有 title（代表标题）与 summary（已经核实过的两三句摘要；可能为空）。',
  '输出严格的 JSON 对象：',
  '{"title": string, "overview": string, "points": [{"eventId": string, "point": string}]}',
  '规则：',
  '1. title 是一句话概括当天最值得注意的事，不超过 24 字。',
  '2. overview 是四到六句的当日总述，点出跨领域的共同线索；不要逐条罗列，不要用「今天」「本日」开头。',
  '3. points 与输入事件一一对应，每个 point 用两到四句写清楚三件事：发生了什么、关键细节是什么、为什么值得关注。',
  '4. **优先依据 summary 来写**，它才是内容来源；title 只用来定位这是哪件事。summary 为空时才只依据标题，并写得保守些。',
  '5. 不要复述标题，不要把 summary 原样抄一遍——要提炼，不要复制。',
  '6. 不要编造输入里没有的事实、数字、公司名、时间。',
  '7. 只输出 JSON，不要 Markdown 围栏。',
].join('\n')

async function buildReport(sb: SupabaseClient, userId: string, date: string): Promise<{ items: number; sources: number } | null> {
  const perCategory = PER_CATEGORY()
  const focus = FOCUS_CATEGORY()
  const focusCap = FOCUS_PER_CATEGORY()
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
    if (sec.items.length >= (e.category === focus ? focusCap : perCategory)) continue
    sec.items.push({ eventId: e.id, title: e.title, point: '', sources: [] })
  }

  // 取来源（每个事件最多 3 条，用于「这件事有 N 家媒体在说」）
  const allItemIds = [...new Set(events.flatMap(e => e.item_ids ?? []))]
  const { data: itemRows } = await sb.from('wb_hot_items').select('id,event_id,source_name,url,ai_summary,ai_score').in('id', allItemIds.slice(0, 300))
  const byEvent = new Map<string, Array<{ name: string; url: string }>>()
  // 每个事件「最有分量的那条摘要」（按 ai_score 取），后面要连同标题一起喂给模型
  const summaryOf = new Map<string, { score: number; text: string }>()
  for (const r of (itemRows ?? []) as Array<{ event_id: string | null; source_name: string; url: string; ai_summary: string | null; ai_score: number | null }>) {
    const sum = (r.ai_summary ?? '').trim()
    if (r.event_id && sum) {
      const score = Number(r.ai_score ?? 0)
      const prev = summaryOf.get(r.event_id)
      if (!prev || score > prev.score) summaryOf.set(r.event_id, { score, text: sum })
    }
    if (!r.event_id) continue
    const list = byEvent.get(r.event_id) ?? []
    if (list.length < 3) list.push({ name: r.source_name, url: r.url })
    byEvent.set(r.event_id, list)
  }
  for (const sec of sections) for (const it of sec.items) it.sources = byEvent.get(it.eventId) ?? []

  const flat = sections.flatMap(s => s.items)
  // ⚠️ summary 必须带上：enrich 阶段已经为每条生成过两三句摘要，不给模型的话它只看得到
  // 标题，写出来的要点必然空泛——而这份摘要早就付过钱了。线上首版日报「信息太少」的主因就是它。
  const payload = flat.map(i => ({
    eventId: i.eventId, title: i.title,
    category: sections.find(s => s.items.includes(i))?.category ?? '其他',
    summary: summaryOf.get(i.eventId)?.text ?? '',
  }))
  const { text } = await chat(DIGEST_SYSTEM, JSON.stringify(payload), { maxTokens: 6000 })
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

// ========== 自检（第一次上线时用：把「配置没配好」和「代码有 bug」分开） ==========

export interface SelfCheck { name: string; ok: boolean; detail: string }

/** 逐项探测日报链路的每个前置条件。**任何一项失败都不影响其余项继续检查**，
 *  一次调用就能把「到底哪儿没配好」全列出来，而不是跑一次 enrich 猜一次。
 *  ⚠️ 只报「有没有 / 多长 / 哪个模型名」，**绝不回显任何密钥内容**。 */
export async function runSelfTest(host: string | undefined): Promise<SelfCheck[]> {
  const out: SelfCheck[] = []
  const key = LLM_KEY()
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])

  out.push({
    name: '环境变量',
    ok: missing.length === 0 && key.length > 0,
    detail: missing.length > 0
      ? '缺少：' + missing.join('、')
      : key.length === 0
        ? '缺少 LLM_API_KEY（或 DEEPSEEK_API_KEY）'
        : '模型 Key 已配置（' + key.length + ' 字符，不回显）、模型 ' + LLM_MODEL() + '、端点 ' + LLM_BASE(),
  })

  if (missing.length === 0) {
    const sb = adminClient()
    const tables = ['wb_hot_items', 'wb_hot_events', 'wb_daily_reports', 'wb_digest_runs']
    const bad: string[] = []
    for (const t of tables) {
      const { error } = await sb.from(t).select('id').limit(1)
      if (error) bad.push(t + '（' + String(error.code ?? error.message) + '）')
    }
    out.push({
      name: '数据库表',
      ok: bad.length === 0,
      detail: bad.length > 0 ? '读不到：' + bad.join('、') + '——迁移 015 执行了吗？' : tables.length + ' 张表均可读',
    })

    try {
      const uid = await resolveUserId(sb)
      const configured = !!process.env.DIGEST_USER_ID
      // 多用户时必须报出来：「库里的第一个用户」未必是你在应用里登录的那个。
      // 写错账号的表现极具迷惑性——日报真的生成了，但前端被 RLS 过滤掉，只显示「还没有日报」。
      let total = 0
      try {
        const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
        total = data?.users?.length ?? 0
      } catch { /* 数不出来不影响主判据 */ }
      out.push({
        name: '归属用户',
        ok: true,
        detail: uid.slice(0, 8) + '…（完整 ID 已隐去）· 来自 ' + (configured ? 'DIGEST_USER_ID' : '库里的第一个用户')
          + (total > 1 && !configured
            ? ' · ⚠️ 库里有 ' + total + ' 个用户，日报会写在上面这个账号下；若它不是你在应用里登录的那个，请在 Vercel 设 DIGEST_USER_ID'
            : ''),
      })
    } catch (err) {
      out.push({ name: '归属用户', ok: false, detail: err instanceof Error ? err.message : '解析失败' })
    }
  }

  try {
    const { items, sources } = await fetchHot('https://' + (host ?? ''))
    out.push({ name: '热榜抓取', ok: items.length > 0, detail: items.length + ' 条 / ' + sources.length + ' 个源' })
  } catch (err) {
    out.push({
      name: '热榜抓取',
      ok: false,
      detail: (err instanceof Error ? err.message : '失败') + '（自调用本站 /api/hot 失败：检查部署是否开了 Deployment Protection）',
    })
  }

  if (key.length > 0) {
    const t0 = Date.now()
    try {
      // ⚠️ 判据是「这次调用通不通」，**不是「有没有正文」**：
      // deepseek-flash 默认走思考模式，max_tokens 给小了会全花在思考上、content 返回空串——
      // 那依然是连通正常。2026-10-15 线上实测踩到过：自检报红，detail 却写着「正常」。
      // 真正的不通（Key 错 / 模型名错 / 余额不足）会以非 2xx 抛错，走下面的 catch。
      const { text } = await chat('你是连通性探针，只回一个 JSON。', '返回 {"ok":true}', { maxTokens: 200 })
      out.push({
        name: '模型连通',
        ok: true,
        detail: LLM_MODEL() + ' 连通正常，耗时 ' + (Date.now() - t0) + 'ms'
          + (text.length === 0 ? '（本次未返回正文，通常是思考模式占满了 token 额度，不影响使用）' : ''),
      })
    } catch (err) {
      out.push({ name: '模型连通', ok: false, detail: err instanceof Error ? err.message : '调用失败' })
    }
  }

  return out
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now()
  try {
    const entry = req.query.entry as string | undefined
    const date = todayShanghai()

    if (entry === 'enrich') {
      if (!isCron(req)) return res.status(401).json({ ok: false })
      // 每段都打标签：失败时把 stage 一起回给调用方，省得再去翻 Vercel 日志
      let stage = 'resolve-user'
      try {
        const sb = adminClient()
        const userId = await resolveUserId(sb)
        const origin = `https://${req.headers.host ?? ''}`
        // 整条 enrich 共用一个总截止时刻（抓取也算在内，否则会撞上平台超时）
        const deadline = t0 + BUDGET_MS()
        stage = 'fetch-hot'
        const { items, sources } = await fetchHot(origin)
        stage = 'persist-items'
        const added = await persistItems(sb, userId, items, sources)
        // 抓取是固定开销，等它结束后再按【剩余】时间 60/40 分给摘要与聚簇
        const fetchDone = Date.now()
        const budget = splitBudget(fetchDone, deadline)
        stage = 'enrich-items'
        const enriched = await enrichPending(sb, userId, intEnv('DIGEST_ENRICH_LIMIT', 35, 1, 200), intEnv('DIGEST_CONCURRENCY', 5, 1, 20), budget.enrichUntil)
        stage = 'cluster-events'
        const clustered = await clusterItems(sb, userId, budget.clusterUntil)
        // 运行日志写不进去不该让整次成功白费——条目和事件都已经落库了
        try {
          await logRun(sb, userId, date, 'enrich', {
            status: 'ok', items_in: items.length, items_out: enriched.processed,
            detail: `新增 ${added} / 处理 ${enriched.processed}（顺延 ${enriched.deferred}）/ 聚簇 ${clustered.clustered}（顺延 ${clustered.deferred}）`,
          })
        } catch (logErr) { console.error('digest logRun failed', logErr) }
        return res.json({
          ok: true, fetched: items.length, added,
          user: userId.slice(0, 8),   // 日报写在哪个账号下——多用户时一眼看出对不对
          processed: enriched.processed, deferred: enriched.deferred, clustered: clustered.clustered,
          // 摘要/聚簇各自实得多少毫秒——顺延很多时看这个就知道该不该调 DIGEST_BUDGET_MS
          enrichMs: budget.enrichUntil - fetchDone, clusterMs: budget.clusterUntil - fetchDone,
          ms: Date.now() - t0,
        })
      } catch (err) {
        console.error('digest enrich failed at', stage, err)
        return res.status(500).json({ ok: false, stage, error: errText(err), ms: Date.now() - t0 })
      }
    }

    if (entry === 'build') {
      if (!isCron(req)) return res.status(401).json({ ok: false })
      const sb = adminClient()
      const userId = await resolveUserId(sb)
      const r = await buildReport(sb, userId, date)
      // 同上：日报已经写库了，日志写不进去不该把它变成 500
      try {
        await logRun(sb, userId, date, 'digest', { status: 'ok', items_out: r?.items ?? 0, detail: r ? `${r.items} 条事件 / ${r.sources} 个来源` : '今天还没有可编排的事件' })
      } catch (logErr) { console.error('digest logRun failed', logErr) }
      return res.json({ ok: true, built: r !== null, ...(r ?? {}), user: userId.slice(0, 8), ms: Date.now() - t0 })
    }

    if (entry === 'selftest') {
      if (!isCron(req)) return res.status(401).json({ ok: false })
      const checks = await runSelfTest(req.headers.host)
      return res.json({ ok: checks.every(c => c.ok), checks, ms: Date.now() - t0 })
    }

    if (entry === 'force') {
      const auth = await authUser(req)
      if (!auth) return res.status(401).json({ ok: false })
      const r = await buildReport(auth.sb, auth.userId, date)
      if (!r) return res.json({ ok: true, built: false, error: '今天还没有可编排的事件——先跑一次 enrich' })
      return res.json({ ok: true, built: true, ...r, user: auth.userId.slice(0, 8), ms: Date.now() - t0 })
    }

    return res.status(404).json({ ok: false, error: 'not found' })
  } catch (err) {
    console.error('digest handler error', err)
    return res.status(500).json({ ok: false, error: errText(err) })
  }
}
