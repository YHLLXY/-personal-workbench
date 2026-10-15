# v1.27 实施计划：AI 日报接入（完整方案）

> 承接 `docs/plans/RESEARCH_AI日报接入.md`（架构与产品决策）与 `docs/plans/RESEARCH_AI日报开源方案盘点.md`（22 个开源项目实查 + 提示词素材）。
> 用户已拍板：**完整方案**（热点落库 4 张表 + pgvector 事件聚簇 + 状态机）、落在 **/hot 页两个 Tab**、**仅中文**、保留「学习管理」不动。

---

## 一、交付物

| # | 文件 | 内容 |
|---|---|---|
| 1 | `supabase/migrations/015_ai_daily_report.sql` | 4 张表 + 2 个函数 + RLS（**需你在 Supabase 执行**） |
| 2 | `api/digest.ts` | 单文件自包含：抓取落库 / 逐条摘要 / 事件聚簇 / 编排日报（三个 entry） |
| 3 | `vercel.json` | 三条 rewrite：digest-enrich / digest-build / build-digest |
| 4 | `src/lib/db/types.ts` + 双仓储 | `DailyReport` 模型 + `listDailyReports` / `getDailyReport`（只读） |
| 5 | `src/modules/news/daily-digest.tsx` | 日报视图（列表 + 原地展开的来源链接 + 日期切换） |
| 6 | `src/modules/news/hot.tsx` | 「日报（默认）｜热榜」两个 Tab |
| 7 | `src/modules/news/cards.tsx` | 首页热点卡优先露出当日日报标题 |
| 8 | `tests/digest-api.test.ts` | 28 条纯函数用例（URL 归一化 / 标题指纹 / 抠模型 JSON / 输出钳制 / 分组排序 / 并发限流 / 环境变量解析 / 预算拆分） |

---

## 二、为什么这样切（三处对调研报告的偏离，都有理由）

### 1. 抓取改成 HTTP 自调用 `/api/hot`，不复制 SOURCES

调研报告说「把 `api/hot.ts` 的 SOURCES + 解析器复制一份进来」。理由是单文件约束禁止跨文件 import——**结论对，但解法可以更好**：
`api/digest.ts` 直接 `fetch(origin + '/api/hot')`。收益：零重复代码、顺带复用它的 `s-maxage=600` CDN 缓存、热榜源以后增删只改一处。

### 2. 归一化与指纹写在 TS 里，不在 SQL 里再写一份

调研报告的迁移里有 `wb_normalize_url` / `wb_title_hash` 两个 SQL 函数。我**删掉了**——
写库方（`api/digest.ts`）算 `url_hash` / `title_hash`，SQL 里再写一份孪生实现，两处迟早漂移。需要手工排查时直接查表里已算好的列即可。

### 3. 向量可选，没配向量服务时自动降级

**DeepSeek 官方 API 不提供 embedding 端点**——而调研报告默认 `vector(1024)` 一定有值。实际做不到。所以：

- `embedding` 列保留但**可空**，`wb_match_events` 接受 `p_embedding default null`
- 有向量 → `pgvector` 余弦距离召回；没向量 → **`pg_trgm` 标题文本相似度召回**
- 两条路径返回同构结果（`event_id / title / similarity`），调用方无分支
- **含义：事件聚簇今天就能跑，不用先去申请一个 embedding 服务**

将来想上向量：配一个支持 embeddings 的服务（硅基流动的 `BAAI/bge-m3` 是常见的免费国产选择，维度正好 1024），在 `enrich` 里补一次调用即可，表结构不用动。

---

## 三、数据流与状态机

`@
外部定时器 06:00 → GET /api/digest-enrich （Bearer CRON_SECRET）
  ① fetch 本站 /api/hot          → 原始条目
  ② upsert wb_hot_items          → on conflict (user_id, url_hash) do nothing   ← 层次 1 去重
  ③ rpc wb_claim_items           → for update skip locked，并发安全领取        ← 层次 4 幂等
  ④ 并发 5 逐条调 LLM            → score / summary / category / tags
  ⑤ 事件聚簇                     → pg_trgm 相似度 ≥0.75 直接合并
                                    0.35~0.75 花一次调用让模型判定「是不是同一件事」
                                    <0.35 新建事件

外部定时器 08:00 → GET /api/digest-build （Bearer CRON_SECRET）
  ⑥ 取当日事件 → **按 category 分组、按 heat 排序、每组限量（全在代码里做）**
  ⑦ 一次 LLM 调用写 title + overview + 每条一个 point
  ⑧ upsert wb_daily_reports  → unique (user_id, report_date)                   ← 幂等
`@

