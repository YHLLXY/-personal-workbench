# 启动/天气动画 质量调研报告

> 调研日期：2026-09-01
> 目的：用户反馈「进入应用时的天气动画质量太低」，在动手前先把现状、可选项、成本与约束查清楚，供讨论后定方案。
>
> **实施状态**：本文推荐的「方案 C（Canvas 氛围层 + 保留 Meteocons 主角）」已于 **v1.22.0** 落地（2026-09-01）。
> 落地内容见 `src/app/changelog.ts`，未竟事项的验证结果见本文**第八节**，实施中踩到的新坑已沉淀到
> `经验总结-审查核实与功能迭代执行.md` **第十三节**。
>
> 以下正文保留调研当时的原始结论与数据，未做回改——后续若再评估同类方案，可直接复用其中的体积与许可数据。

---

## 一、现状解剖

### 1.1 涉及文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/app/boot-scene.ts` | 191 | 纯逻辑层：时段判定、4 时段调色板、12 类天气氛围参数、伴飞元素配置、粒子生成（种子随机） |
| `src/app/boot-animation.tsx` | 231 | 组件层：渲染分层编排、播放/跳过/后台恢复重播、预览钩子 `?boot=dusk&wx=rain` |
| `src/app/boot-animation.css` | 189 | 图层样式与 15 组 keyframes |
| `src/app/boot-weather.ts` | 43 | 天气获取：竞速 600ms → localStorage 缓存 → 晴天兜底 |
| `src/lib/weather.ts` | — | WMO 码 → 12 类天气、图标名映射（与天气卡共用） |
| `src/lib/weather-icons.ts` | 32 | Meteocons 图标名 → 打包资源 URL |
| `src/assets/meteocons/*.svg` | 14 个 / 51KB | 素材（Meteocons fill 风格动画 SVG，SMIL 自包含动画） |
| `tests/boot-scene.test.ts` | 104 | 纯函数测试：时段划分、氛围参数、种子随机、伴飞配置字段界内 |
| `scripts/boot-preview.mjs` | — | 批量截图脚本（视觉验收基建，已就绪） |

### 1.2 当前分层结构（CSS 里写死的 z 序）

```
天空渐变(根背景) → 星空/晨光(1) → 主角图标(3) → 高空雾云(4)
→ 远山两层(5) → 染色/暗角(6) → 雨雪雾(7) → 闪电(8) → 品牌/跳过(9)
```

### 1.3 场景组合与开销

- 组合数：**12 类天气 × 4 时段 = 48 种**
- 运行时长：`BOOT_PLAY_MS = 3000`，淡出 0.65s，点击可跳过
- DOM 节点峰值（雷雨夜）：星星 64 + 雨滴 46 + 伴飞 3 + 品牌 + 十余个图层 ≈ **120+ 节点同时跑 CSS 动画**，外加多个 SMIL SVG
- 素材成本：14 个 SVG 共 51KB，走独立文件（已修过 base64 内联撑爆主包的问题）

### 1.4 已建立的工程约束（改这块必须遵守）

| 约束 | 来源 | 具体值 |
|---|---|---|
| 体积预算 | `scripts/check-bundle.mjs` | JS 总量 **1120KB**（当前 1016KB，余量 104KB）；最大单 chunk **340KB**（当前 306KB） |
| 素材许可 | `src/assets/meteocons/NOTICE.md` | 必须 MIT；更新只从 npm 包重提取，不手改动画结构 |
| 纯函数分层 | `AGENTS.md` | 纯函数不得导出在组件文件里（fast-refresh 警告），放 `*-utils.ts` / `lib/` |
| 视觉验收 | `经验总结` 第十一节 | 必须亲眼看渲染结果：截图 + agent 读图审；`?boot=dusk&wx=rain` 强制场景 |
| E2E 钩子 | `boot-animation.tsx` | `localStorage('wb-boot-skip')=1` 跳过动画，常规用例不等 3 秒 |
| 确定性 | `tests/boot-scene.test.ts` | 种子随机必须稳定（StrictMode 双挂载 / E2E） |

