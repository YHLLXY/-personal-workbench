import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QuickCapture } from '../src/app/quick-capture'
import { useUiStore } from '../src/app/store'
import { repository } from '../src/lib/db'
import type { Habit } from '../src/lib/db/types'

// 环境变量未配置 → isCloudMode false → repository 为 LocalRepository，可直接真实操作 localStorage
function renderCapture() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><QuickCapture /></QueryClientProvider>)
}

describe('QuickCapture', () => {
  beforeEach(() => { localStorage.clear(); useUiStore.setState({ captureOpen: true, paletteOpen: false, captureTab: 'task', shortcutsOpen: false }) })

  it('Escape 关闭面板', () => {
    renderCapture()
    expect(screen.getByPlaceholderText('要做什么？今天到期')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('要做什么？今天到期')).not.toBeInTheDocument()
  })

  it('打卡为今天的全部活动习惯 +1，非活动习惯跳过', async () => {
    // createHabit 签名不含 active（默认 true），先建两个活动习惯，再把第一个置为非活动
    await repository.createHabit({ name: '运动' })
    await repository.createHabit({ name: '早起' })
    const habits: Habit[] = await repository.listHabits()
    await repository.updateHabit(habits[0].id, { active: false })
    const activeId = habits[1].id

    renderCapture()
    fireEvent.click(screen.getByText('打卡'))
    fireEvent.click(screen.getByText('全部打卡'))

    // 等待 mutation 完成（异步），用 vi.waitFor 轮询日志
    const logs = await vi.waitFor(async () => {
      const l = await repository.listHabitLogs()
      if (l.length < 1) throw new Error('waiting')
      return l
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].habitId).toBe(activeId)
    expect(logs[0].count).toBe(1)
  })
})

describe('QuickCapture 打卡去重', () => {
  beforeEach(() => { localStorage.clear(); useUiStore.setState({ captureOpen: true, paletteOpen: false, captureTab: 'habit', shortcutsOpen: false }) })

  it('一键打卡跳过被行动绑定的习惯（打卡归「自我提升」）', async () => {
    const boundHabit = await repository.createHabit({ name: '行动习惯' })
    const ownHabit = await repository.createHabit({ name: '自有习惯' })
    await repository.createGrowthAction({
      no: 1, title: '行动一', emoji: '📈', category: '学业', why: '', steps: [], targets: [], verify: '', habitId: boundHabit.id,
    })

    renderCapture()
    fireEvent.click(screen.getByText('全部打卡'))

    const logs = await vi.waitFor(async () => {
      const l = await repository.listHabitLogs()
      if (l.length < 1) throw new Error('waiting')
      return l
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].habitId).toBe(ownHabit.id)
  })

  it('全部习惯都被行动绑定时，一键打卡不写入任何日志', async () => {
    const h = await repository.createHabit({ name: '只有行动习惯' })
    await repository.createGrowthAction({
      no: 1, title: '行动一', emoji: '📈', category: '学业', why: '', steps: [], targets: [], verify: '', habitId: h.id,
    })

    renderCapture()
    fireEvent.click(screen.getByText('全部打卡'))
    await new Promise(r => setTimeout(r, 50))

    const logs = await repository.listHabitLogs()
    expect(logs).toHaveLength(0)
  })
})
