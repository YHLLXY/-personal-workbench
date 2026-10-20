# 计划：首页改成 12 列 Bento + 今日概览改成桌面双栏（v1.33.0）

- 日期：2026-10-20
- 前置调研：[RESEARCH_2026-10-19_任务卡标识与提醒送达](./RESEARCH_2026-10-19_任务卡标识与提醒送达.md)（v1.32 多列瀑布流的由来）
- 原型（用户选定）：`prototype/2026-10-20-wall-layout/index.html`，布局 B / 弹窗 A
- 用户原话：「那就采用布局 B 和弹窗 A 吧」

## 1. 要解决的问题

1. **列与列不等高**。v1.32 的多列堆叠只保证「列内没有洞」，三列各自到 707 / 860 / 860，左列下方仍是 153px 空白。用户 2026-10-20 的截图就是这个。
2. **今日概览弹窗在 PC 上被挤成一条窄缝**，还出现横向滚动条。滚动条不是设计取舍，是 bug：两处 `truncate` 的 flex 子项没写 `min-w-0`，不换行文本的 min-content 把弹窗内容撑宽，`overflow-y-auto` 顺手把 x 轴也变成 auto —— 于是标题不是省略号，是被切掉。

## 2. 方案（已由原型确认）

### 2.1 首页：12 列 Bento（`md` 起 2 列，`xl` 起 Bento）

```
xl（≥1280）四行，每行跨度之和 = 12：
  行1  天气 4 | 今日热点 8
  行2  今日待办 4 | 本周趋势 4 | 今日专注 4
  行3  习惯打卡 4 | 自我提升 4 | 我的项目 4
  行4  最近考试 4 | 灵感速记 4 | 今日复盘 4
md（768–1279）两列：4→6、8→12（热点独占一行）、6→6、12→12
< md：走移动端 OverviewHome（不动）
```

为什么是这张表：11 张卡的自然高度是测出来的（223/180/248/121/190/85/82/181/209/151/84），按「行内最高」配对后，**每行的拉伸量都在 40px 以内**，没有一张卡被拉到自然高度的 1.5 倍。这是原型里实测「同行高度差 0px」、观感不塌的原因。

- 每张卡 `span`：`home-hot` = 8，其余 = 4（天气固定 4，写在 home.tsx）。
- `desktopOrder` 重排为 1..10：热点 1、待办 2、趋势 3、专注 4、打卡 5、提升 6、项目 7、考试 8、速记 9、复盘 10（天气不走 registry，渲染时排第一）。
- 12 列网格 `grid-auto-flow: row` 不会回退，跨度之和一旦不等于 12 就会在行尾留洞 —— 用单测守住（见 §4）。

### 2.2 卡片「能被拉长」，靠 4 行 CSS，不逐张改组件

shadcn `Card` 本身就是 `flex flex-col`，只要给它 `height:100%` 并把 `CardContent` 变成 `flex:1`，多出来的高度就落在卡片内部（列表 / 图表下方），而不是变成卡外的空洞：

```css
/* src/index.css */
.home-cell > *                                            { height: 100%; }
.home-cell [data-slot="card"]                             { height: 100%; }
.home-cell [data-slot="card"] > [data-slot="card-content"] { flex: 1 1 auto; }
```

这样 11 张卡一行组件都不用动，也不会漏掉将来新注册的卡。代价：依赖 shadcn 的 `data-slot` 结构，升级 shadcn 时要回来看这 4 行（会写进注释）。

### 2.3 今日概览：桌面双栏 820px，移动端仍是单栏

- `DialogContent`：`sm:max-w-[820px] overflow-x-hidden`（tailwind-merge 会覆盖组件默认的 `sm:max-w-sm`）。
- 内层：`grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]`，左「今日待办 + 考试倒计时」，右「更新日志（最新版 4 条）」，右栏 `sm:border-l sm:pl-6` 分隔。
- 窄屏（< sm）：退回单列纵向排列，允许 `max-h-[85dvh]` 纵向滚动——手机上内容确实放不下，纵向滚动是合理的。
- 同时修 `min-w-0`：待办标题 `min-w-0 flex-1 truncate`，考试标题 `min-w-0 truncate`。

## 3. 改动清单（文件级）