**核心共识（AIHOT / Horizon 相同）**：**分类与排序用代码，模型只写文字。** 模型不参与决定「哪条更重要、放第几个」——那样每天的排序会随机漂移，而且没法解释。

条目状态机：`pending → done / skipped / failed`；失败自增 `ai_retry`，到 3 次转 `failed` 不再领取（防止坏条目反复烧钱）。

---

## 四、部署步骤（**需要你做的**）

### 1. 执行迁移

在 Supabase SQL Editor 执行 `supabase/migrations/015_ai_daily_report.sql`。
会 `create extension vector / pg_trgm`，建 4 张表、2 个函数、4 组 RLS 策略。幂等，可重复执行。

### 2. 配环境变量（Vercel → Settings → Environment Variables）

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_API_KEY` | ✅ | DeepSeek 的 API Key（也可用已有的 `DEEPSEEK_API_KEY`，代码会回落） |
| `LLM_MODEL` | 建议 | 默认 `deepseek-flash`。**写在环境变量里，不要硬编码**——模型名会变 |
| `LLM_BASE_URL` | 否 | 默认 `https://api.deepseek.com`；换供应商只改这一个（OpenAI 兼容即可） |
| `DIGEST_USER_ID` | 否 | 没配就自动取库里的第一个用户（单用户应用够用） |
| `DIGEST_ENRICH_LIMIT` | 否 | 默认 35。**这是成本闸门**——免费/低价档限流时调小 |
| `DIGEST_CONCURRENCY` | 否 | 默认 5 |
| `DIGEST_PER_CATEGORY` | 否 | 默认 4，每类最多几条进日报 |
| `CRON_SECRET` | ✅ | 已有，复用 |

### 3. 设定时器

沿用现有约定（外部定时器每日调用），**不用 Vercel Cron**：

- 06:00 → `GET https://workbench.yuhailinlxy.com/api/digest-enrich`，Header `Authorization: Bearer <CRON_SECRET>`
- 08:00 → `GET https://workbench.yuhailinlxy.com/api/digest-build`，同上

> 两个时间都在 DeepSeek 空闲时段（高峰 = 北京周一至周五 9:00–12:00 / 14:00–18:00），天然半价。

---

### 0. 先跑自检（v1.28 新增）

```
GET https://workbench.yuhailinlxy.com/api/digest-selftest
Authorization: Bearer <CRON_SECRET>
```

逐项探测五个前置条件，**任何一项失败都不影响其余项继续检查**：

| 检查项 | 失败通常意味着 |
|---|---|
| 环境变量 | `LLM_API_KEY` 没配 |
| 数据库表 | 迁移 015 没执行（会直接把表名报出来） |
| 归属用户 | 库里没有用户，或 service role key 不对 |
| 热榜抓取 | 自调用 `/api/hot` 失败（**开了 Deployment Protection**）或上游全挂 → 返回 0 条 |
| 模型连通 | Key 错了，或模型名写错（**这一项最值钱：否则要跑一整轮 enrich 才发现**） |

返回值形如 `{ ok: false, checks: [{ name, ok, detail }] }`。**只报有没有与长度，不回显任何密钥内容。**

> 为什么要这个：enrich 是个「跑完才知道错」的长流程。自检把「配置没配好」和「代码有 bug」分开，
> 让第一次上线不至于靠猜。

## 五、验收

- [ ] 迁移执行后 4 张表都在，`rowsecurity = true`
- [ ] 手动打 `/api/digest-enrich` → 返回 `{ ok, fetched, added, processed, clustered }`，`wb_hot_items` 有行
- [ ] 再打一次 → `added = 0`（层次 1 去重生效，**不重复计费**）
- [ ] 手动打 `/api/digest-build` → `wb_daily_reports` 出现当日行
- [ ] 应用内 `/hot` 默认落在「日报」Tab，看到标题 + 总述 + 分组条目 + 来源链接
- [ ] 「重新生成」按钮可用（覆盖当日日报）
- [ ] 首页热点卡顶部出现日报摘要

