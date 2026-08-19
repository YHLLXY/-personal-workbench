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
  /** 桌面端 12 列网格跨度（3/4/5/7/12） */
  span: string
  /** 移动端首页顺序（越小越靠前；-1 不显示） */
  mobileOrder: number
  /** 桌面端首页顺序 */
  desktopOrder: number
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
        homeCard: { id: 'home-trend', span: '5', mobileOrder: -1, desktopOrder: 8, component: WeeklyTrendCard },
      },
      {
        id: 'tasks', name: '今日待办', icon: CheckCircle2, path: '/tasks',
        component: lazyRetry(() => import('./modules/overview/today-tasks')),
        homeCard: { id: 'home-tasks', span: '5', mobileOrder: 1, desktopOrder: 1, component: TodayTasksCard },
      },
      {
        id: 'reminders', name: '提醒', icon: Bell, path: '/reminders',
        component: lazyRetry(() => import('./modules/reminders/reminders-center')),
        badge: () => { const n = useReminderStore.getState().unread; return n > 0 ? String(n) : null },
      },
      {
        id: 'projects', name: '我的项目', icon: FolderKanban, path: '/projects',
        component: lazyRetry(() => import('./modules/projects/projects')),
        homeCard: { id: 'home-projects', span: '5', mobileOrder: 6, desktopOrder: 9, component: ProjectsCard },
      },
    ],
  },
  {
    id: 'study', name: '学习与科研', icon: BookOpen,
    children: [
      {
        id: 'study-manager', name: '学习管理', icon: BookOpen, path: '/study',
        component: lazyRetry(() => import('./modules/study/study-manager')),
        homeCard: { id: 'home-exams', span: '3', mobileOrder: 2, desktopOrder: 2, component: ExamsCard },
      },
      {
        id: 'pomodoro', name: '番茄钟', icon: Timer, path: '/pomodoro',
        component: lazyRetry(() => import('./modules/study/pomodoro')),
        homeCard: { id: 'home-focus', span: '4', mobileOrder: 3, desktopOrder: 3, component: FocusCard },
      },
    ],
  },
  {
    id: 'news', name: '资讯与资料', icon: Newspaper,
    children: [
      {
        id: 'hot', name: '今日热点', icon: Newspaper, path: '/hot',
        component: lazyRetry(() => import('./modules/news/hot')),
        homeCard: { id: 'home-hot', span: '5', mobileOrder: -1, desktopOrder: 4, component: HotCard },
      },
      {
        id: 'papers', name: '资料库', icon: Library, path: '/papers',
        component: lazyRetry(() => import('./modules/news/papers')),
      },
      {
        id: 'notes', name: '灵感速记', icon: Sparkles, path: '/notes',
        component: lazyRetry(() => import('./modules/news/notes')),
        homeCard: { id: 'home-notes', span: '12', mobileOrder: -1, desktopOrder: 5, component: NotesCard },
      },
    ],
  },
  {
    id: 'health', name: '健康', icon: HeartPulse,
    children: [
      {
        id: 'health', name: '运动健康', icon: HeartPulse, path: '/health',
        component: lazyRetry(() => import('./modules/health/health')),
        homeCard: { id: 'home-heatmap', span: '7', mobileOrder: 4, desktopOrder: 6, component: HeatmapCard },
      },
    ],
  },
  {
    id: 'review', name: '复盘', icon: RotateCcw,
    children: [
      {
        id: 'review', name: '今日复盘', icon: RotateCcw, path: '/review',
        component: lazyRetry(() => import('./modules/review/review')),
        homeCard: { id: 'home-review', span: '12', mobileOrder: 5, desktopOrder: 7, component: ReviewCard },
      },
    ],
  },
  {
    id: 'growth', name: '成长', icon: TrendingUp,
    children: [
      {
        id: 'growth', name: '自我提升', icon: TrendingUp, path: '/growth',
        component: lazyRetry(() => import('./modules/growth/growth')),
        homeCard: { id: 'home-growth', span: '5', mobileOrder: 7, desktopOrder: 10, component: GrowthCard },
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
