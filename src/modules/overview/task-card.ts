/** 今日待办卡片纯函数（v1.25）——从 task-item.tsx 拆出，避免组件文件导出纯函数（fast-refresh 警告） */
import type { Task } from '@/lib/db/types'

export interface DueChip { label: string; overdue: boolean }

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 卡片上的到期日徽章（Todoist 日期配色惯例：逾期红）。
 * 无日期或到期日=今天 → null（今日区全区都是今天，逐行重复「今天」是噪音）；
 * 焦点任务可能提前到期（未来日）→ 灰字提示；逾期 → 红字补上源日期（此前逾期卡看不到原本到期日）。
 */
export function dueDateChip(dueDate: string | null, today: string): DueChip | null {
  if (!dueDate || dueDate === today) return null
  const d = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return {
    label: `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK_CN[d.getDay()]}`,
    overdue: dueDate < today,
  }
}

/** 卡片配色（v1.31）：**底色 = 紧急程度，边框 = 焦点优先于紧急程度**。
 *  用主题令牌 + 透明度而不是硬编码色值，深浅色模式自动成立（--destructive #C96A5B / --accent #D9C9A3 本就在暖色系里）。
 *  低优先级刻意**不着色**：三档都上色等于都不突出，低优先级不该抢注意力。
 *  焦点只换边框不换底色 —— 用户明确要求「里面底色还是根据紧急程度」，金色框 + 优先级底色可以同时读出来。 */
export interface TaskTone { card: string; border: string }

export function taskCardTone(task: Pick<Task, 'priority' | 'focus'>): TaskTone {
  const card = task.priority === 'high' ? 'bg-destructive/8' : task.priority === 'medium' ? 'bg-accent/12' : 'bg-card'
  const border = task.focus ? 'border-amber-400/70'
    : task.priority === 'high' ? 'border-destructive/30'
    : task.priority === 'medium' ? 'border-accent/40'
    : 'border-border'
  return { card, border }
}