| 文件 | 改什么 |
|---|---|
| `src/registry.ts` | `HomeCardDef` 增 `span: 4 \| 6 \| 8 \| 12`；各卡补 span；`desktopOrder` 重排 1..10；注释改成 Bento 规则 |
| `src/app/home.tsx` | `md:columns-*` 换成 `grid grid-cols-12`；`SPAN_CLASS` 映射；每格加 `home-cell` |
| `src/index.css` | §2.2 的四行 + 注释 |
| `src/app/daily-summary.tsx` | 双栏结构、820 宽、`min-w-0` 两处 |
| `tests/home-bento.test.ts`（新） | 校验跨度逐行求和 = 12，且每张卡都有合法 span |
| `tests/home-cards.test.ts` | 注释与新顺序对齐（断言不变） |
| `tests/daily-summary.test.tsx` | 补一条：长标题也渲染、两栏容器存在（行为断言，不做 class 断言） |
| `e2e/smoke.spec.ts` | 补一条：打开今日概览后 `scrollWidth <= clientWidth + 1` |
| `src/app/changelog.ts` + `package.json` | v1.33.0 条目与版本号 |
| `docs/lessons-learned.md` | 「行高」与「列高」是两件事；`truncate` 必须配 `min-w-0` |

## 4. 验收标准（每条都能跑出来）

1. `tests/home-bento.test.ts`：对 `homeCards()` 按 `desktopOrder` 排序后累计 span，每满 12 行闭合；任何一行不闭合即失败。
2. `npx tsc -b` exit 0；`npm run test` 全绿（当前基线 657 passed / 70 files，条数只会增不会减）。
3. `npm run build` + `npm run check:bundle`：首屏 ≤ 790 KB、总量 ≤ 1150 KB、最大 chunk ≤ 340 KB。**当前 1147/1150，只剩 3 KB**：本轮只加几十行 JS，预期 +0–1 KB；若超，先拆 `changelog.ts` 再谈。
4. 浏览器实测（1440 / 1920 / 1280 / 768）：
   - 同一行卡片的 `getBoundingClientRect().height` 差值 = 0；
   - 相邻卡之间最大间距 = 设计间距（16px），无 > 20px 的空洞；
   - 页面底部不再出现「某列提前结束」。
5. 弹窗（1440 / 1280 / 768 / 390）：
   - 桌面 `rect.width = 820`，`scrollWidth === clientWidth`（无横向滚动条）；
   - 长标题（> 60 字）时显示省略号而不是被切掉；
   - 390 宽下仍是单列、可纵向滚动。
6. 截图存档：`E:\homework\“余粮”项目\工作台体检-2026-10-20\`，浅色 + 深色 + 1440/768/390。
7. `oxlint` 不超过基线 12 warnings。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 跨度算错导致行尾留洞 | 单测守住（§4.1），且页面级实测空洞 ≤ 20px |
| `CardContent` 变 flex-1 后，某些卡内容被拉成奇怪比例（专注卡数字居中、空态文案漂移） | 逐张看截图；如有问题，给该卡加 `justify-start`，不改全局 |
| `data-slot` 选择器依赖 shadcn 内部结构 | 注释写明；e2e 与截图兜底观感 |
| 820 宽弹窗在 1366×768 笔记本上顶到边 | `max-w-[calc(100%-2rem)]` 仍生效，高度 405 < 85dvh |
| 深色模式下 `ring-foreground/10` 边框与拉伸后的空白对比 | 深色截图逐张看 |
| 体积只剩 3 KB | 本轮不新增依赖；构建后先看数字再提交 |

## 6. 提交切分

1. `feat(home): 12 列 Bento`（registry + home.tsx + index.css + home-bento.test + home-cards 注释）
2. `fix(daily-summary): 桌面双栏 + min-w-0`（daily-summary + 测试 + e2e）
3. `docs+release: v1.33.0`（changelog、package.json、lessons-learned、本计划）
4. tag `v1.33.0`，push，等 Vercel `success`，验证线上 CSS 含 `xl:col-span-8` 与 `sm:max-w-[820px]`。

## 7. 回滚

三个 commit 各自独立：`git revert <hash>` 即可回到 v1.32.0 的多列瀑布流；没有任何数据/迁移改动。

## 8. 明确不做

- 不引入 react-grid-layout / masonry 库（40 KB+，且要 JS 测量）。
- 不改移动端 OverviewHome。
- 不改卡片内部内容（条数、文案、排序）。
- 不做列内拖拽/自定义布局。
