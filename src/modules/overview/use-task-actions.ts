import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { repository } from '@/lib/db'
import { useConfirm } from '@/components/confirm-context'
import { useTaskMutations, taskKeys } from './api'
import { completionPatch, isDoneForToday, reopenPatch } from '@/lib/task-rules'
import { todayStr, type Task } from '@/lib/db/types'
import { nextOccurrence } from '@/lib/repeat'
import { dayLabel } from '@/lib/day-plan'
import { usePlanWrites } from './day-plan-api'

export interface CompleteOptions {
  /** 完成之后紧接着要做的界面动作（今日页：展开「已完成」分区，否则任务坠进折叠区等于隐形） */
  after?: () => void
  /** toast 标题覆盖（提醒中心说「提醒已消除」比「已完成」更贴近它解决的问题） */
  title?: string
}

/**
 * 任务操作的唯一入口（v1.35）。
 *
 * 为什么必须收敛到一个 hook：v1.34 之前「完成」有四种写法 —— 今日待办的 toggleDone、
 * 提醒中心的 complete、首页汇总弹窗直接写 `status:'done'`、逾期区「清理历史待办」也直接写 `status:'done'`。
 * 后两处绕过了 lib/task-rules 的重复任务规则：勾掉一条「每天」任务会把整条序列终结掉（D-01 / D-19），
 * 次日它不再出现，而用户以为自己只是完成了今天这一次。
 *
 * 分工：规则本身是纯函数（lib/task-rules.ts，可单测），这里只负责「派生补丁 → 落库 → 回执」。
 * 所以不要在这里加规则分支 —— 要改规则就去改 task-rules，四个入口一起生效。
 */
