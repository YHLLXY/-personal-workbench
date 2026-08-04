import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from '../src/app/command-palette'
import { useUiStore } from '../src/app/store'

describe('CommandPalette', () => {
  it('未打开时不渲染', () => {
    render(<MemoryRouter><CommandPalette /></MemoryRouter>)
    expect(screen.queryByPlaceholderText('输入命令或搜索…')).not.toBeInTheDocument()
  })
  it('打开时显示动作项', () => {
    useUiStore.setState({ paletteOpen: true })
    render(<MemoryRouter><CommandPalette /></MemoryRouter>)
    expect(screen.getByText('新建任务')).toBeInTheDocument()
  })
})
