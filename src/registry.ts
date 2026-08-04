import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

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
 *  当前为空数组——各模块在后续任务中逐步注册：
 *  Task 6 注册 overview（home 占位组件）、Task 9+ 注册各自模块。 */
export const modules: ModuleDef[] = []

/** 全部子模块扁平化 */
export const allSubModules: SubModuleDef[] = modules.flatMap(m => m.children)
/** 按 id 查子模块 */
export function subModuleById(id: string) { return allSubModules.find(s => s.id === id) }
/** 主模块下子模块 id 集合 */
export function subIdsOf(moduleId: string) { return modules.find(m => m.id === moduleId)?.children.map(c => c.id) ?? [] }
/** 首页卡片（按桌面顺序排好，供 home.tsx 使用） */
export function homeCards() {
  return allSubModules
    .map(s => s.homeCard && { ...s.homeCard, subId: s.id })
    .filter(Boolean) as (HomeCardDef & { subId: string })[]
}
