import { CalendarClock, Check, Clock, GripVertical, MoreHorizontal, Repeat, RotateCcw, Star } from 'lucide-react'
import { todayStr, type Task } from '@/lib/db/types'
import { repeatLabel } from '@/lib/repeat'
import { dueDateChip, taskCardTone } from './task-card'
import type { DragHandleProps } from '@/lib/drag-sort'
import { cn } from '@/lib/utils'

const PRIORITY_DOT: Record<Task['priority'], string> = { high: 'bg-destructive', medium: 'bg-priority', low: 'bg-muted-foreground/40' }
const PRIORITY_CN: Record<Task['priority'], string> = { high: '高', medium: '中', low: '低' }

/**
 * 任务卡 v2（v1.35，委托书 5.2）。
 *
 * 改动的唯一原因：v1.34 的一张卡上有 **7 个可点元素**（勾选框、标题、星标、清单箭头、⋯、垃圾桶、进行中胶囊），
 * 右侧控件簇占了约 96px，标题被挤到只能缩字。手机上每个 18px 图标都是误触源，误触删除更是没有回执。
 *
 * 现在卡上只留 3 个可点区：**勾选框 / 标题 / ⋯**。其余全部收进操作面板（task-actions-sheet）。
 * 徽章行是纯展示（信息还在，只是不再抢点击）；清单计数、重复规则、备注都照旧显示。
 */
export function TaskItem({ task, done: doneOverride, onToggle, onOpen, drag }: {
  task: Task
  /** done 覆盖：repeat 任务完成当天 status 仍是 todo（同一行滚动），由调用方用 isDoneForToday 收容 */
  done?: boolean
  onToggle: () => void
  /** 打开操作面板（改期 / 延期 / 搁置 / 拆分 / 编辑 / 删除都在这一个入口后面） */
  onOpen: () => void
  drag?: { id: string; handle: DragHandleProps }
}) {
  const done = doneOverride ?? task.status === 'done'
  const checklist = task.checklist ?? []
  const checklistDone = checklist.filter(c => c.done).length
  const note = task.note?.trim()
  const chip = dueDateChip(task.dueDate, todayStr())
  const tone = taskCardTone(task, done)

  return (
    // data-flip-id：FLIP 布局动画锚点（src/lib/flip.ts）——同列表重排平滑，今日↔已完成跨区块连续滑移
    <div data-flip-id={task.id} data-drag-id={drag?.id}
      className={cn('group relative overflow-hidden border rounded-xl px-3 py-2.5 transition-colors', done ? 'bg-muted/40 border-border' : cn('bg-card', tone.border))}>
      {/* 左侧状态轨（v1.32）：3px 实色轨道，完成态降透明度（褪色而不是消失） */}
      {tone.rail && <span aria-hidden data-rail className={cn('absolute inset-y-0 left-0 w-[3px] transition-opacity duration-200', tone.rail)} />}
      <div className="flex items-start gap-2">
        {/* 拖拽把手只在「今天」段出现，24×44 触控区（touch-action:none 与 contextmenu 拦截在 handleProps 里） */}
        {drag && (
          <button type="button" aria-label="拖动排序" {...drag.handle}
            className="shrink-0 -my-1 self-stretch flex items-center px-0.5 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
            <GripVertical className="size-3.5" />
          </button>
        )}
        {/* 勾选框：44×44 触控区靠 padding 撑开（视觉仍是 18px 方块，手指按得准） */}
        <button onClick={onToggle} aria-label={done ? '撤销完成' : '完成'} title={done ? '撤销完成' : '标记完成'}
          className="group/check -m-2.5 shrink-0 p-2.5 flex items-start justify-center">
          <span className={cn('size-[18px] mt-0.5 rounded-md border-[1.5px] flex items-center justify-center transition-all active:scale-90',
            done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
            {done && (
              // 完成态：常态对勾，悬停变 ↺（Todoist/Things 式撤销暗示）
              <>
                <Check className="size-3 group-hover/check:hidden" strokeWidth={3} />
                <RotateCcw className="hidden size-3 group-hover/check:block" strokeWidth={2.5} />
              </>
            )}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {/* 焦点：金黄色实心星（纯展示，切换在操作面板里） */}
            {task.focus && !done && <Star className="size-3.5 shrink-0 mt-[3px] text-amber-500 fill-amber-400" strokeWidth={1.7} aria-label="今日焦点" />}
            <span className={cn('size-2 rounded-full shrink-0 mt-[6px]', PRIORITY_DOT[task.priority])} title={'优先级 ' + PRIORITY_CN[task.priority]} />
            {/* 颜色不是唯一载体（WCAG 1.4.1）：读屏用户靠这行文字拿到优先级 */}
            <span className="sr-only">优先级 {PRIORITY_CN[task.priority]}。</span>
            <button onClick={onOpen} className="flex-1 min-w-0 text-left">
              <span className={cn('block text-sm leading-snug break-words transition-all duration-300', done && 'line-through text-muted-foreground')}>{task.title}</span>
            </button>
          </div>
          {/* v1.25 备注：line-clamp-2 防列表爆炸，全文进操作面板看 */}
          {note && (
            <p title={note} className="mt-1 pl-4 text-xs leading-relaxed text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">{note}</p>
          )}
          {(chip || task.dueTime || task.repeat || task.focus || task.status === 'doing' || checklist.length > 0 || task.tags.length > 0 || (done && task.completedAt)) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 pl-4 text-[10px] text-muted-foreground">
              {chip && <span className={cn('flex items-center gap-0.5', chip.overdue && 'text-destructive font-medium')}><CalendarClock className="size-3" />{chip.label}</span>}
              {task.dueTime && <span className="flex items-center gap-0.5"><Clock className="size-3" />{task.dueTime}</span>}
              {task.repeat && <span className="flex items-center gap-0.5"><Repeat className="size-3" />{repeatLabel(task.repeat, task.dueDate)}</span>}
              {task.focus && !done && <span className="bg-amber-400/20 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5">今日焦点</span>}
              {task.status === 'doing' && !done && <span className="bg-primary/12 text-primary rounded-full px-2 py-0.5">进行中</span>}
              {checklist.length > 0 && (
                <span className={cn('rounded-full px-1.5 py-px', checklistDone === checklist.length ? 'bg-primary/12 text-primary' : 'bg-muted')}>
                  清单 {checklistDone}/{checklist.length}
                </span>
              )}
              {task.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-1.5 py-px">{tag}</span>)}
              {done && task.completedAt && <span>完成于 {new Date(task.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          )}
        </div>
        {/* 唯一的操作入口：右侧控件簇从 96px 收到 44px，标题可用宽度 +12% */}
        <button onClick={onOpen} aria-label="更多操作" title="更多操作"
          className="-m-2.5 shrink-0 self-center p-2.5 text-muted-foreground/50 hover:text-foreground transition-colors">
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  )
}
