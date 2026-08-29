# 启动进场动画（时间 × 天气驱动）调研与方案

> 2026-08-30 调研整理；同日已拍板并实现（v1.18.0）。
> 需求原话：早上太阳从云洞里升起来；中午太阳释放强烈的光；下午火烧云；晚上月亮升起来；并根据当天天气决定进场动画。
> **拍板结果**：城市=重庆；播放频率=每次冷启动播放、后台隐藏 ≥5 分钟恢复视为重新打开重播（短暂切窗不重播）；夜晚流星彩蛋=加。
> **预览钩子**：`?boot=dawn|noon|dusk|night&wx=clear|partly|overcast|rain|snow|fog|thunder` 可强制指定时段/天气（调观感用）；`node scripts/boot-preview.mjs`（dev server 起着时）批量截图到 `.tmp-boot/`。

---

## 1. 需求拆解

本质是两层叠加的**启动 splash 动画**（约 2 秒，随后淡出进入应用）：

1. **时间层**（必选）：按打开时刻分四段，各有独立场景
   - 清晨 05:00–09:00：太阳从云层后升起（位移 + 光晕扩散）
   - 正午 09:00–15:00：高悬太阳 + 旋转光芒射线 + 强光晕
   - 午后/黄昏 15:00–19:00：火烧云（橙红紫渐变 + 云层染色 + 太阳西沉）
   - 夜晚 19:00–05:00：深蓝星空 + 月亮升起 + 星星闪烁（偶发流星）
2. **天气层**（叠加）：晴 / 多云 / 阴 / 雨 / 雪 / 雾 / 雷暴，作为场景内的第二层效果（雨丝、雪花、雾层、云量、闪电），不重画整个场景

## 2. 调研：成熟方案与素材

### 2.1 动画资产与制作路线

