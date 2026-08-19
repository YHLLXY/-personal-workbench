import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeeklyTrendChart } from '../src/modules/overview/weekly-trend-chart'
import type { WeeklyDay } from '../src/lib/stats'

const days: WeeklyDay[] = [
  { date: '2026-08-10', label: '周一', tasks: 2, minutes: 40 },
  { date: '2026-08-11', label: '周二', tasks: 0, minutes: 0 },
  { date: '2026-08-12', label: '周三', tasks: 5, minutes: 90 },
  { date: '2026-08-13', label: '周四', tasks: 1, minutes: 25 },
  { date: '2026-08-14', label: '周五', tasks: 3, minutes: 60 },
  { date: '2026-08-15', label: '周六', tasks: 4, minutes: 45 },
  { date: '2026-08-16', label: '周日', tasks: 6, minutes: 120 },
]

describe('WeeklyTrendChart', () => {
  it('渲染 7 根柱子 + 7 个热区 + 7 个星期标签', () => {
    const { container } = render(<WeeklyTrendChart days={days} />)
    expect(container.querySelectorAll('rect[fill="var(--primary)"]')).toHaveLength(7)
    expect(container.querySelectorAll('rect[fill="transparent"]')).toHaveLength(7)
    expect(container.querySelectorAll('text')).toHaveLength(9) // 7 标签 + 2 刻度
  })

  it('默认显示最后一天的数据（tooltip 可见）', () => {
    render(<WeeklyTrendChart days={days} />)
    expect(screen.getAllByText('周日').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('完成 6 个任务 · 专注 120 分钟')).toBeInTheDocument()
  })

  it('点击柱子显示对应数据，再点收起', () => {
    render(<WeeklyTrendChart days={days} />)
    const bars = document.querySelectorAll('rect[fill="transparent"]')
    fireEvent.click(bars[2]) // 周三
    expect(screen.getByText('完成 5 个任务 · 专注 90 分钟')).toBeInTheDocument()
    fireEvent.click(bars[2])
    expect(screen.queryByText('完成 5 个任务 · 专注 90 分钟')).not.toBeInTheDocument()
  })

  it('hover 柱子临时显示数据，移出恢复默认', () => {
    render(<WeeklyTrendChart days={days} />)
    const bars = document.querySelectorAll('rect[fill="transparent"]')
    fireEvent.mouseEnter(bars[0]) // 周一
    expect(screen.getByText('完成 2 个任务 · 专注 40 分钟')).toBeInTheDocument()
    fireEvent.mouseLeave(bars[0])
    expect(screen.getByText('完成 6 个任务 · 专注 120 分钟')).toBeInTheDocument()
  })

  it('aria-label 完整描述本周数据', () => {
    render(<WeeklyTrendChart days={days} />)
    const el = screen.getByRole('img')
    expect(el.getAttribute('aria-label')).toContain('周一完成2个任务，专注40分钟')
    expect(el.getAttribute('aria-label')).toContain('周日完成6个任务，专注120分钟')
  })

  it('全零数据也能正常渲染（最大值降级为 1）', () => {
    const zeros = days.map(d => ({ ...d, tasks: 0, minutes: 0 }))
    const { container } = render(<WeeklyTrendChart days={zeros} />)
    expect(container.querySelectorAll('rect[fill="var(--primary)"]')).toHaveLength(7)
    expect(container.querySelector('polyline')).toBeInTheDocument()
  })
})