---

## 六、未做 / 已知限制

1. **向量召回未启用**（没有 embedding 服务）——当前走 pg_trgm 文本相似度。中文标题的 trigram 相似度对「同一事件的不同措辞」召回有限，灰区靠模型判定兜住。想提升时按 §二.3 补 embedding。
   ⚠️ 说白一点：**跨天聚簇的实际命中率会很低**，绝大多数条目会各自建事件。这是「不装 embedding 服务」的代价，不是 bug。
2. **日报只做中文**（用户拍板）。`DIGEST_SYSTEM` 已按中文写死；要双语得改提示词并加列。
3. **`wb_hot_items` / `wb_hot_events` 不进备份**。`exportAll` 仍是既有 12 张表——这两张是服务端中间产物（体量大、可重建），日报 `wb_daily_reports` 也是生成物，不塞进 JSON 备份。
4. **前端零新增依赖**：日报用普通 JSX 渲染结构化字段，不引 markdown 渲染器（体积门禁首屏 723/790 KB，装不下）。
5. ~~`api/digest.ts` 未做端到端集成测试~~ → **已补**（2026-10-15）：`tests/digest-handler.test.ts` 用有状态 fake 接管 Supabase + `/api/hot` + LLM 三处网络，直接驱动 `handler()`，16 条用例覆盖鉴权 / 去重 / 状态机 / 聚簇 / 成刊 / 运行日志 / 自检。
   其中「enrich 第二次 added=0 且不再调模型」一条**已做反证**——去掉 `ignoreDuplicates` 该用例立刻变红（`expected 1 to be +0`），其余 7 条不受影响。
   仍然**没有**覆盖的是：真实 PostgREST 的语义差异、真实模型的输出质量、以及生产环境的并发行为——这些只能在线上验。
   其中一条已经预防性处理掉了：`wb_match_events` 的调用**刻意不传 `p_embedding`**（走 SQL 默认 NULL）。显式传 `null` 要 PostgREST 把 JSON null 转成 `vector`，多一层失败面——而这层失败会让整条 enrich 在「条目已经处理完」之后才 500（事件全没建、日报为空）。已有测试断言参数表里没有它。
6. **「同一事件的后续进展」当天不会再出现**。聚簇把新条目并进已有事件后，事件的 `event_date` 仍是首次出现的日期，而 `buildReport` 按 `event_date` 取当天事件——所以昨天报过的故事，今天有新进展也不会进今天的日报。
   这是「不重复总结」的**设计取舍**。若更想要「今天有新进展就再出现一次」，在合并分支里把 `event_date` 一起更新成今天即可（两行改动）。
7. **`title_hash` 已落库但暂未参与去重**。设计里的「层次 2（不同站点转载同一篇）」本意是不重复总结，但**跨源同题条目必须保留**——那正是「这件事有 3 家媒体在说」的数据来源，落库阶段丢掉它等于砍掉产品价值。
   真要省成本，正确位置是**处理阶段复用摘要**（同 `title_hash` 直接抄已有结果、不调模型），而不是落库阶段丢弃。当前没做，属于可选优化。

---

## 六之二、上线前自查发现并修掉的三处缺陷（v1.27.2，2026-10-15）

015 尚未执行，所以这段代码没有线上验证——回头逐行审时抓到三个真问题，都在「函数跑不完」这条路径上：

0. **摘要阶段会吃满整条预算，把聚簇饿死**（v1.28.2）。`enrich` 只有一个 deadline，
   `enrichPending` 一直处理到预算耗尽，紧接着 `clusterItems` 一看「已经超时」立刻 break——
   结果是**条目全都 `done` 了、但一个事件都没建**，随后 `build` 拿不到事件、只能产出空日报。
   抓取本身就要花掉几秒，所以**第一次跑最容易撞上**。
   修法：`splitBudget()` 把预算拆成两段（摘要 60% / 聚簇 40%）。聚簇很便宜（每条约一次 RPC，
   只在灰区才调模型），40% 远远够用。已加纯函数用例断言「任何正预算下摘要的截止都严格早于聚簇」。
   （v1.28.4 修正：改成按**剩余**时间拆。线上自检实测 12.4 秒返回，其中 `/api/hot` 抓 25 个源
   约占 11 秒——这是**固定开销**，按总量拆会直接从摘要的份额里扣掉，等于白白少跑十几条。）

