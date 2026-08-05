import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingOverlay } from '../src/app/onboarding'
import { useUiStore } from '../src/app/store'

function setPlatform(p: string) {
  Object.defineProperty(window.navigator, 'platform', { value: p, configurable: true })
}

describe('OnboardingOverlay', () => {
  beforeEach(() => { localStorage.clear(); setPlatform('MacIntel'); useUiStore.setState({ onboardingActive: false }) })

  it('首次进入显示第一步，逐步到「开始使用」后写入 localStorage 并消失', () => {
    render(<OnboardingOverlay />)
    expect(screen.getByText('欢迎使用工作台')).toBeInTheDocument()
    fireEvent.click(screen.getByText('下一步'))
    expect(screen.getByText('快速输入')).toBeInTheDocument()
    expect(screen.getByText(/⌘K/)).toBeInTheDocument() // 引导文案含格式化快捷键
    fireEvent.click(screen.getByText('下一步'))
    expect(screen.getByText('数据安全')).toBeInTheDocument()
    fireEvent.click(screen.getByText('开始使用'))
    expect(screen.queryByText('欢迎使用工作台')).not.toBeInTheDocument()
    expect(localStorage.getItem('wb-onboarded')).toBe('1')
  })

  it('跳过直接写入 localStorage 并消失', () => {
    render(<OnboardingOverlay />)
    fireEvent.click(screen.getByText('跳过'))
    expect(screen.queryByText('欢迎使用工作台')).not.toBeInTheDocument()
    expect(localStorage.getItem('wb-onboarded')).toBe('1')
  })

  it('完成引导后（不卸载）重置 onboardingActive', () => {
    render(<OnboardingOverlay />)
    expect(useUiStore.getState().onboardingActive).toBe(true)
    fireEvent.click(screen.getByText('跳过'))
    expect(screen.queryByText('欢迎使用工作台')).not.toBeInTheDocument()
    expect(useUiStore.getState().onboardingActive).toBe(false)
  })

  it('已引导用户挂载时不置 onboardingActive', () => {
    localStorage.setItem('wb-onboarded', '1')
    render(<OnboardingOverlay />)
    expect(useUiStore.getState().onboardingActive).toBe(false)
  })

  it('卸载（完成/跳过）后重置 onboardingActive', () => {
    const { unmount } = render(<OnboardingOverlay />)
    expect(useUiStore.getState().onboardingActive).toBe(true)
    unmount()
    expect(useUiStore.getState().onboardingActive).toBe(false)
  })

  it('已完成引导的不再显示', () => {
    localStorage.setItem('wb-onboarded', '1')
    render(<OnboardingOverlay />)
    expect(screen.queryByText('欢迎使用工作台')).not.toBeInTheDocument()
  })
})