---

## 二、质量诊断

> 结论先行：**问题不在技术选型，在场景设计。** 素材（Meteocons）本身是公认的高质量手绘动画图标，错在把一个"图标"当"场景"用。

### 2.1 三层视觉语言互相打架（拼贴感根源）

同一画面里并置了三种完全不同的视觉语言：

- **主角/伴飞**：Meteocons fill 风格 —— 带高光、渐变、圆润描边的成品插画
- **远山**：CSS `clip-path` 多边形 + 纯色填充 —— 硬边几何色块
- **天空**：4 色标 `linear-gradient` —— 平面色带

插画与几何色块并置，必然产生"贴纸压在背景板上"的观感。这正是 `经验总结` 里记录的「背景板上嵌了块玻璃片」问题的同类症状。

### 2.2 主角是"放大的图标"，不是场景主体

主角固定 `width: min(280px, 42vmin)` 居中悬浮。Meteocons 图标是**正方形构图**（为列表/卡片设计），放大到 280px 后重心、留白、视觉重量都不成立，看起来就是"一个被放大的图标"。

### 2.3 雨有两套互不相干的系统

- 图标内部：SMIL 雨滴动画（局部、随图标一起缩放）
- 全屏层：`boot-rain` 的 46 个 DOM 粒子（另一套速度/角度/密度）

两者在空间上不连续 —— 视觉上是"云自己在下雨，旁边还另有一场雨"。

### 2.4 空间关系不成立

- 统一光源缺失：太阳在 `left: 5% / top: 5%`，但所有 `drop-shadow` 都是 `0 18px 38px`（正下方），与光源位置矛盾
- 伴飞云的 `left/top` 是手调的散点，没有围绕光源做向背关系
- `boot-haze` 用 `blur(14px)` 的白色圆角矩形模拟雾带，容易看出是"模糊的横条"

### 2.5 运动缺乏物理与节奏编排

- 所有运动都是 `ease-in-out alternate` 的匀速漂移/上下浮动，没有加速度、没有缓动曲线设计
- `drift` 取 8–14s 是拍脑袋值，未按景深系统性分层
- 3 秒里只有"元素依次淡入"，没有**起势 → 高潮 → 收束**的节奏编排，也没有镜头运动

### 2.6 性能与表现力的天花板

粒子用 DOM 实现，密度与帧率直接冲突：想加密度就加节点，加了就掉帧（中低端安卓）。这条路的**质量上限被实现手段锁死**了 —— 与 `经验总结` 里"零依赖不是美德，视觉上限受实现手段限制时换实现手段"是同一个判断。

### 2.7 构图三分平均，没有主次

主角 21% / 品牌 64% / 远山底部 17–26%，垂直方向三段均分，缺少视觉焦点与留白节奏。

---

## 三、GitHub 调研结果

### 3.1 素材库（图标级）

| 项目 | Stars | 许可 | 内容 | 结论 |
|---|---|---|---|---|
| **basmilius/meteocons**（现用） | 1.6k | **MIT** | 475+ 图标 × 4 风格（fill/flat/line/monochrome），SVG动画 / 静态SVG / **Lottie** 三个包，另有 CDN | ✅ 现役最优解，但项目只用了 **14 个 fill SVG**，利用率 <1% |
| mrdarrengriffin/google-weather-icons | 143 | ⚠️ **Google 版权**，README 自述"仅作参考与教育用途" | 6 套风格 + 昼夜 + Pixel 天气 App 的 Lottie 全屏背景 | ❌ **不可商用**，只能当设计参考 |
| qwd/Icons（和风天气） | 263 | 需确认 | 和风天气开源图标字体 | 备选 |
| manifestinteractive/weather-underground-icons | 281 | 需确认 | PNG + SVG | 备选 |

**Meteocons 三包体积（npm 实测，均为 v0.1.0 unpacked 总量）**