1. **卡死的 `processing` 行永远不会被重试**。`wb_claim_items` 领取时把状态改成 `processing`，
   而它只挑 `pending`。函数一旦被平台超时掐死，那批行就永远停在 `processing`——**永久失联**。
   修法：加 `claimed_at` 列，SQL 里把「超过 15 分钟的 processing」也纳入领取范围（兜底）。
2. **没有任何时间预算**。35 条 × 串行/并发调用很容易超过 Vercel 的函数超时，
   而上面那条缺陷会把超时变成数据永久失联。修法：整条 enrich 共用一个 deadline，
   没轮到的条目**显式放回 `pending`**（`claimed_at` 一并清空）。
3. **环境变量配错会静默弄哑整条链路**。`Number(process.env.X)` 配成 `'abc'` 得到 `NaN`：
   传给 `p_limit` 会在 SQL 里炸；传给并发数会让 `mapLimit` 起 **0 个 worker**——
   响应还是 `ok: true`，但什么都没做（最难查的那种）。修法：`intEnv()` 统一解析（空/非数字回落默认、越界钳制），
   `mapLimit` 再兜一层（并发数非法时退化成串行而不是丢活）。

新增 `DIGEST_BUDGET_MS`（默认 50000，下限 0 = 只抓取不处理），见 README 环境变量表。

> ⚠️ 第 1 条的修复在 **SQL 里**，vitest 覆盖不到——测试覆盖的是第 2、3 条（含「预算用尽后条目确实回到 pending」的状态断言）。
> 第 1 条只能等 015 执行后，用「故意让函数超时一次，看下次 enrich 能不能把行捞回来」来验。

## 七、上线实测（2026-10-15）：两个只有真跑才会暴露的缺陷

留档，别再犯。两条都不是逻辑错，是「两份真相没对齐」和「错误信息被吞掉」。

### 7.1 CHECK 约束漏了 `processing`，整条链路一次都没跑通

**症状**：`GET /api/digest-enrich` 稳定 500，正文只有一句 `{"ok":false,"error":"internal error"}`；
紧接着 `GET /api/digest-build` 返回 `{"ok":true,"built":false}`。两个现象是同一条链子上的。

**根因**：迁移 015 建表时把状态机写成

```sql
check (ai_status in ('pending','done','skipped','failed'))
```

—— **漏了 `processing`**，而**同一个文件**里的 `wb_claim_items()` 领取条目时正是
`set ai_status = 'processing'`。于是这个函数每次调用都抛 `23514 check_violation`：
条目一条也领不出来 → 没有 `done` 条目可聚簇 → 一个事件都建不起来 → `build` 无从编排。

**为什么全套单测没拦住**：`tests/digest-handler.test.ts` 里的 Supabase 替身是 JS 实现的，
它只认逻辑、不认 CHECK 约束——建表语句和领取函数之间的矛盾，在那个抽象层完全不可见。
**替身的保真度就是测试的保真度；替身没实现的那部分，测了等于没测。**

**修法**：迁移 `016_ai_status_processing.sql` 按**定义内容**（而不是按名字）找到这条 CHECK、
删掉、重建为 5 个取值。同时补 `tests/digest-schema.test.ts`：直接解析迁移 SQL，断言
「代码与 SQL 写进该列的每个取值，都落在**最新一次** CHECK 定义里」——**先跑红**
（`expected [ 'processing' ] to deeply equal []`）再修。

> 教训：**凡是数据库能拒绝的写入，都不要指望 JS 替身替你发现。**

### 7.2 错误信息被吞掉，500 查不出原因

```ts
return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'internal error' })
```