| 路线 | 代表 | 授权 | 体积/运行时 | 评价 |
|---|---|---|---|---|
| **开源天气图标集（SVG/Lottie）** | [Meteocons (basmilius)](https://github.com/basmilius/meteocons) | 免费（[官网](https://meteocons.com/) 可商用，MIT） | 动画 SVG 直接内嵌零运行时；Lottie 需 lottie-web | **本项目天气层首选**。475+ 手绘图标、4 种风格，晴/雨/雪/雾/雷暴全有，AE 级质感 |
| **Lottie 生态** | [LottieFiles 太阳月亮素材库](https://lottiefiles.com/free-animations/sun-and-moon)、lottie-web 播放器 | 素材多为免费；lottie-web MIT | lottie-web minified ~250KB（gzip ~70KB，light 版更小，**须动态 import 成独立 chunk**） | 「AE 制作效果」的行业标准就是 Lottie（AE 导出 JSON）。但我们要 4 个时段场景，逐个找素材风格难统一 |
| **Rive** | rive-app/canvas runtime | 免费档可用 | WASM 运行时，估算 gzip 90KB+（待实测） | 更现代、可交互，但学习成本高，单人项目过重 |
| **纯 CSS/SVG 自绘** | 渐变天空 + CSS keyframes + 内联 SVG | 无依赖 | **零运行时**，全部在首屏 CSS/组件内 | 可控性最强、体积最小；渐变天空按时间插值是成熟技法；太阳/月亮/云/星/雨雪都是简单形状，CSS 完全能做出高级感 |
| **React 动画库** | [Motion (framer-motion)](https://motion.dev/) | MIT | ~50KB | 项目已有 tw-animate-css，进场动画用不到时序编排库 |

### 2.2 完整实现参考（思路借鉴）

- [AndreyPetkov03/weather-app](https://github.com/AndreyPetkov03/weather-app) — React + Lottie + 自动日夜主题（白天日/云，夜晚月/星），结构与我们需求最接近
- [greywen/web-weather](https://github.com/greywen/web-weather) — 纯浏览器天气可视化：雨/雪/雾/云/日照的粒子渲染
- [SKT1803/digital-clock-dynamic-day-night-animated-weather](https://github.com/SKT1803/digital-clock-dynamic-day-night-animated-weather) — 实时太阳/月亮模拟 + 雨雪雾云动画叠层
- [yrs21/SKY-ANIMATION](https://github.com/yrs21/SKY-ANIMATION) — 傍晚日落 → 夜晚月升的最小场景

共性结论：**场景 = 多层渐变天空背景 + 一个天体（太阳/月亮）+ 云/星/粒子叠加层**，每层独立动画、CSS 合成器属性（transform/opacity）驱动，这正好是纯 CSS 路线的舒适区。

### 2.3 天气数据源

| 数据源 | 授权 | 关键点 |
|---|---|---|
| **Open-Meteo**（[官网](https://open-meteo.com/) / [GitHub](https://github.com/open-meteo/open-meteo)） | 非商用免费、**无需 API key** | GET 即得 JSON：`api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current_weather=true`；配套免费 [Geocoding API](https://open-meteo.com/en/docs/geocoding-api)（城市名→经纬度）；返回 [WMO 天气码](https://open-meteo.com/en/docs)（0 晴、1-3 多云、45/48 雾、51-67 雨、71-77 雪、95-99 雷暴），正好覆盖我们的天气分层 |
| 和风天气 QWeather | 需注册 key，有免费额度 | 国内数据质量好；多一个密钥管理项 |
| 高德天气 API | 需 key | 仅中国城市、颗粒度到区县 |

**国内可达性关键点**：让浏览器直连 api.open-meteo.com 在国内不稳定；但我们已有 Vercel serverless——由 **`/api/weather` 服务端代理**调 Open-Meteo（Vercel 函数出网无障碍），浏览器只请求同域接口，与现有 `/api/news`、`/api/projects` 同一模式，**国内可达性等同于本站本身**。零密钥、零注册。

### 2.4 启动动画工程最佳实践

- [UX Planet — Splash Screen Best Practices](https://uxplanet.org/splash-screen-design-best-practices-8148096e2fd5)：splash 不可做成假加载屏，**短且有目的**，别让用户等
- 社区标准「每次会话/每天一次」模式：`localStorage`/`sessionStorage` 记标记，播放过则直接跳过（[typeofnan 实现范例](https://typeofnan.dev/using-session-storage-in-react-with-hooks/)）
- 无障碍：[MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)、[web.dev 指南](https://web.dev/articles/prefers-reduced-motion)、[Josh Comeau 的 React 实践](https://www.joshwcomeau.com/react/prefers-reduced-motion/)——`reduce` 时**整段动画跳过**（直接呈现最终画面/直接进应用），不是只缩短时长；CSS 媒体查询兜底 + JS 逻辑层跳过双保险
- 布局与动画的 media query 分开写，避免 reduce-motion 规则破坏布局（[stuff&nonsense 的教训](https://stuffandnonsense.co.uk/blog/how-i-fixed-my-reduced-motion-broke-my-layout-problem/)）

## 3. 方案对比

| | A：纯 CSS/SVG 自绘 | B：Meteocons + lottie-web | C：Rive |
|---|---|---|---|
| 新增依赖 | **0** | lottie-web（独立 chunk ~70KB gzip） | rive runtime（WASM） |
| 视觉上限 | 高（渐变+光晕+粒子足够出效果） | 很高（图标级精致） | 最高 |
| 风格统一 | **天然统一**（一套代码出四场景+七天气） | 天气图标与时段场景两套风格，难融合 | 需专业制作 |
| 与主题系统（亮/暗）融合 | 容易（CSS 变量） | 难（Lottie JSON 颜色固定） | 难 |
| 包体预算风险 | 无（场景 CSS ~3KB + 组件 ~6KB） | 需占用预算并加 lazy chunk | 高 |
| 制作/维护成本 | 一次性写好，调参数即改观感 | 要管理多个 JSON 资产 | 最高 |

## 4. 推荐方案（待拍板）：A 为主、借 Meteocons 思路

**纯 CSS/SVG 自绘四时段场景 + 七类天气叠加层**，零新依赖：

1. **组件**：`src/app/boot-animation.tsx` 全屏 overlay（fixed inset-0 z-50），挂载于 `App` 顶层
2. **时段判定**：本地时刻 → dawn/noon/dusk/night 四段（边界用渐变过渡，如 08:30–09:30 天空插值）；场景数据（每段的天空渐变色数组、天体位置、云/星配置）定义为常量表，**调观感只改常量**
3. **天气获取**：新 serverless 单文件 `api/weather.ts`（遵守跨文件禁相对 import 约束）服务端调 Open-Meteo，`Cache-Control: s-maxage=1800`；固定城市坐标（见 §7-1）；前端拿到 WMO 码 → 映射 clear/partly/overcast/rain/snow/fog/thunder 七类
4. **降级链**（保证稳定优先）：
   - 天气接口失败/超时（>1.5s 不等了）→ 只按时间播放，**不阻塞、不报错**
   - `localStorage` 缓存最近一次天气结果 → 下次启动秒读兜底
   - `prefers-reduced-motion` 或当天已播放过 → 整段跳过
5. **播放策略**：**每天首次打开播放**（localStorage 记日期），约 2.2s + 0.6s 淡出；点击任意处立即跳过；当天再打开直接进应用
6. **体积影响**：CSS keyframes ~3KB、组件 ~6KB、api 函数不进客户端包 → **零预算压力**，check-bundle 照常通过
7. **明确不做**（延续惯例）：
   - 不引入 lottie-web/rive/framer-motion 任何新依赖
   - 不做可跳过设置项/设置页开关（点击即跳过已足够）
   - 不做实时天气桌面小组件、不下雨打雷音效
   - 不做浏览器原生 PWA splash 定制（Android manifest splash 不可控，放弃）
   - 地理定位权限不申请（固定坐标）

## 5. 场景 × 天气矩阵（初稿，可调）

| 时段 \ 天气 | 晴 | 多云 | 阴 | 雨 | 雪 | 雾 | 雷暴 |
|---|---|---|---|---|---|---|---|
| 清晨 | 太阳升出云洞 | 升起+散云 | 云盖日出 | 雨丝+暗化 | 雪落+晨光 | 雾漫+微光 | 雨+偶闪电 |
| 正午 | 强光射线 | 射线+云 | 灰白均匀 | 斜雨+云暗 | 雪飘 | 雾罩 | 雷雨+闪电 |
| 黄昏 | 火烧云 | 火烧云+云影 | 灰紫沉云 | 雨丝压红霞 | 雪映霞色 | 雾锁晚霞 | 雷暴压云 |
| 夜晚 | 月升+繁星 | 月+薄云 | 星全隐 | 夜雨+反光 | 夜雪 | 夜雾 | 夜雷暴 |

## 6. 实施清单（拍板后执行）

1. `api/weather.ts`（serverless 单文件）：代理 Open-Meteo + WMO 码归一化 + 半小时 CDN 缓存
2. `src/app/boot-animation.tsx` + `boot-animation.css`：四场景 + 七天气层 + 播放/跳过/降级逻辑
3. `src/lib/weather-store.ts`（zustand 或直接模块态）：天气码缓存与时段计算
4. 单测：时段/天气映射纯函数；E2E：跳过按钮与每日一次逻辑（session 隔离注意）
5. `docs:` 不发版；完成后按 VERSIONING 判级（feat → MINOR）

## 7. 拍板记录（2026-08-30）

1. **城市坐标**：重庆（29.563N, 106.5516E，写死在 `api/weather.ts`）
2. **播放频率**：每次冷启动都播放（不设每日一次限制）；`visibilitychange` 从后台恢复时，隐藏 ≥5 分钟（`REPLAY_AFTER_HIDDEN_MS`）才重播，短暂切窗口/切标签不重播——对应「退出后台再打开算重新打开，没退后台点进去不播」
3. **流星彩蛋**：已加（夜晚两颗错峰划过）
4. 附加决定：恶劣天气（雨/雪/雷/雾/阴）下日/月按压暗系数减淡（`celestialOpacity`），避免「雷暴当天太阳全亮」的违和
