import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { parseGateway } from '../api/projects'

const VAULT = 'E:/knowledge home/30-项目'

function gateways(): { dir: string; md: string }[] {
  return globSync(`${VAULT}/*/*门户口*.md`).map(p => {
    const dir = p.split('/').slice(-2)[0]
    return { dir, md: readFileSync(p, 'utf-8') }
  })
}

describe('真实门户口全量解析复查（2026-08-18 质量审查）', () => {
  it('每个门户口都能解析出 name/phase/emoji/stack/aliases/summary', () => {
    for (const { dir, md } of gateways()) {
      const p = parseGateway(md, dir)
      expect(p.name, `${dir}: name 缺失`).toBeTruthy()
      expect(['进行中', '已完成', '已归档', '暂停'], `${dir}: phase 非法`).toContain(p.phase)
      expect(p.emoji, `${dir}: emoji 缺失`).toBeTruthy()
      expect(p.emoji, `${dir}: emoji 兜底 🚪`).not.toBe('🚪')
      expect(Array.isArray(p.stack), `${dir}: stack 非数组`).toBe(true)
      expect(Array.isArray(p.aliases), `${dir}: aliases 非数组`).toBe(true)
    }
  })

  it('summary 不包含 Markdown 链接残留或 120 字截断伤（当前线上瑕疵复现检查）', () => {
    for (const { dir, md } of gateways()) {
      const p = parseGateway(md, dir)
      expect(p.summary, `${dir}: summary 含 [text](url) 链接残留`).not.toMatch(/\[[^\]]*\]\([^)]*\)/)
      expect(p.summary, `${dir}: summary 以链接左括号截断`).not.toMatch(/\[[^\]]*$/)
      expect(p.summary, `${dir}: summary 以 < 截断`).not.toMatch(/<\s*$/)
      expect(p.summary, `${dir}: summary 为空`).not.toBe('')
    }
  })
})