PostgREST 的报错是**普通对象** `{ message, code, details, hint }`，不是 `Error` 实例——
所以这个三元表达式**永远**走 `: 'internal error'` 分支，把 `23514` 和那句
`violates check constraint` 一起丢掉。**错误信息被吞掉，等于没有错误信息。**

**修法**：`errText()` 把各种形态摊平成可读文本（`message | code=… | details=… | hint=…`）；
enrich 分支再逐段打 `stage` 标签，500 时一并回传「哪一段炸的 + 真正的原因」。
顺带把 `logRun` 的失败降级成非致命——运行日志写不进去，不该让一次**已经成功**的
抓取处理变成 500。

### 7.3 思考 token 吃掉了输出额度，日报被截断

**症状**：迁移 016 修好后 enrich 全绿（`processed: 35, deferred: 0, clustered: 18`），
但 `build` 仍然 500 —— 这次正文是 `模型未返回可解析的 JSON`（新加的 `errText` 让它第一次说了人话）。

**定位**：`chat()` 只取 `choices[0].message.content`，把 `finish_reason` 和 `usage` 全扔了，
所以看不到真相。本地拿真实 Key 复现，把这两个字段打出来：

```
payload 18 条真实长度标题（2098 字符）
max_tokens=2000 → finish_reason=length | completion 2000 (reasoning 1925) | 正文 136 字 | 解析失败
max_tokens=4000 → finish_reason=stop   | completion  546 起 | 正文 1527 字 | 解析成功
```

**根因**：`deepseek-flash` 默认走思考模式，**而思考 token 计入 `max_tokens`**。
18 条真实标题让思考需要约 1900 token，2000 的额度里只剩 100 出头写正文——写到一半就断了。
（同一份 prompt 换成短标题时 reasoning 只要 871，能过——所以这是个**随输入长度漂移**的坑。）

**修法**（三道）：

1. `chat()` 默认给 DeepSeek 端点发 `thinking: { type: 'disabled' }`。实测 reasoning 归零、
   快 2~4 倍、额度全给正文——**而且质量没有下降**（总述的跨领域归纳、要点的信息密度都在）。
   `LLM_THINKING=on` 可打开。只对 DeepSeek 端点发，避免别的兼容端点被未知字段 400。
2. `chat()` 读取 `finish_reason`，**截断当场抛错**并说清「额度用尽」，不再把半截 JSON 交给调用方。
3. `buildReport` 的 `maxTokens` 2000 → 4000（额度只是上限，不产生额外费用）。

> 教训：**调用模型时把 `finish_reason` 和 `usage` 一起取回来**。只取 `content` 的话，
> 「被截断」和「模型乱答」在日志里长得一模一样。
> 另一条：**关掉思考不是省钱的妥协，它同时修好了正确性**——逐条摘要的 500 额度同样可能被思考吃光，
> 而那条路径 `parseLlmJson` 失败会静默走兜底值，条目照样标 `done`，故障表现只有「质量悄悄变差」。

### 7.4 「立即生成」把空串当成了 user_id

**症状**：App 里点「立即生成」，弹出 `invalid input syntax for type uuid: "" | code=22P02`。

**顺藤**：`message | code=…` 这个格式是 7.2 新加的 `errText()` 才有的——说明这个错**来自我们自己的 API**，
不是前端直连数据库。查 `force` 入口：

```ts
const sb = await authUser(req)                                   // 用 token 验证过 ✓
const r = await buildReport(sb, (await sb.auth.getUser()).data.user?.id ?? '', ...)
//                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ 这个客户端没有 session
```

`authUser` 建的是 `persistSession: false` 的客户端，**不存 session**；不带参数调 `getUser()` 只会拿到 `null`，
于是 `?? ''` 把空串当 uuid 送进 Postgres。**「立即生成」在线上从来没有成功过。**

**为什么 22 个用例全绿**：测试替身的 `getUser` 每次都回一个用户，比真库宽松。
改成忠实版（只有显式传 token 才拿得到用户；`eq('user_id', '')` 返回 22P02）之后，
`force` 那条用例立刻先红：`expected 500 to be 200`。

**修法**：`authUser` 返回 `{ sb, userId }`，调用方直接用，不再二次 `getUser()`。

### 7.5 「日报生成了但看不到」——归属账号可能选错

