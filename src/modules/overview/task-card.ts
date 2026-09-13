/** 今日待办卡片纯函数（v1.25）——从 task-item.tsx 拆出，避免组件文件导出纯函数（fast-refresh 警告） */

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
