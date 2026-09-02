# 「我的」页面改版调研资料汇编

> 2026-09-02 调研整理。配套方案见 [PLAN_ME_PAGE_REDESIGN.md](./PLAN_ME_PAGE_REDESIGN.md)。
> 本文档汇集原始调研资料（来源链接 + 核心结论 + 对本项目的映射），供方案回溯与后续迭代引用。

---

## 1. 设置页 / 个人中心布局模式

### 1.1 Setproduct《Settings UI design》全文研读

来源：https://www.setproduct.com/blog/settings-ui-design

**页面解剖 11 组件**：Header、侧边导航、Tabs、表单字段、复选框、单选、按钮组、下拉、开关、滑块、保存按钮。关键细节：
- 复选框默认未勾选（opt-in 而非 opt-out）
- 下拉选项 5–7 个封顶
- 开关靠近它控制的项，状态变化要有颜色/动画反馈
- 保存按钮用动作导向标签（Save/Apply），保存后有成功反馈

**六种布局及适用场景**：

| 布局 | 特点 | 适用 | 代表产品 |
|---|---|---|---|
| 单页 | 全部一页滚动查找 | 设置项少、移动端小屏 | Facebook |
| 标签页 | 分类 Tab 切换 | 中等数量分类 | Google Calendar |
| 手风琴 | 分类折叠展开，紧凑 | 分类多 | Gmail |
| **卡片** | 每卡一类，美观易滑动 | **移动端** | Trello |
| 侧边导航 | 左菜单右内容 | 设置项非常多的大型应用 | WordPress |
| 分步向导 | 按步引导 | 复杂初次配置 | Dropbox |

**7 个常见设计错误**：①找不到设置（缺搜索）②误操作无法挽回（缺确认/undo）③信息过载（缺渐进披露）④迷失方向（层级不清）⑤默认值不当 ⑥缺乏反馈 ⑦忽视高频用户（缺快捷键）。

**验证方法**：用户测试、问卷、数据分析（热图/点击图/录屏）、竞品对比、迭代+A/B。

**→ 本项目映射**：8 区块 + 移动端为主 → 单页卡片布局（现有形态保留，内部重组）；命中错误②（退出登录无确认）与③（色板/推送细节全平铺，应收进 Dialog/徽章）；快捷键 ✓（⌘, 已有）；保存反馈 ✓（toast 已有）。

### 1.2 UX Collective《Designing a better 'Settings' screen for your app》

来源：https://uxdesign.cc/designing-a-better-settings-page-for-your-app-fcc32fe8c724 （正文 403，经搜索摘要获取）

核心建议：**用使用数据排优先级，最高频的类别放最顶上；破坏性操作永远放列表最后**。

**→ 映射**：身份+外观置顶（高频查看）；退出登录收底。

### 1.3 Toptal《How to Improve App Settings UX》

来源：https://www.toptal.com/designers/ux/settings-ux （正文 403，经搜索摘要获取）

核心建议：**分组类别**、建立**视觉层级**、标签**避免术语**、清晰描述、**状态指示器**（status indicators，让用户一眼看出每项当前状态）。

**→ 映射**：通知订阅/Server酱/备份/存储全部补状态徽章（已开启/未开启、上次备份时间）；本页现状按钮文字暗含状态，不达标。

### 1.4 其他佐证

