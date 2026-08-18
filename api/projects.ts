/**
 * 知识库项目状态函数（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论：无后缀与 .ts 后缀均失败，
 *   仅单文件模式可运行）。新增逻辑请写在本文件内。
 *
 * 职责：读 GitHub 私有仓库 Konwledge-home 的 `30-项目/` 门户口（frontmatter +
 * `## 项目简介`），返回项目摘要列表。GITHUB_TOKEN 缺失 / 网络失败 → 返回内联兜底快照。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const REPO = 'YHLLXY/Konwledge-home'
const BASE = `https://api.github.com/repos/${REPO}/contents`
const ROOT_DIR = encodeURIComponent('30-项目')
/** 响应在 Vercel CDN 缓存 10 分钟；降级响应缓存 5 分钟 */
const CACHE_OK = 's-maxage=600'
const CACHE_FALLBACK = 's-maxage=300'

// ========== 门户口解析器（纯函数，可测试） ==========

export interface ProjectInfo {
  name: string
  emoji: string
  phase: string
  stack: string[]
  aliases: string[]
  updatedAt: string | null
  summary: string
}

interface Fm {
  project?: string
  phase?: string
  updatedAt?: string
  aliases: string[]
  stack: string[]
}

function unquote(s: string): string {
  return s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
}

/** 解析 YAML frontmatter 的子集：project/phase/date/updated 标量 + aliases/stack 数组 */
function parseFrontmatter(fm: string): Fm {
  const out: Fm = { aliases: [], stack: [] }
  let key: string | null = null
  for (const raw of fm.split(/\r?\n/)) {
    const kv = raw.match(/^([\w-]+):\s*(.*)$/)
    if (kv) {
      key = kv[1]
      const v = kv[2].trim()
      if (!v) continue
      if (key === 'project' || key === 'phase') out[key] = unquote(v)
      else if (key === 'updated' || (key === 'date' && !out.updatedAt)) out.updatedAt = unquote(v)
    } else if (key && /^\s+-\s+/.test(raw)) {
      const item = unquote(raw.replace(/^\s+-\s+/, ''))
      if (key === 'aliases') out.aliases.push(item)
      else if (key === 'stack') out.stack.push(item)
    }
  }
  return out
}

/** 标题行 `# 🚪 名称` 取首个 emoji 作为卡片图标，缺省 🚪（m 标志匹配行首，标题在 frontmatter 之后） */
function extractEmoji(md: string): string {
  const m = md.match(/^#\s*(\p{Extended_Pictographic})/um)
  return m?.[1] ?? '🚪'
}

/** `## 项目简介` 小节首段（跳过引用块），截断 120 字 */
function extractSummary(body: string): string {
  const m = body.match(/##\s*项目简介\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\r?\n---|\s*$)/)
  if (!m) return ''
  const text = m[1]
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('>'))
    .join(' ')
    .replace(/\s+/g, ' ')
  return text.slice(0, 120)
}

/** 门户口 Markdown → 项目摘要（frontmatter 缺字段时按默认值降级） */
export function parseGateway(md: string, fallbackName: string): ProjectInfo {
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const fm = fmMatch ? parseFrontmatter(fmMatch[1]) : { aliases: [], stack: [] }
  const body = fmMatch ? md.slice(fmMatch[0].length) : md
  return {
    name: fm.project || fallbackName,
    emoji: extractEmoji(md),
    phase: fm.phase || '进行中',
    stack: fm.stack,
    aliases: fm.aliases,
    updatedAt: fm.updatedAt || null,
    summary: extractSummary(body),
  }
}

// ========== GitHub Contents API ==========

interface GhEntry { name: string; path: string; type: 'file' | 'dir'; content?: string }

function ghHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'personal-workbench/1.6',
    'x-github-api-version': '2022-11-28',
  }
}

async function ghJson(path: string, token: string, signal?: AbortSignal): Promise<GhEntry[]> {
  const r = await fetch(`${BASE}/${path}`, { headers: ghHeaders(token), signal })
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`)
  return r.json() as Promise<GhEntry[]>
}

/** 单文件 Contents 请求（返回含 base64 content 的对象；列目录不返回 content） */
async function ghFile(path: string, token: string, signal?: AbortSignal): Promise<GhEntry> {
  const r = await fetch(`${BASE}/${path}`, { headers: ghHeaders(token), signal })
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`)
  return r.json() as Promise<GhEntry>
}

