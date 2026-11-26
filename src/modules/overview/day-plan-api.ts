import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '@/lib/db'
import type { PlanItem, Task } from '@/lib/db/types'
import { completePlanInput, materialize, reopenPlanInput, reschedulePlan } from '@/lib/day-plan'

export const planKeys = { all: ['planItems'] as const }

export function usePlanItems() {
  return useQuery({ queryKey: planKeys.all, queryFn: () => repository.listPlanItems() })
}

/**
 * 物化今天的计划项（v1.35）：进入今日页时，把「今天该有计划项但还没有」的任务补成行。
 *
 * 为什么放在 hook 里而不是建任务时写：任务可能在别的设备/别的入口建，日期也可能被改来改去；
 * 只有「这一天真的被打开」才是"这是我今天的计划"的可靠证据。幂等由 materialize 保证（已有行不重复插）。
 *
 * 失败一律静默降级（迁移 019 未执行时是 PGRST204/42P01，本地模式是配额满）：
 * 今日页照常可用，复盘显示「从 v1.35 起记录」，绝不让计划项的写入阻塞主流程。
 * attempted 记录已经试过的 (日期|任务)：否则「写成功但读不回来」会让这条 effect 无限重试。
 */
export function usePlanMaterialize(tasks: Task[] | undefined, items: PlanItem[] | undefined, date: string) {
  const qc = useQueryClient()
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!tasks || !items) return
    const need = materialize(tasks, items, date).filter(i => !attempted.current.has(`${i.planDate}|${i.taskId}`))
    if (need.length === 0) return
    need.forEach(i => attempted.current.add(`${i.planDate}|${i.taskId}`))
    void (async () => {
      try {
        for (const input of need) await repository.upsertPlanItem(input)
      } catch (err) {
        console.warn('[day-plan] 计划项物化失败，已静默降级（迁移 019 未执行？）', err)
        return
      }
      void qc.invalidateQueries({ queryKey: planKeys.all })
    })()
  }, [tasks, items, date, qc])
}

/**
 * 计划项的写路径（完成 / 撤销 / 改期 / 撤销改期）。
 *
 * 全部 fire-and-forget + 静默降级：计划项是"事实记录"，不是主状态。
 * 任务本身的完成先落库，计划项写失败只影响复盘精度，不影响用户手上这件事。
 */
export function usePlanWrites() {
  const qc = useQueryClient()
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
      void qc.invalidateQueries({ queryKey: planKeys.all })
    } catch (err) {
      console.warn('[day-plan] 计划项写入失败，已静默降级', err)
    }
  }
  return {
    /** 完成：upsert done_at（计划项可能还没物化——用户一进页面就勾完成） */
    done: (t: Task, today: string) => run(() => repository.upsertPlanItem(completePlanInput(t, today))),
    /** 撤销完成：清 done_at，行保留。
     *  不能拿 t.dueDate 当行键——重复任务完成后 dueDate 已经滚到下一期，撤销时它指向的是明天，
     *  照它去写会（a）今天那条的 done_at 留脏、（b）明天凭空多一条空计划。
     *  所以先按 taskId 找出「真正有完成时间」的那几行，再按它们各自的 planDate 精确清空。 */
    undone: (t: Task, today: string) => run(async () => {
      const items = await repository.listPlanItems()
      const done = items.filter(i => i.taskId === t.id && i.doneAt !== null)
      const rows = done.length > 0
        ? done.map(i => ({ planDate: i.planDate, taskId: i.taskId, title: i.title, doneAt: null }))
        : [reopenPlanInput(t, today)]
      for (const r of rows) await repository.upsertPlanItem(r)
    }),
    /** 改期：旧行 moved_to + 新行补一条 */
    move: (t: Task, toDate: string, today: string) => {
      const { from, to } = reschedulePlan(t, toDate, today)
      return run(async () => { await repository.upsertPlanItem(from); await repository.upsertPlanItem(to) })
    },
    /** 撤销改期：旧行 moved_to 清空 + 抹掉目标日那条（否则目标日留下幽灵计划） */
    unmove: (t: Task, fromDate: string, toDate: string) =>
      run(async () => {
        await repository.upsertPlanItem({ planDate: fromDate, taskId: t.id, movedTo: null })
        await repository.deletePlanItem(toDate, t.id)
      }),
  }
}
