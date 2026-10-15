# 调研：AI 日报接入方案（个人工作台）

> 调研目标：把每天采集到的「今日热点」资料，用 AI 整理成结构化日报，并决定它长什么样、放在哪里。
> 调研方法：① 先核查工作台自身现状；② 盘点 GitHub 成熟方案（见配套 `docs/plans/RESEARCH_AI日报开源方案盘点.md`，star 数与提交时间均为 2026-10-15 实查）；③ 结论落成本文件。
> **结论先行：日报要在工作台内自建生成引擎，提示词与流水线设计抄成熟开源项目；但第一步不是写 AI，是「先把热点落库」——现在根本没有可总结的历史资料。**

---

## 〇、先纠正一个前提：今天的「今日热点」并没有被保存下来

用户的需求原话是「把我们**每天去收集到的**『今日热点』的资料用 AI 整理成日报」。核查代码后，这个前提不成立：

| 事实 | 证据 |
|---|---|
| 热榜是**每次访问实时抓取**的 | `api/hot.ts:151` 的 handler 现场抓取 7 类源，响应头 `Cache-Control: s-maxage=600`（CDN 缓存 10 分钟），**不落库** |
| 只有「已读标记」持久化 | `src/modules/news/news-view.ts:11,20` —— `localStorage` 的 `READ_KEY`，存的是 url 数组，不是条目内容 |
| 没有任何快照表 | `supabase/migrations/` 001–012 无 hot / snapshot 相关表；`src/lib/db/types.ts` 的仓储接口无 hot 相关方法 |

**含义**：昨天、前天的热榜数据**已经不存在了**。所以「AI 整理我们收集到的资料」这条链路缺的不是 AI，是**输入**。

👉 **Step 0（无论选哪条路线都必须先做）：给热榜加每日落库。**

---

## 一、开源方案盘点（要点，完整版见配套文件）

2026-10-15 通过 GitHub REST API 实查所得（star 数为当日 `stargazers_count`）：

| 仓库 | Stars | 语言 | License | 一句话 | 可抄什么 |
|---|---:|---|---|---|---|
| `sansan0/TrendRadar` | 62,914 | Python | **GPL-3.0** | 多平台热点聚合 + AI 筛选/翻译/简报，11+ 推送渠道 | 渠道清单；**提示词未开源，且 GPL 不宜抄代码** |
| `Thysrael/Horizon` | 9,662 | Python | **MIT** | AI 新闻雷达，Profile 打分 + 分层去重 + 富化 | **打分 rubric / 去重 / 均衡简报设计**；本机已有 fork |
| `KKKKhazix/AIHOT` | 7,695 | TypeScript | **MIT** | 「自己找热点、自己写日报」完整引擎 | **`industry/prompts/` 下 30 个提示词 md 全部开源**；聚簇算法；热度算法 |
| `DIYgod/RSSHub` | 46,529 | TypeScript | MIT | 万物皆可 RSS | 把中文平台（微博/知乎/百度热榜）变成 RSS 的现成方案 |

### 关键判断

1. **没有「Next.js / React + Supabase + Vercel」原生技术栈的成熟 AI 日报项目。** 子代理用 `topic:supabase stars:>200`、`newsletter supabase nextjs`、`newsletter generator llm stars:>100` 三组检索均无结果。**这块没有照抄就能跑的仓库，必须自己组装。**
2. **但零件是现成的、且是 MIT 的**：AIHOT 的 30 个提示词文件 + Horizon 的 Profile 结构（`match.md` / `analysis.md` / `enrichment.md`）。**准则 #8「先看成熟产品怎么解决同一个问题」在此得到满足——抄的是提示词与流水线设计，不是代码。**
3. **Horizon 本机就有一份跑通的 fork**（`E:\homework\开发\Horizon`，DeepSeek 已配、已产出 3 份日报）——它是**可选增强**，不是主路径（见 §二）。

---

## 二、推荐架构

```
【Step 0】热点每日落库（新增，必做）
  POST /api/cron-digest（外部定时器，Bearer CRON_SECRET —— 与既有 /api/cron-notify 同一套约定）
    → 复用 api/hot.ts 的抓取逻辑
    → upsert 进 wb_hot_snapshots(snapshot_date, items jsonb)

【Step 1】AI 生成日报
  同一次调用里继续：
    → 取当日快照的 items
    → 调 DeepSeek（OpenAI 兼容，国内直连）按「日报提示词」生成结构化 JSON
    → upsert 进 wb_digests(digest_date, items jsonb, raw_markdown)

【Step 2】前端展示（零依赖）
  /hot 页两个 Tab：「日报」（默认）｜「热榜」
  首页 home-hot 卡升级为「今日日报」摘要
```

