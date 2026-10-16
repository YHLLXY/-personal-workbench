# 项目经验（lessons-learned）

> 本项目专属经验，跟着仓库走。**跨项目可复用的通用经验不写在这里**——那些归 Obsidian 知识库
> `40-经验教训/<主题>/`（见 `AGENTS.md` 的「交付纪律」）。
> 更长的跨版本复盘见 [`../经验总结-审查核实与功能迭代执行.md`](../经验总结-审查核实与功能迭代执行.md)。

---

## 2026-10-16 · AI 日报上线七个缺陷（v1.28.4 → v1.30.3）

**背景**：AI 日报代码写完、601 个用例全绿、构建与体积门禁通过、迁移也执行了，
**但线上第一次运行就 500，一次都没成功过**。一天内连挖七个缺陷。

### 项目相关的具体根因

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| 1 | enrich 稳定 500 | 迁移 015 的 CHECK 漏了 `processing`，而 `wb_claim_items()` 正是写这个值 | 迁移 016 重建约束 |
| 2 | 错误只有 `internal error` | PostgREST 报错是普通对象，被 `instanceof Error` 吞掉 | `errText()` 摊平 + `stage` 标签 |
| 3 | build 报「无法解析」 | `deepseek-flash` 思考 token 计入 `max_tokens`，2000 里吃掉 1925 | 默认发 `thinking: disabled`；截断当场抛错 |
| 4 | 「立即生成」报 22P02 | `persistSession:false` 的客户端 `getUser()` 返回 null，`?? ''` 把空串当 uuid | `authUser` 连 `userId` 一起返回 |
| 5 | 生成了但 App 看不到 | 服务端按「库里第一个用户」写日报，**库里有 2 个用户** | 配 `DIGEST_USER_ID`；自检报出用户总数 |
| 6 | 日报「信息太少」 | 编排发给模型的只有 `{eventId,title,category}`，**已生成的摘要一个字没传** | payload 带上 summary；科技配额 4→12 |
| 7 | 处理不完就顺延 | 时间预算按**总量**切，抓取的 11 秒吃掉了摘要的份额 | 改按**剩余**时间 60/40 拆 |

### 项目专属的工程约定（后续迭代遵守）

- **`api/*.ts` 单文件约束**：`telegramGetMe` 这类小工具宁可复制一份，也不能跨文件 import。
- **迁移必须由用户在场执行**，agent 只写文件。写迁移时**建表语句与同一个文件里的函数要对得上**
  （缺陷 1 就是这么来的）。
- **时间预算要区分「固定开销」与「可变开销」**：`/api/hot` 抓 25 个源实测约 11 秒，
  是固定开销，不该从模型份额里扣。
- **服务端替用户猜身份的地方（目前只有 `resolveUserId`）必须让猜测可见**：
  自检报总数与来源，接口响应带 `user` 前 8 位。
- **专属环境变量速查**：`DIGEST_USER_ID`（归属账号，**多用户时必须配**）、`DIGEST_BUDGET_MS`（50000）、
  `DIGEST_FOCUS_CATEGORY`（科技）/`DIGEST_FOCUS_PER_CATEGORY`（12）、`DIGEST_PER_CATEGORY`（4）、
  `LLM_THINKING`（默认关思考）。

### 待办 / 风险

- ⚠️ **体积余量只剩 21 KB**（1129/1150）。涨幅几乎全在 changelog chunk。
  真紧了应把 changelog 改成按需 fetch 的 JSON，**不要删历史条目**。
- 提醒的 GitHub 定时是 best-effort（会丢 tick），开 App 仍是主要触发路径。

> 通用部分（替身保真度 / 错误信息被吞 / 思考 token / GitHub 定时）已单独沉淀到 Obsidian：
> `40-经验教训/质量门禁|调试方法论|AI-API经验|开发环境/2026-10-16-*.md`。