- [Uxcel：Settings best practices](https://uxcel.com/lessons/settings-best-practices-572)：按实际使用频率排控件优先级。
- [Medium：Designing profile, account, and setting pages](https://medium.com/design-bootcamp/designing-profile-account-and-setting-pages-for-better-ux-345ef4ca1490)：用「Account / Your account」或头像做明确标识。
- [UntitledUI：42 个设置页组件实例](https://www.untitledui.com/components/settings-pages)：Profile / Notifications / Appearance / Integrations 的分区切法是 SaaS 通识，佐证本页「外观/通知/数据/账号」分组方向。
- [UX StackExchange：Best layout for a settings page](https://ux.stackexchange.com/questions/48214/best-layout-for-a-settings-page)：设置项多时直链到表单页，避免长页堆表单。

## 2. 参照实现（shadcn 生态）

- [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)（2.8k★）：Profile / Account / Settings 分页；身份区在上、表单分组、危险操作隔离。
- [shadcn 官方 dashboard 示例](https://ui.shadcn.com/examples/dashboard)：经典 profile 设置表单（显示名/邮箱/通知三段）。
- [awesome-shadcn-ui](https://github.com/birobirobiro/awesome-shadcn-ui)：组件资源索引（备用）。

共同结构范式（与移动端「我的」Tab 成熟范式一致——Todoist / Things 3 / Apple 设置业内通识）：**身份头卡 → 关键数字 → 分组行列表（圆角分组、行内右箭头/开关、状态徽章）→ 关于/退出收底**。

## 3. 个人数据呈现

- 本项目首页 v1.19–v1.21 已验证的视觉语言：纯 SVG 趋势图（砍 recharts -312KB）+ KPI 四格条 + 14 天热力条 + font-numeric 数字。「我的」页直接复用同款组件——**视觉一致即设计感，且零体积成本**，不再另起炉灶。
- 口径分离原则：**近期（本周报告）与累计（存量 6 格）分层、各自标注口径**。教训来源：v1.9 曾把「累计完成」改成「当日」语义导致 UI 错误+红测试（AGENTS 避坑清单：UI 文案是语义的最终依据）。
- 拒绝的指标发明：「使用天数」（本地模式无账号创建时间，语义不可靠）、「等级/积分系统」（花架子，违反"实用>花架子"准绳）。

## 4. PWA「添加到主屏幕」安装引导

### 4.1 标准路径（Chromium 系：Android Chrome/Edge、桌面 Chrome/Edge）

MDN / web.dev 通识（业内标准，无单一引用页）：
1. 浏览器在满足安装条件时派发 **`beforeinstallprompt`** 事件 → 页面 `e.preventDefault()` 并**暂存事件对象**（`BeforeInstallPromptEvent`，含 `prompt()` 方法与 `userChoice` promise）。
2. 页面放自定义「安装」按钮，点击时调用暂存事件的 `prompt()` → 弹出原生安装气泡。
3. **事件对象一次性**：调用过 `prompt()` 或用户忽略后不可复用，需清空引用。
4. 安装完成后派发 **`appinstalled`** 事件 → 收起安装入口。
5. 已安装判定：`matchMedia('(display-mode: standalone)')`；iOS 另有 `navigator.standalone === true`。

**关键工程陷阱（本方案已规避）**：`beforeinstallprompt` 在页面加载早期就可能派发——**监听必须挂在常驻壳层（Shell）而不是设置页组件**，否则用户直接打开应用后先进别的页面、再进设置页时事件早已丢失，按钮永远不出现。实现为 `src/lib/pwa-install.ts` 模块级 store + Shell 调 `capturePwaInstall()` + `usePwaInstall()` 订阅。

### 4.2 iOS Safari

苹果**不开放**安装 API：无 `beforeinstallprompt`，只能引导手动「分享 → 添加到主屏幕」。本项目通知区已有同类平台提示先例（`notifications-section.tsx:105`「iPhone：请先添加到主屏幕」），交互模式沿用。

### 4.3 本项目现状

`grep beforeinstallprompt` 全库 **0 命中**；`vite.config.ts` 已有 manifest（standalone、theme_color #5B8A72）+ SW 运行时缓存（v1.8）。即：PWA 本体完备，只缺安装引导 UI。该项目重 PWA（手机主屏幕是核心使用方式），这是真实实用缺口而非花架子。

## 5. 调研结论与项目约束的对撞裁决

（详见 PLAN §2.4 表格：拒绝图表库回流 / Tabs 大改版 / 头像上传 / 指标发明 / 逻辑重写；采纳 PWA 安装行 / 应用内更新日志 / streak 里程碑徽章。）

## 6. 来源清单

| 来源 | 用途 |
|---|---|
| https://www.setproduct.com/blog/settings-ui-design | 布局六型 + 7 错误清单（全文） |
| https://uxdesign.cc/designing-a-better-settings-page-for-your-app-fcc32fe8c724 | 频率排序 + 破坏性收底 |
| https://www.toptal.com/designers/ux/settings-ux | 状态指示器 + 分组原则 |
| https://uxcel.com/lessons/settings-best-practices-572 | 频率优先级 |
| https://medium.com/design-bootcamp/designing-profile-account-and-setting-pages-for-better-ux-345ef4ca1490 | Account 标识 |
| https://www.untitledui.com/components/settings-pages | 42 例分区切法 |
| https://ux.stackexchange.com/questions/48214/best-layout-for-a-settings-page | 布局讨论 |
| https://github.com/satnaing/shadcn-admin | 参照实现 |
| https://ui.shadcn.com/examples/dashboard | 官方 profile 表单示例 |
| https://github.com/birobirobiro/awesome-shadcn-ui | 资源索引 |
| MDN `BeforeInstallPromptEvent` / web.dev install Criteria（业内标准） | PWA 安装路径 |
