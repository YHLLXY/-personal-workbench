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

/** v1.32 卡片标识：底色一律中性，紧急度=左侧状态轨，焦点=金边（v1.31 的整卡淡色实测 1.18:1，读不出来） */
describe('taskCardTone 卡片标识', () => {
  const tone = (priority: Task['priority'], focus = false, done = false) => taskCardTone({ priority, focus }, done)

  it('轨道按紧急度三档：高红 / 中燕麦黄 / 低无轨道（低优先级不抢注意力）', () => {
    expect(tone('high').rail).toBe('bg-destructive')
    expect(tone('medium').rail).toBe('bg-priority') // --priority 而非 --accent：后者白卡上仅 1.64:1
    expect(tone('low').rail).toBeNull()
  })

  it('边框：焦点金黄，其余中性（底色不再承担紧急度）', () => {
    expect(tone('high').border).toBe('border-border')
    expect(tone('low').border).toBe('border-border')
    expect(tone('medium', true).border).toBe('border-amber-400/70')
    expect(tone('high', true).border).toBe('border-amber-400/70')
  })

  it('完成态：轨道保留并降到 40%（颜色褪色而不是消失）', () => {
    expect(tone('high', false, true).rail).toBe('bg-destructive opacity-40')
    expect(tone('medium', false, true).rail).toBe('bg-priority opacity-40')
    expect(tone('low', false, true).rail).toBeNull()
    expect(tone('high', true, true).border).toBe('border-border')
  })
})
