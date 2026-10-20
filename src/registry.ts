import { Bell, BookOpen, CheckCircle2, FolderKanban, HeartPulse, LayoutDashboard, Library, Newspaper, RotateCcw, Sparkles, Timer, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { lazyRetry } from './lib/lazy-retry'
import { useReminderStore } from './modules/reminders/store'
import { TodayTasksCard } from './modules/overview/cards'
import { ExamsCard, FocusCard } from './modules/study/cards'
import { HotCard, NotesCard } from './modules/news/cards'
import { HeatmapCard } from './modules/health/cards'
import { ReviewCard } from './modules/review/cards'
import { WeeklyTrendCard } from './modules/overview/weekly-trend'
import { ProjectsCard } from './modules/projects/cards'
import { GrowthCard } from './modules/growth/cards'

export interface HomeCardDef {
  id: string
  /** 桌面端首页顺序 = 12 列 Bento 的行流顺序（v1.33 起）。天气卡不走 registry，固定排第一。 */
  desktopOrder: number
  /** 12 列网格里占几列（v1.33）。
   *  ⚠️ 同一行的跨度之和必须等于 12：grid-auto-flow: row 不会回退，
   *  填不满的那一行会在右边留一个洞。tests/home-bento.test.ts 守着这条。
   *  md（768–1279）一律两列，只有 xl（≥1280）才用真实跨度——映射见 src/lib/bento.ts。 */
  span: 4 | 6 | 8 | 12
  component: ComponentType
}

export interface SubModuleDef {
  id: string
  name: string
  icon: LucideIcon
  path: string
  /** 懒加载组件 */
  component: ComponentType
  homeCard?: HomeCardDef
  /** 侧边栏角标数字（如待办数），返回 null 不显示 */
  badge?: () => string | null
}

export interface ModuleDef {
  id: string
  name: string
  icon: LucideIcon
  children: SubModuleDef[]
}

/** 模块注册表：侧边栏 / 底部 Tab / 路由 / 首页卡片 全部由它生成。
 *  模块在各自任务中逐步注册：Task 6 已注册 overview；Task 9+ 注册其余模块。 */
export const modules: ModuleDef[] = [
  {
    id: 'overview', name: '总览与设计', icon: LayoutDashboard,
    children: [
      {
        id: 'home', name: '工作台总览', icon: LayoutDashboard, path: '/',
        component: lazyRetry(() => import('./app/home')),
        homeCard: { id: 'home-trend', desktopOrder: 3, span: 4, component: WeeklyTrendCard },
      },
      {
        id: 'tasks', name: '今日待办', icon: CheckCircle2, path: '/tasks',
        component: lazyRetry(() => import('./modules/overview/today-tasks')),
        homeCard: { id: 'home-tasks', desktopOrder: 2, span: 4, component: TodayTasksCard },
      },
      {
        id: 'reminders', name: '提醒', icon: Bell, path: '/reminders',
        component: lazyRetry(() => import('./modules/reminders/reminders-center')),
        badge: () => { const n = useReminderStore.getState().unread; return n > 0 ? String(n) : null },
      },
      {
        id: 'projects', name: '我的项目', icon: FolderKanban, path: '/projects',
        component: lazyRetry(() => import('./modules/projects/projects')),
        homeCard: { id: 'home-projects', desktopOrder: 7, span: 4, component: ProjectsCard },
      },
    ],
  },
  {
    id: 'study', name: '学习与科研', icon: BookOpen,
    children: [
      {
        id: 'study-manager', name: '学习管理', icon: BookOpen, path: '/study',
        component: lazyRetry(() => import('./modules/study/study-manager')),
        homeCard: { id: 'home-exams', desktopOrder: 8, span: 4, component: ExamsCard },
      },
      {
        id: 'pomodoro', name: '番茄钟', icon: Timer, path: '/pomodoro',
        component: lazyRetry(() => import('./modules/study/pomodoro')),
        homeCard: { id: 'home-focus', desktopOrder: 4, span: 4, component: FocusCard },
      },
    ],
  },
  {
    id: 'news', name: '资讯与资料', icon: Newspaper,
    children: [
      {
        id: 'hot', name: '今日热点', icon: Newspaper, path: '/hot',
        component: lazyRetry(() => import('./modules/news/hot')),
        homeCard: { id: 'home-hot', desktopOrder: 1, span: 8, component: HotCard },
      },
      {
        id: 'papers', name: '资料库', icon: Library, path: '/papers',
        component: lazyRetry(() => import('./modules/news/papers')),
      },
      {
        id: 'notes', name: '灵感速记', icon: Sparkles, path: '/notes',
        component: lazyRetry(() => import('./modules/news/notes')),
        homeCard: { id: 'home-notes', desktopOrder: 9, span: 4, component: NotesCard },
      },
    ],
  },
  {
    id: 'health', name: '健康', icon: HeartPulse,
    children: [
      {
        id: 'health', name: '运动健康', icon: HeartPulse, path: '/health',
        component: lazyRetry(() => import('./modules/health/health')),
        homeCard: { id: 'home-heatmap', desktopOrder: 5, span: 4, component: HeatmapCard },
      },
    ],
  },
  {
    id: 'review', name: '复盘', icon: RotateCcw,
    children: [
      {
        id: 'review', name: '今日复盘', icon: RotateCcw, path: '/review',
        component: lazyRetry(() => import('./modules/review/review')),
        homeCard: { id: 'home-review', desktopOrder: 10, span: 4, component: ReviewCard },
      },
    ],
  },
  {
    id: 'growth', name: '成长', icon: TrendingUp,
    children: [
      {
        id: 'growth', name: '自我提升', icon: TrendingUp, path: '/growth',
        component: lazyRetry(() => import('./modules/growth/growth')),
        homeCard: { id: 'home-growth', desktopOrder: 6, span: 4, component: GrowthCard },
      },
    ],
  },
]

/** 全部子模块扁平化 */
export const allSubModules: SubModuleDef[] = modules.flatMap(m => m.children)
/** 按 id 查子模块 */
export function subModuleById(id: string) { return allSubModules.find(s => s.id === id) }
/** 主模块下子模块 id 集合 */
export function subIdsOf(moduleId: string) { return modules.find(m => m.id === moduleId)?.children.map(c => c.id) ?? [] }
/** 首页卡片（flatMap 顺序，供 home.tsx 使用时自行 sort） */
export function homeCards() {
  return allSubModules
    .map(s => s.homeCard && { ...s.homeCard, subId: s.id })
    .filter(Boolean) as (HomeCardDef & { subId: string })[]
}