export function useTaskActions() {
  const { update, remove } = useTaskMutations()
  const qc = useQueryClient()
  const confirm = useConfirm()
  // 计划项（v1.35）：完成/撤销同时写一条事实记录，复盘才有"当天计划了 N 项"可算
  const plan = usePlanWrites()
  const today = todayStr()

  function complete(t: Task, opts?: CompleteOptions) {
    const { patch, undo, nextDue } = completionPatch(t, today)
    update.mutate({ id: t.id, patch })
    void plan.done(t, today)
    opts?.after?.()
    toast.success(opts?.title ?? '已完成', {
      description: nextDue ? `「${t.title}」下次：${nextDue}` : `「${t.title}」已划线保留`,
      action: {
        label: '撤销',
        onClick: () => {
          update.mutate({ id: t.id, patch: undo })
          void plan.undone(t, today) // 撤销完成 = 计划项 done_at 也回退，否则进度账本会重复计
        },
      },
      duration: 5000,
    })
  }

  function reopen(t: Task) {
    update.mutate({ id: t.id, patch: reopenPatch(t, today) })
    void plan.undone(t, today)
    toast.success('已撤销完成', { description: `「${t.title}」回到待办`, duration: 3000 })
  }

  /** 方块点击：已完成 → 撤销，未完成 → 完成。方向判定用 isDoneForToday（重复任务当天 status 仍是 todo） */
  function toggle(t: Task, opts?: CompleteOptions) {
    if (isDoneForToday(t, today)) reopen(t)
    else complete(t, opts)
  }

  /**
   * 改期（v1.35）：写 dueDate + 计划项留痕（旧日 moved_to / 新日补一条），并给回执。
   * 原实现只有一行 `update.mutate({ dueDate })`——没有任何反馈，改完当场看不出发生了什么，
   * 更没法撤销（委托书 2.1 的痛点"改期后 1 次点击可核对"）。
   */
  function reschedule(t: Task, date: string, opts?: { title?: string }) {
    const from = t.dueDate
    update.mutate({ id: t.id, patch: { dueDate: date } })
    void plan.move(t, date, today)
    toast.success(opts?.title ?? `已改到${dayLabel(date, today)}`, {
      description: `「${t.title}」`,
      action: {
        label: '撤销',
        onClick: () => {
          update.mutate({ id: t.id, patch: { dueDate: from } })
          void plan.unmove(t, from ?? today, date)
        },
      },
      duration: 6000,
    })
  }

  /** 重复任务「跳过一次」：只推进 dueDate、不记完成，同样给回执（否则任务凭空换天） */
  function skipOnce(t: Task) {
    if (!t.repeat) return
    const from = t.dueDate
    const next = nextOccurrence(t.dueDate ?? today, t.repeat, null, today)
    update.mutate({ id: t.id, patch: { dueDate: next } })
    toast.success(`已跳过这一次，下次 ${next}`, {
      action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { dueDate: from } }) },
      duration: 5000,
    })
  }

  /**
   * 批量完成（逾期清理、晚间收尾）：逐条派生各自的补丁，只弹一个汇总 toast + 一次撤销。
   * 逐条而不是批量接口：两者都是 N 次仓储写入，而逐条能保留「哪一条是哪一种完成语义」，
   * 撤销时按各自的 undo 原值写回（重复任务还原 dueDate，普通任务还原 status），不会串味。
   */
  function completeMany(list: Task[], opts?: { title?: string }) {
    if (list.length === 0) return
    const plans = list.map(t => ({ task: t, ...completionPatch(t, today) }))
    plans.forEach(({ task, patch }) => {
      update.mutate({ id: task.id, patch })
      void plan.done(task, today)
    })
    toast.success(opts?.title ?? `已处理 ${plans.length} 项`, {
      action: {
        label: '撤销',
        onClick: () => plans.forEach(({ task, undo }) => {
          update.mutate({ id: task.id, patch: undo })
          void plan.undone(task, today)
        }),
      },
      duration: 6000,
    })
  }

  /** 延期：清空日期进「以后 · 待安排」（不动 status —— 它仍然是待办，只是没有日子） */
  function defer(t: Task) {
    const before = t.dueDate
    update.mutate({ id: t.id, patch: { dueDate: null } })
    toast.success('已延期到「待安排」', {
      description: '在「以后」段可以再给它定日期',
      action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { dueDate: before } }) },
      duration: 5000,
    })
  }

  /** 搁置：进「将来」收件箱（status=someday）。与延期的区别是"这件事还没想清楚要不要做" */
  function shelve(t: Task) {
    const before = { status: t.status, dueDate: t.dueDate }
    update.mutate({ id: t.id, patch: { status: 'someday', dueDate: null } })
    toast.success('已搁置到「将来」', {
      action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: before }) },
      duration: 5000,
    })
  }

  /** 「进行中」开关：v1.31 的胶囊出口，v1.35 卡片瘦身后挪进操作面板 */
  function toggleDoing(t: Task) {
    update.mutate({ id: t.id, patch: { status: t.status === 'doing' ? 'todo' : 'doing' } })
  }

  /**
   * 删除（v1.35）：二次确认 + 6 秒撤销。
   * 原实现的垃圾桶按钮一点就删、没有任何回执——手机上误触一次就没了（委托书 5.2「删除防误触」）。
   * 撤销走 repository.restoreTask 保留原 id：计划项、专注记录指向的是这个 id。
   */
  async function removeTask(t: Task) {
    const ok = await confirm({
      title: `删除「${t.title}」？`,
      description: '删除后 6 秒内可以从提示条里撤销。',
      confirmLabel: '删除',
      destructive: true,
    })
    if (!ok) return
    remove.mutate(t.id)
    toast.success('已删除', {
      description: `「${t.title}」`,
      action: {
        label: '撤销',
        onClick: () => {
          void (async () => {
            try {
              await repository.restoreTask(t)
              await qc.invalidateQueries({ queryKey: taskKeys.all })
            } catch {
              toast.error('恢复失败，请重试')
            }
          })()
        },
      },
      duration: 6000,
    })
  }

  return { complete, reopen, toggle, completeMany, reschedule, skipOnce, removeTask, defer, shelve, toggleDoing }
}