/** 拉取 30-项目/ 下全部门户口并解析；单项目失败静默跳过，全部失败抛错走降级 */
async function fetchFromGithub(token: string): Promise<ProjectInfo[]> {
  const root = await ghJson(ROOT_DIR, token)
  const dirs = root.filter(e => e.type === 'dir' && !e.name.startsWith('.') && e.name !== '_Index')
  const settled = await Promise.allSettled(dirs.map(async dir => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const entries = await ghJson(`${ROOT_DIR}/${encodeURIComponent(dir.name)}`, token, ctrl.signal)
      const gateway = entries.find(e => e.type === 'file' && e.name === `${dir.name} - 门户口.md`)
      if (!gateway) return null
      const file = await ghFile(
        `${ROOT_DIR}/${encodeURIComponent(dir.name)}/${encodeURIComponent(gateway.name)}`,
        token,
        ctrl.signal,
      )
      if (!file.content) return null
      const md = Buffer.from(file.content, 'base64').toString('utf-8')
      return parseGateway(md, dir.name)
    } finally { clearTimeout(timer) }
  }))
  const projects = settled
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<ProjectInfo>).value)
  if (projects.length === 0) throw new Error('no gateways')
  return projects
}

// ========== 兜底快照（token 缺失 / GitHub 不可用时返回，与 public/projects-status.json 一致） ==========

export const FALLBACK_PROJECTS: ProjectInfo[] = [
  { name: 'Horizon', emoji: '🌅', phase: '进行中', stack: ['Python', 'uv', 'Docker'], aliases: ['AI 新闻雷达'], updatedAt: '2026-08-02', summary: 'AI 新闻雷达：7 类信息源同管线抓取（Hacker News/Reddit/Telegram/Twitter/GitHub/RSS/OpenBB），AI 打分过滤（0-10 分），生成中英双语日报并多渠道分发。' },
  { name: 'couple', emoji: '🚪', phase: '进行中', stack: ['小程序'], aliases: ['情侣心愿小程序'], updatedAt: '2026-07-29', summary: '情侣互动小程序，含心愿系统、共同日记、积分系统等功能。' },
  { name: '个人工作台', emoji: '🚪', phase: '进行中', stack: ['React 19', 'Vite', 'TypeScript', 'Tailwind', 'Supabase', 'Vercel'], aliases: ['工作台'], updatedAt: '2026-08-12', summary: '个人效率工作台 Web 应用（总览/待办/学习/番茄钟/热点/论文库/速记/健康/复盘 + 定时提醒通知），React + Vite + Supabase + Vercel 部署。' },
  { name: '学生会交流平台', emoji: '🚪', phase: '进行中', stack: ['React 19', 'Vite', 'Ant Design', 'Supabase'], aliases: ['StudentHub'], updatedAt: '2026-08-04', summary: '学生会内部交流与管理平台（React 19 + Vite + TypeScript + Ant Design + Supabase），含任务管理、部门公告、部门论坛、活动抢票、权限管理、通知中心、数据埋点、PWA 等 13 个模块。' },
  { name: '小挑', emoji: '🚪', phase: '进行中', stack: ['HTML', 'CSS', 'JavaScript'], aliases: ['AgriAgent', '丰稷智农'], updatedAt: '2026-07-29', summary: '基于农业智能体的数智农业咨询服务平台商业计划书 + 前端页面开发。' },
  { name: '数学建模', emoji: '🚪', phase: '进行中', stack: ['Python', 'GAMM', 'DE'], aliases: ['数模'], updatedAt: '2026-07-29', summary: '数学建模竞赛相关，含光热发电定日镜场、蔬菜定价优化等项目。' },
  { name: '本地模型测试', emoji: '🚪', phase: '进行中', stack: ['HTML', 'JavaScript'], aliases: ['贪吃蛇'], updatedAt: '2026-08-18', summary: '本地模型测试工作区，含贪吃蛇游戏原型（单 HTML 文件，浏览器直接运行）。' },
  { name: '海报设计', emoji: '🚪', phase: '已完成', stack: ['AI 生成', '提示词'], aliases: ['海报'], updatedAt: '2026-07-29', summary: '招新海报提示词方案（用于 AI 生成海报），含多版提示词迭代。' },
  { name: '自我画像', emoji: '🖼️', phase: '进行中', stack: ['PWA', 'IndexedDB', 'Service Worker'], aliases: ['ME', '自我认知测评'], updatedAt: '2026-08-03', summary: '自我认知测评 PWA：400 题 / 6 领域 × 3 层次 / 8 题型 / 11 心理学框架评分 / 虚拟滚动 / IndexedDB / 报告页。' },
  { name: '视频文案提取器', emoji: '🚪', phase: '进行中', stack: ['Python', 'yt-dlp', 'FunASR', 'GPU'], aliases: ['文案提取'], updatedAt: '2026-08-12', summary: '视频文案提取工具：抖音/B站/YouTube 视频下载（yt-dlp）+ 本地转写（FunASR SenseVoiceSmall，GPU）。' },
]

// ========== 函数入口 ==========

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN 未配置')
    const projects = await fetchFromGithub(token)
    res.setHeader('Cache-Control', CACHE_OK)
    res.json({ updatedAt: new Date().toISOString(), source: 'github', projects })
  } catch (e) {
    console.error('[projects] fallback:', e instanceof Error ? e.message : String(e))
    res.setHeader('Cache-Control', CACHE_FALLBACK)
    res.json({ updatedAt: null, source: 'fallback', projects: FALLBACK_PROJECTS })
  }
}