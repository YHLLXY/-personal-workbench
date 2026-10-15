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
| 8 | `tests/digest-api.test.ts` | 21 条纯函数用例 |

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
外部定时器 07:30 → GET /api/digest-enrich （Bearer CRON_SECRET）
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

- 07:30 → `GET https://workbench.yuhailinlxy.com/api/digest-enrich`，Header `Authorization: Bearer <CRON_SECRET>`
- 08:00 → `GET https://workbench.yuhailinlxy.com/api/digest-build`，同上

> 两个时间都在 DeepSeek 空闲时段（高峰 = 北京周一至周五 9:00–12:00 / 14:00–18:00），天然半价。

---

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
5. ~~`api/digest.ts` 未做端到端集成测试~~ → **已补**（2026-10-15）：`tests/digest-handler.test.ts` 用有状态 fake 接管 Supabase + `/api/hot` + LLM 三处网络，直接驱动 `handler()`，8 条用例覆盖鉴权 / 去重 / 状态机 / 聚簇 / 成刊 / 运行日志。
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

新增 `DIGEST_BUDGET_MS`（默认 20000，下限 0 = 只抓取不处理），见 README 环境变量表。

> ⚠️ 第 1 条的修复在 **SQL 里**，vitest 覆盖不到——测试覆盖的是第 2、3 条（含「预算用尽后条目确实回到 pending」的状态断言）。
> 第 1 条只能等 015 执行后，用「故意让函数超时一次，看下次 enrich 能不能把行捞回来」来验。

## 七、下一步（可选）

- 给 `wb_hot_items` 加 embedding 写入 + 打开向量召回
- 日报推送到 Telegram（通道 v1.26 已就绪，加一次 `sendTelegram` 调用即可）
- 周报（按周聚合事件，复用同一套数据）