### 为什么生成引擎自建，而不是直接接 Horizon

| 维度 | 自建（推荐） | 接 Horizon |
|---|---|---|
| 数据源 | **就是你在看的那个热榜接口**（中文热榜） | HN / Reddit / Telegram / GitHub / RSS —— **不是你在看的东西** |
| 运维面 | 无新增（Vercel 函数 + Supabase） | 多一个「本机定时跑 Python」或「GitHub Actions」 |
| 端到端 | 一个系统内闭环 | 跨系统，排障面翻倍 |
| 能力 | 首版只有摘要/分类（够用） | 有去重、富化、评论摘要（更强） |
| 落地速度 | 快 | 中 |

**准则 #3「先跑通一个最小的端到端版本」**指向自建。Horizon 作为**第二阶段增强**保留（想加技术资讯类日报时再接，两套并存不冲突）。

### Horizon 的接入方式（留档，第二阶段用）

`data/config.json` 已预留 webhook 段，只需填值即可推给工作台——**不用改一行 Python**：

```json
"webhook": {
  "enabled": true,
  "url_env": "HORIZON_WEBHOOK_URL",
  "delivery": "summary", "platform": "generic", "layout": "markdown",
  "languages": ["zh"],
  "headers": "Authorization: Bearer <HORIZON_WEBHOOK_SECRET>"
}
```
Horizon 侧已在知识库 `30-项目/Horizon/Horizon - 门户口.md` 建档，本机仓库 `E:\homework\开发\Horizon`。

---

## 三、数据表设计（迁移 013）

### 3.1 热点快照

```sql
create table if not exists public.wb_hot_snapshots (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  snapshot_date date not null,
  items         jsonb not null default '[]'::jsonb,   -- 原始条目数组
  created_at    timestamptz not null default now(),
  unique (user_id, snapshot_date)
);
```

### 3.2 日报

```sql
create table if not exists public.wb_digests (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  digest_date  date not null,
  title        text not null,
  source_count int  not null default 0,   -- 「从 63 条中筛出 7 条」的 63
  item_count   int  not null default 0,
  items        jsonb not null default '[]'::jsonb,   -- 结构化条目
  raw_markdown text,                                 -- 原文留档
  model        text,                                 -- 用了哪个模型，便于回溯
  created_at   timestamptz not null default now(),
  unique (user_id, digest_date)
);
```

`items` 每条的结构（**前端直接消费，无需再解析**）：

```json
{
  "title": "…", "url": "…", "source": "微博热搜", "rank": 3,
  "category": "科技 / 社会 / 财经",
  "summary": "两三句讲清发生了什么、为什么值得看",
  "tags": ["AI", "芯片"]
}
```

RLS 照抄 `001_init.sql` 的循环写法（`enable row level security` + `user_id = auth.uid()` 策略）。

**⚠️ 迁移必须由用户在场执行**（AGENTS.md 硬性约定）。

---

## 四、零依赖：为什么解析要放服务端

前端渲染 markdown 需要 `react-markdown` + remark 全家桶（约 60–100KB）。

**体积门禁实测只剩 22KB 余量**（`JS 总量 1098 KB / 1120 KB`，见 `PLAN_V126_首页布局与模块修复.md` §7）——装了必顶穿。

所以：**在 `/api/cron-digest` 里就把模型输出解析成结构化 JSON 存库**，前端用普通 JSX 渲染字段。**前端新增体积 ≈ 0。**

同时这也规避了「模型偶尔不按格式输出」的风险——解析失败在服务端就报错并留档 `raw_markdown`，不会让前端白屏。

---

## 五、界面：放哪里？（用户问「学习管理换成日报」）

### 我的意见：**不建议动「学习管理」，建议让日报接管「今日热点」**

**理由一：删学习管理的代价远大于收益。**
「学习管理」不是孤立页面——它挂着 `wb_exams`（考试倒计时）、`wb_study_goals`（学习目标），以及一条**已经跑通的通知链路**（`/api/check-reminders` 扫考试到期 → Web Push / Server酱 / 即将接入的 Telegram），还有首页「最近考试」卡、命令面板入口。删它等于同时拆掉这条链路，而日报与它**毫无关系**。

**理由二：语义分族错了。**
侧边栏分组是「学习与科研」（学习管理 + 番茄钟）和「资讯与资料」（今日热点 + 资料库 + 灵感速记）。日报是**资讯的加工品**，和学习管理不同族。

**理由三：日报和「今日热点」本来就是两层。**
`/hot` 现在是「素材层」（多平台热榜 + 已读标记 + 一键存速记），日报是「成品层」。**素材 → 成品**应该是同一个页面的两个 Tab，不是侧边栏两个并列入口。

