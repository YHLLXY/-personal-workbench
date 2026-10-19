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

/** 卡片标识（v1.32）：**底色一律中性，紧急度走左侧 3px 状态轨，焦点仍是金色外框**。
 *  v1.31 用整卡淡色（destructive/8、accent/12），实测与白卡对比只有 1.18:1 / 1.13:1、深色模式 1.006:1——
 *  等于用没人能读到的色差编码信息（用户反馈「底色太淡」）。换成有确定形状的实色轨道，深浅色模式都成立。
 *  低优先级**不给轨道**：三档都上轨等于都不突出。
 *  完成态轨道保留、降到 40% 不透明度：颜色是"褪到背景里"而不是"突然消失"（用户反馈的第二点）。 */
export interface TaskTone { rail: string | null; border: string }

export function taskCardTone(task: Pick<Task, 'priority' | 'focus'>, done = false): TaskTone {
  // 「中」用 --priority（不是 --accent）：accent 在白卡上只有 1.64:1，3px 轨道等于没画
  const base = task.priority === 'high' ? 'bg-destructive' : task.priority === 'medium' ? 'bg-priority' : null
  const rail = base ? (done ? `${base} opacity-40` : base) : null
  const border = done || !task.focus ? 'border-border' : 'border-amber-400/70'
  return { rail, border }
}