| 包 | 总体积 | 单文件均值（按 475×4 估算） |
|---|---|---|
| `@meteocons/svg-static` | 9.0 MB | ≈ 4.7 KB |
| `@meteocons/svg`（动画，现用） | 10.7 MB | ≈ 5.6 KB |
| `@meteocons/lottie` | 39.0 MB | ≈ 20.5 KB |

### 3.2 全屏天气场景（背景级）

| 项目 | Stars | 技术 | 可借鉴点 | 风险 |
|---|---|---|---|---|
| **Google Pixel 天气 Lottie**（在 google-weather-icons 内） | — | Lottie JSON，phone/tablet × 横竖 × 昼夜 共 8 变体，37 个文件 | 业界标杆：分层、光照、粒子密度、节奏 | ❌ 许可不可用；**且体积致命**（见下） |
| g3sthousen/weather-animations | **0** | Canvas 2D + TS + React wrapper，20 条件 × 3 强度 × 昼夜，月相/日出日落，deterministic test hooks，MIT | 功能覆盖与 API 设计可参考 | ⚠️ 0 star / 65 commits，全新且无人验证，疑为 AI 生成项目，**不建议直接依赖** |
| MatteoBattilana/WeatherView | 518 | Android，基于 confetti 粒子系统，Apache-2.0 | **参数化设计参考**：粒子数量/速度/角度/生命周期如何成体系 | 平台不同，只能借鉴思路 |
| flutter_weather_bg | 184 | Flutter 天气动态背景 | 场景分层设计 | 同上 |
| pkissling/clock-weather-card | 866 | TypeScript，iOS 风格天气动画 | 前端实现可直接读 | 参考 |
| YouXianMing/YoCelsius | 2.8k | iOS 经典天气动画 | 视觉设计标杆 | 参考 |
| rocksdanister/weather | 749 | C# / DirectX12 | 视觉对标 | 参考 |
| xiaxiangfeng/sky-cloud-3d | — | Three.js 体积云 | WebGL 路线上限 | ❌ three.js 体积远超预算 |

### 3.3 决定性数据：全屏天气背景 Lottie 的体积

实测 Google Pixel 天气背景 Lottie（`sets/lottie/phone_portrait`，37 个文件）**未压缩体积**：

| 天气 | 体积 |
|---|---|
| tropicalthunderstorm | **1,563 KB** |
| thunderstorm | **1,093 KB** |
| sleet | 912 KB |
| blowing_snow | 778 KB |
| heavy_rain | 225 KB |
| cloudy / mostlycloudy | ≈ 137 KB |

**结论：全屏级天气背景动画，只要走"预烘焙素材"（Lottie/视频）这条路，单个文件就在 137KB–1.5MB 量级。** 对 PWA 首屏完全不可接受。这条路可以直接否掉。

### 3.4 运行时体积对比

| 运行时 | 体积 | 与本项目预算的关系 |
|---|---|---|
| 现方案（SMIL SVG + CSS） | **0 KB 运行时** | ✅ 唯一不占预算的方案 |
| lottie-web 完整版 | 513 KB 未压缩 | ❌ 远超 |
| lottie-web light | 144 KB 压缩后（gzip ≈ 39 KB） | ❌ **超总量余量**：1016 + 144 = 1160 > 1120 |
| dotLottie / Rive（wasm） | 未获得可靠公开数据，量级为数百 KB | ❌ 预计同样超限，需实测才能下结论 |
| Canvas 2D 自绘 | 自写代码约 15–25 KB | ✅ 余量充足 |

> 注：`check-bundle.mjs` 统计 `dist/assets` 下**所有** `.js`（含懒加载 chunk），所以"做成懒加载 chunk"**不能**绕开总量预算。

---

## 四、Skill 调研结论

- **SkillHub（`lightmake.site`）语义检索无有效结果**：两次不同查询（`animation motion design` / `css svg canvas web visual effects`）返回完全相同的 top8，相关分全部 < 0.05，实为全站热门榜而非语义匹配。→ **不存在专门的前端动效/天气动画 skill。**
- **本环境已有的相关能力**（无需安装）：