### 推荐形态

- 侧边栏**不新增条目**，「今日热点」页做成两个 Tab：**「日报」（默认）｜「热榜」**
- 首页 `home-hot` 卡升级为「今日日报」：日期 + 条数 + 前 3 条标题与分类，点击进日报
- 移动端底部 Tab 数量不变

> **另一种方案已被考虑并否决**：并行调研子代理建议新建 `/daily` 页面 + 独立侧边栏入口（见配套盘点文件 §8.5）。否决理由是——它把「素材（热榜）」和「成品（日报）」拆成两个入口，而二者本是同一批数据的两个视图；且侧边栏已有 14 个条目，再加一个会稀释导航。（若你更想要独立页，改回来成本很低。）

### 界面设计（第一版，守住「美观但不花哨」）

```
┌──────────────────────────────────────┐
│  今日日报            2026-10-15 周三  │
│  从 63 条资讯中筛出 7 条               │
├──────────────────────────────────────┤
│  1  ▍标题                              │
│     两三句摘要，超出两行省略…           │
│     微博热搜 · #AI #芯片               │
│  ─────────────────────────────────── │
│  2  ▍标题                              │
└──────────────────────────────────────┘
   点任一条 → 原地展开（摘要全文 + 标签 + 原文链接）
```

- **列表 + 原地展开**，不跳新页（日报是「扫读」场景）
- 分类用现有 `Badge`，标签复用现有 tag 样式，颜色沿用主题暖色，**不引入新色板、不做动画**

---

## 六、定时触发与成本

### 触发

工作台**已有成熟约定**：README「任意外部定时器每日调用 `POST /api/cron-notify`（Bearer `CRON_SECRET` 鉴权）」。日报**沿用同一套**——新增 `/api/cron-digest`，由同一个外部定时器再打一次即可。

> 不用 Vercel Cron：子代理查证 **Vercel Hobby 计划 Cron 每天只允许 1 次**（⚠️ 本次未自行复核，标注为待验证）。项目本来就走外部定时器，不受此限。

### 成本

- 输入：单日快照约 50–100 条（标题 + 来源 + 链接）
- 输出：结构化 JSON
- **已核对官方定价**（[DeepSeek 模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)，2026-10-15 抓取）：
  - `deepseek-flash` 输入（缓存未命中）空闲 **¥1** / 高峰 ¥2 每百万 tokens；输出 空闲 **¥4** / 高峰 ¥8
- **空闲时段 = 除「北京时间周一至周五 9:00–12:00、14:00–18:00」以外的全部时间**，含**周末与法定节假日全天**；空闲价正好是高峰价的一半
- 因此**把任务排在北京时间 06:00–08:00 跑，永远命中半价**（子代理在同一天独立得出同一结论）

按每天 100 条、每条含全文富化约 4K tokens 估算，日成本在**几毛钱**量级、月成本**个位数到十几元人民币**（子代理测算 ¥12/月）。

> ⚠️ 该测算**未经真实账单验证**——首日跑完建议对一次 DeepSeek 后台实际扣费再定。

**成本不是瓶颈**，可以放心按「一天一次、全量条目」设计。

---

## 七、待拍板（请回复）

1. **日报放在「今日热点」页做 Tab（推荐）**，还是要单独一个侧边栏入口？
2. **确认保留「学习管理」不动（推荐）**？
3. **Step 0 的热点落库**：确认要做吗？（不做的话日报没有输入——见 §〇）
4. 日报条目点击是**原地展开（推荐）**还是跳详情页？
5. 首版**只做中文**（推荐，省一半调用量）？

---

## 八、配套文件

| 文件 | 内容 |
|---|---|
| `docs/plans/RESEARCH_AI日报开源方案盘点.md` | 完整的开源项目盘点（22 个仓库，star / 提交时间 / license 均实查）、三个重点项目的架构详解、提示词素材、Vercel / Supabase 定时能力、成本测算（含三级可信度标注） |

## 九、交接边界（本文件只到调研 + 设计，不含实现）

实现拆到 `PLAN_V127_AI日报接入.md`，范围：
- 迁移 013（`wb_hot_snapshots` + `wb_digests`）+ 双仓储方法 + 契约测试
- `api/cron-digest.ts`（抓取落库 + 调 DeepSeek + 解析 + upsert，**单文件**）
- 日报提示词（参考 AIHOT / Horizon 的 MIT 提示词，因单文件约束需内联在该函数内）
- `/hot` 页 Tab 改造 + 首页卡片升级
- 空态：没有当日日报时显示「今日日报还没生成」+ 手动触发说明