**症状**：服务端 `build` 返回 `{ok:true, built:true, items:11}`，App 里却还是「还没有日报」。

**分析**：前端 `listDailyReports` 是干净的（不传 `user_id`，靠 RLS 过滤），所以要么这行不存在，
要么它的 `user_id` **不是登录用户的 id**。而服务端的归属用户来自 `resolveUserId()`：
配了 `DIGEST_USER_ID` 就用它，没配就取 `admin.listUsers({page:1, perPage:1}).users[0].id`——
**「库里的第一个用户」未必是你在应用里登录的那个**。写错账号时前端被 RLS 过滤掉，
表现就是「还没有日报」，而库里明明有那一行。

**修法（让猜测可见）**：

- 自检的「归属用户」现在报出**用户总数**与来源（`DIGEST_USER_ID` / 库里的第一个用户），多用户且未配置时直接告警
- `enrich` / `build` / `force` 的响应都带上 `user`（id 前 8 位），命令行就能看出日报写到了谁名下

> 教训：**凡是服务端替用户猜身份的地方，都要让这个猜测可见。**

### 7.6 日报「信息太少」——两处，都不是信息源的锅

**用户的反馈**：日报信息太少，而且想更关注科技；怀疑是信息源的问题。

**先查信息源：不是。** `api/hot.ts` 里 25 个源，tech 11 个（GitHub 热门 / Hacker News / V2EX /
Lobsters / 36氪 / 少数派 / 爱范儿 / Solidot / cnBeta / IT之家 / 开源中国）+ academic 8 个
（arXiv ×7 / 机器之心）——**本来就 85% 是科技/AI**。

**真正的原因有两个，都在编排环节**：

1. **付过钱的摘要没被用上**。`buildReport` 发给模型的是
   ```ts
   { eventId, title, category }      // 就这三个字段
   ```
   ——模型**只看得到标题**。而 enrich 阶段早就为每条生成过两三句 `ai_summary` 并写进了库，
   编排时却一个字都没传。模型拿不到任何内容，写出来的要点必然空泛。
   **修法**：payload 带上 `summary`（同一事件有多条时取 `ai_score` 最高的那条），
   并把提示词从「每个 point 一到两句」改成「两到四句，优先依据 summary，要提炼不要复制」。
2. **配额砍在了最想看的地方**。`DIGEST_PER_CATEGORY` 默认 4，而模型归出来的事件大多落在「科技」，
   于是科技只剩 4 条（线上首版日报总共 10 条事件）。
   **修法**：新增重点分类特权——`DIGEST_FOCUS_CATEGORY`（默认 `科技`）用
   `DIGEST_FOCUS_PER_CATEGORY`（默认 12），其余分类维持 4。

### 7.7 定时任务改放 GitHub Actions

**背景**：原本建议用第三方定时服务（cron-job.org），用户注册/登录不进去，用不了。

**改为 `.github/workflows/digest.yml`**，理由：

- 仓库本来就用 GitHub，不用再注册账号；密钥存仓库 Secret，不散落到第三方后台
- **三步放在同一个 job 里顺序执行**（`curl enrich` → `sleep 30` → `curl enrich` → `sleep 10` → `curl build`），
  顺序是确定的。拆成三个独立定时任务的话，各自的调度延迟会把 build 排到 enrich 前面，产出空日报
- 支持 `workflow_dispatch`，Actions 页面点一下就能手动跑一次（调参时很有用）
- 失败会在 Actions 页面标红，比第三方服务的邮件更容易看见

**踩到的坑**：GitHub 的 `cron` **一律按 UTC**。北京时间 06:00 = 前一天 `22:00 UTC`，写成 `0 22 * * *`（最初是 07:30 / `30 23 * * *`，后按用户作息提前到 06:00）。
另外计划任务在仓库连续 60 天无提交后会被自动停用（本项目 CI 常在跑，风险很低）。

## 八、下一步（可选）

- 给 `wb_hot_items` 加 embedding 写入 + 打开向量召回
- 日报推送到 Telegram（通道 v1.26 已就绪，加一次 `sendTelegram` 调用即可）
- 周报（按周聚合事件，复用同一套数据）