| 能力 | 对本任务的用途 |
|---|---|
| `agent-browser` / `playwright-cli` | 起本地服务、批量截图、交互验证 |
| 读图能力（`read_file` 支持 png/jpg/webp/gif） | **我直接看渲染结果审图** —— 这是 `经验总结` 验证过的做法 |
| `多模态内容生成` | 如需自绘素材/概念图（文生图、图生图） |
| `scripts/boot-preview.mjs` + `?boot=&wx=` 钩子 | 已有基建，批量出图零成本 |

- ⚠️ **待验证风险**：本环境把长命令识别为 watch 服务并在 10 秒后掐断（本次调研中 `npm test` / `npx vitest` 均因此失败）。**Playwright 截图能否跑通尚未验证**，需要实测或改由用户出图。

---

## 五、候选方案

### 方案 A｜纯场景重设计（零新增依赖）

保留 Meteocons SVG + CSS 技术栈，只重做设计层：统一视觉语言（山体改为与图标同风格的柔和造型/或干脆去掉）、建立统一光源并让阴影方向一致、重写构图与留白、重排 3 秒节奏（起势-高潮-收束）、雨只用一套系统。

- 成本：中（约 2–4 小时）
- 收益：中 —— 能解决拼贴感、光源矛盾、节奏问题，但**粒子密度与物理感仍受 DOM 方案限制**
- 风险：低；不触碰体积预算、不动测试结构

### 方案 B｜Canvas 2D 程序化场景（零依赖自写）

单个 `<canvas>` 接管全部氛围层：雨/雪/星/雾/闪电全部程序化绘制，粒子数可提到 300–800；做真正的景深（3 层视差，按深度统一决定大小/速度/透明度/模糊）；统一光源与光照方向；加入镜头缓动（轻微推拉/位移）。Meteocons SVG 可选保留为主角，或完全自绘。

- 成本：高（约 1–2 天，含调参与截图迭代）
- 收益：**高** —— 唯一能在体积预算内显著提升质量上限的路线
- 风险：中 —— 依赖"截图 → 我读图 → 调参"的迭代闭环；需实测中低端机帧率
- 体积：+15–25 KB，远低于 104 KB 余量 ✅

### 方案 C｜混合式（Canvas 氛围层 + SVG 主角）— 推荐先做

主角与品牌沿用 Meteocons SVG（保留现有美术资产与识别度），氛围层（雨/雪/雾/星/闪电/光晕）交给一个自写的 Canvas 2D 层，两者用统一的光照与景深参数联动。

- 成本：中高（约半天到一天）
- 收益：中高 —— 解决"两套雨""密度不够""无景深"三个最刺眼的问题，同时保留现有素材
- 风险：中低 —— 改动面小于 B，可渐进：先只接管雨雪，再逐步替换

### 方案 D｜换素材源

- Google 图标 ❌ 许可不可用
- 其余备选库风格未见明显优于 Meteocons，且 NOTICE/提取流程要重做
- **结论：不换。** Meteocons 仍是 MIT 下的最优解，且还有 4 种风格和 Lottie 版没用上

### 方案 E｜Lottie 路线

- 全屏级 Lottie：体积 137KB–1.5MB + 许可问题 → **否决**
- 图标级 Lottie（Meteocons，约 20KB/个）：需引入 lottie-web，144KB 会**撑爆总量预算 40KB**，除非上调 BUDGET 并说明理由 → **不推荐**

---

## 六、需要你拍板的问题

1. **质量对标谁？** （决定工作量）
   - A：比现在明显精致即可（方案 A/C）
   - B：接近 Google Pixel / Apple Weather 的全屏氛围感（方案 B，成本最高）
