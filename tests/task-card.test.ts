import { describe, it, expect } from 'vitest'
import { dueDateChip, taskCardTone } from '../src/modules/overview/task-card'
import type { Task } from '../src/lib/db/types'

/** v1.25 卡片到期日徽章（RESEARCH_TASK_CARD.md 结论 4：逾期红 / 非今日未来灰 / 今日与无日期不显示） */
describe('dueDateChip 到期日徽章', () => {
  it('无日期或到期日=今天 → null（今日区不重复标「今天」）', () => {
    expect(dueDateChip(null, '2026-09-13')).toBeNull()
    expect(dueDateChip('2026-09-13', '2026-09-13')).toBeNull()
  })
  it('逾期 → overdue=true，红字格式「M月D日 周X」', () => {
    expect(dueDateChip('2026-09-08', '2026-09-13')).toEqual({ label: '9月8日 周二', overdue: true })
  })
  it('未来日（焦点任务提前到期场景）→ 灰字不标红', () => {
    expect(dueDateChip('2026-09-15', '2026-09-13')).toEqual({ label: '9月15日 周二', overdue: false })
  })
  it('跨年与月份边界照常格式化', () => {
    expect(dueDateChip('2027-01-01', '2026-12-31')).toEqual({ label: '1月1日 周五', overdue: false })
  })
  it('非法日期串 → null（不渲染坏徽章）', () => {
    expect(dueDateChip('not-a-date', '2026-09-13')).toBeNull()
  })
})

/** v1.31 卡片配色：底色=紧急程度、边框=焦点优先于紧急程度 */
describe('taskCardTone 卡片配色', () => {
  const tone = (priority: Task['priority'], focus = false) => taskCardTone({ priority, focus })

  it('底色按紧急程度三档：高红 / 中燕麦黄 / 低默认（低优先级刻意不着色）', () => {
    expect(tone('high').card).toBe('bg-destructive/8')
    expect(tone('medium').card).toBe('bg-accent/12')
    expect(tone('low').card).toBe('bg-card')
  })

  it('边框按紧急程度', () => {
    expect(tone('high').border).toBe('border-destructive/30')
    expect(tone('medium').border).toBe('border-accent/40')
    expect(tone('low').border).toBe('border-border')
  })

  it('焦点只把边框换成金黄，底色仍由紧急程度决定', () => {
    for (const p of ['high', 'medium', 'low'] as const) {
      const focused = tone(p, true)
      expect(focused.border).toBe('border-amber-400/70')
      expect(focused.card).toBe(tone(p, false).card)
    }
  })
})
