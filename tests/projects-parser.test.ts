import { describe, it, expect } from 'vitest'
import { parseGateway, FALLBACK_PROJECTS } from '../api/projects'

const GATEWAY = `---
date: 2026-08-12
tags:
  - 项目
  - 门户口
project: "个人工作台"
phase: "进行中"
aliases:
  - "工作台"
stack:
  - "React 19"
  - "Supabase"
---

# 🚪 个人工作台

> **外部项目** | 路径：\`E:\\homework\\开发\\个人工作台\\\`

---

## 项目简介

个人效率工作台 Web 应用（总览/待办/学习/番茄钟/热点/论文库/速记/健康/复盘）。

## 状态

- 开发中
`

describe('parseGateway', () => {
  it('解析标准门户口：project/phase/aliases/stack/简介/emoji/日期', () => {
    const p = parseGateway(GATEWAY, 'x')
    expect(p.name).toBe('个人工作台')
    expect(p.phase).toBe('进行中')
    expect(p.aliases).toEqual(['工作台'])
    expect(p.stack).toEqual(['React 19', 'Supabase'])
    expect(p.updatedAt).toBe('2026-08-12')
    expect(p.emoji).toBe('🚪')
    expect(p.summary).toContain('个人效率工作台 Web 应用')
    expect(p.summary).not.toContain('外部项目')
  })
  it('dir 显式传入时透传，缺省时回退目录名兜底值', () => {
    const md = '---\nproject: "p"\n---\n\n## 项目简介\n\nx'
    expect(parseGateway(md, 'fallback', '真实目录').dir).toBe('真实目录')
    expect(parseGateway(md, 'fallback').dir).toBe('fallback')
  })
  it('updated 优先于 date 作为更新时间', () => {
    const p = parseGateway('---\ndate: 2026-07-01\nupdated: 2026-08-04\nproject: "学生会交流平台"\n---\n\n## 项目简介\n\n测试', 'x')
    expect(p.updatedAt).toBe('2026-08-04')
  })
  it('缺少 project 字段时用目录名兜底', () => {
    const p = parseGateway('---\nphase: "已完成"\n---\n\n## 项目简介\n\n测试', '本地模型测试')
    expect(p.name).toBe('本地模型测试')
    expect(p.phase).toBe('已完成')
    expect(p.stack).toEqual([])
  })
  it('无 frontmatter 时全部降级默认值', () => {
    const p = parseGateway('# 测试', 'fallback-name')
    expect(p.name).toBe('fallback-name')
    expect(p.phase).toBe('进行中')
    expect(p.emoji).toBe('🚪')
    expect(p.summary).toBe('')
  })
  it('提取标题首 emoji（🌅/🥬）', () => {
    expect(parseGateway('# 🌅 Horizon — AI 新闻雷达', 'h').emoji).toBe('🌅')
    expect(parseGateway('# 🥬 蔬菜定价 — 门户口', 'v').emoji).toBe('🥬')
  })
  it('标题在 frontmatter 之后仍能提取 emoji（回归：真实门户口标题非文件首行）', () => {
    const md = `---
project: "Horizon"
phase: "进行中"
---

# 🌅 Horizon — AI 新闻雷达

## 项目简介

AI 新闻雷达。
`
    expect(parseGateway(md, 'Horizon').emoji).toBe('🌅')
  })
  it('简介只取首段并截断 120 字', () => {
    const md = `---\nproject: "p"\n---\n\n## 项目简介\n\n${'长'.repeat(200)}\n\n第二段不取\n\n## 状态\n\n- x`
    const p = parseGateway(md, 'p')
    expect(p.summary.length).toBe(120)
    expect(p.summary).not.toContain('第二段')
  })
  it('兜底快照与 public/projects-status.json 结构一致（字段齐全）', () => {
    expect(FALLBACK_PROJECTS.length).toBeGreaterThanOrEqual(10)
    for (const p of FALLBACK_PROJECTS) {
      expect(typeof p.name).toBe('string')
      expect(typeof p.emoji).toBe('string')
      expect(['进行中', '已完成', '已归档', '暂停']).toContain(p.phase)
      expect(Array.isArray(p.stack)).toBe(true)
      expect(Array.isArray(p.aliases)).toBe(true)
      expect(typeof p.summary).toBe('string')
      expect(p.summary.length).toBeGreaterThan(0)
    }
  })
})