2. **时长**：现 3 秒。每天打开多次，业界倾向 1.2–2.0s。是保持 3 秒，还是缩短？
3. **是否接受引入自写 Canvas 层**（约 +20KB，预算内）？还是坚持零新增代码？
4. **主角保留 Meteocons 图标，还是完全自绘？**
5. **远山 / 品牌标题是否保留？**（远山是拼贴感的重要来源之一）
6. **48 种组合是否都要精修**，还是先做高频的 6–8 种（晴昼/晴夜/雨/雷雨/雪/阴），其余沿用降级？
7. **验收方式**：我跑 Playwright 截图我审（本环境有超时风险，需先验证），还是你出图我审？

---

## 七、参考资料清单

**素材**
- basmilius/meteocons（MIT）：https://github.com/basmilius/meteocons
- Meteocons 预览（fill / outline）：https://basmilius.github.io/weather-icons/index-fill.html
- google-weather-icons（⚠️ 仅参考，不可商用）：https://github.com/mrdarrengriffin/google-weather-icons

**实现参考**
- g3sthousen/weather-animations（Canvas，⚠️ 0 star）：https://github.com/g3sthousen/weather-animations
- MatteoBattilana/WeatherView（Apache-2.0，参数化设计）：https://github.com/MatteoBattilana/WeatherView
- pkissling/clock-weather-card（TS 前端）：https://github.com/pkissling/clock-weather-card
- YouXianMing/YoCelsius（视觉标杆）：https://github.com/YouXianMing/YoCelsius

**体积数据**
- lottie-web 体积分析：https://canyuegongzi.github.io/design/架构/Lottie-web.html
- 本项目体积门禁：`scripts/check-bundle.mjs`

---

## 八、实施后回看（原未竟事项的验证结果）

调研时列出的未竟事项，在实施过程中逐一有了结论：

| 原未竟事项 | 结论 |
|---|---|
| Playwright 截图在本环境能否跑通 | ✅ **可跑通**。长命令会被 IDE 判定为 watch 服务并在 10 秒后掐断，改用 `Start-Process` 后台启动 + 日志文件轮询即可（详见经验总结第十三节）。本次 12 个场景 + 首页 + 天气弹窗全部出图，视觉验收成立 |
| E2E 是否受影响 | ✅ 受影响的 2 个用例（冷启动播放→点击跳过、自动淡出卸载）在 8 workers 下 flaky、**2 workers 下 8/8 全绿**。根因是并发度导致的资源竞争，不是代码缺陷 |
| 体积影响是否可控 | ✅ 实测 JS 总量 1016 → 1063 KB（+47），最大 chunk 306 → 329 KB（+23），余量 57KB / 11KB，仍在基线 +10% 红线内 |
| dotLottie / Rive 运行时的准确体积 | ⬜ 仍未获得可靠公开数据（各来源不一致）。但不影响结论——wasm 运行时量级远超 104KB 余量，且还要额外的 `.riv` 文件 |
| 和风天气图标库（qwd/Icons）的许可 | ⬜ 仍未核实。不影响结论——Meteocons（MIT）已覆盖全部 12 类天气且风格统一 |
| 中低端安卓的真实帧率 | ⬜ 未实测。Canvas 版已按视口面积缩放密度（`scaleCount`，0.45–1.35 倍）并限制 DPR ≤ 2；若后续收到卡顿反馈，优先降这两个参数 |
| 临时文件 `vitest-last.log` | ✅ 已清理 |

### 实施过程中新发现的两条（调研时未预见到）

1. **亚像素元素在 DPR=1 屏上等于不存在** —— 星星半径下限 0.5px 时截图里几乎看不见，提到 0.9px 才成立。
2. **背景密度与前景主体对比度是联动参数** —— 粒子密度翻几倍后，原 `heroOpacity` 下限 0.35 会让主角被"洗"掉，需同步提到 0.55。调背景时不回头校准前景，等于白调。

> **视觉基线怎么复现**：本次 12 个场景的验收截图落在 `.tmp-boot/`（已被 gitignore，属可再生产物，不入库以免仓库膨胀）。
> 要复现：先起 `npm run dev`，再跑 `node scripts/boot-preview.mjs` 批量出图；
> 单场景可用 `?boot=<dawn|noon|dusk|night>&wx=<天气>` 强制指定后自行截图对照。
